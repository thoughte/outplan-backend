import { ENV_CONFIG } from '../../config/env.config';
import { getSetting } from '../../config/app.config';
import { prisma } from '../../lib/prisma';
import { Prisma } from '../../../generated/prisma/client';

/** Turn what he typed into rows in his record.
 *
 *  The app told him "I'll log that" and logged nothing. Not one observation had
 *  ever been written from a conversation - `parsed` was null on every message he
 *  had ever sent, and the function meant to fill it was never called. Meanwhile
 *  the home screen says "tell it what you ate, how you slept, what hurts".
 *
 *  This runs AFTER the reply has gone out. Reading a message twice would double
 *  the wait for an answer, and an answer is what he is sitting there for. A
 *  failure here must never cost him the reply or the message itself.
 */

/** The vocabulary. Small and fixed, on purpose.
 *
 *  His 78 imported observations use 75 different variable names - shake_2030,
 *  day1_dinner, lunch_12pm, muskmelon. Those were labels I invented per entry
 *  during an analysis, and they are unchartable: nothing groups, nothing trends,
 *  every row is its own category. Letting a model invent names per message would
 *  turn 75 into 750.
 *
 *  So the KIND is fixed and the detail is free text. "meal" plus "2 paneer momos
 *  with red hot chutney" can be counted, compared and plotted against the hour
 *  it happened. "supper_10pm" can only be read.
 */
const KINDS = [
  'meal', 'drink', 'water', 'alcohol', 'nicotine',
  'symptom', 'sleep', 'medication', 'supplement',
  'activity', 'stool', 'mood', 'weight', 'other',
] as const;

const EXTRACT_TOOL = {
  name: 'record',
  description:
    'Record what this person just reported about their body or their day. ' +
    'Only what they actually said - never what you inferred, advised or suspect.',
  input_schema: {
    type: 'object' as const,
    properties: {
      observations: {
        type: 'array',
        maxItems: 8,
        description:
          'One entry per distinct thing reported. Empty when the message is a ' +
          'question, a greeting, small talk, or anything else that says nothing ' +
          'new about their body or their day.',
        items: {
          type: 'object' as const,
          properties: {
            kind: { type: 'string', enum: KINDS as unknown as string[], description: 'Which kind of thing this is.' },
            value: {
              type: 'string',
              maxLength: 200,
              description:
                'What was reported, in plain words. "2 paneer momos with red hot chutney", ' +
                '"slept 4 hours", "headache radiating to neck". Keep their own wording where you can.',
            },
            notes: {
              type: 'string',
              maxLength: 400,
              description: 'Detail worth keeping that does not fit the value - timing, severity, context.',
            },
          },
          required: ['kind', 'value'],
        },
      },
    },
    required: ['observations'],
  },
};

const SYSTEM = [
  'You read one message from someone tracking their health and write down what it reports.',
  '',
  'Record ONLY what they said. Not what it means, not what they should do, not what',
  'you suspect. If they say they ate momos, that is a meal; whether the chilli will',
  'give them reflux is not an observation, it is an opinion, and it does not belong',
  'in their record.',
  '',
  'Most messages contain nothing to record. Questions, greetings, "tell me a joke",',
  '"ok", arguing with you - all of these are empty. Returning nothing is the normal',
  'case and is always better than inventing something to justify the call.',
  '',
  'Never record the same thing twice in one message. Never carry anything over from',
  'earlier messages: you are shown one message and you write down what is in it.',
].join('\n');

export interface Extracted { kind: string; value: string; notes?: string }

/** Ask the model what this message reports. Null on any failure - the caller
 *  treats that as "nothing recorded", never as an error worth surfacing. */
async function readMessage(said: string): Promise<Extracted[] | null> {
  if (!ENV_CONFIG.ANTHROPIC_API_KEY) return null;
  const model = await getSetting('reasoning.model').catch(() => 'claude-opus-5');

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30_000);
  try {
    const res = await fetch(`${ENV_CONFIG.ANTHROPIC_BASE_URL.replace(/\/+$/, '')}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ENV_CONFIG.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 700,
        system: SYSTEM,
        messages: [{ role: 'user', content: said }],
        tools: [EXTRACT_TOOL],
        tool_choice: { type: 'tool', name: EXTRACT_TOOL.name },
      }),
      signal: ctl.signal,
    });
    if (!res.ok) { console.error('[extract] upstream returned', res.status); return null; }

    const data = (await res.json()) as { content?: Array<{ type: string; name?: string; input?: unknown }> };
    const call = (data.content ?? []).find((b) => b.type === 'tool_use' && b.name === EXTRACT_TOOL.name);
    const raw = (call?.input as { observations?: unknown })?.observations;
    if (!Array.isArray(raw)) return null;

    const seen = new Set<string>();
    return raw
      .filter((o): o is Extracted =>
        !!o && typeof o === 'object'
        && typeof (o as Extracted).kind === 'string'
        && typeof (o as Extracted).value === 'string'
        && (o as Extracted).value.trim() !== ''
        && (KINDS as readonly string[]).includes((o as Extracted).kind))
      .map((o) => ({ kind: o.kind, value: o.value.trim().slice(0, 200), notes: o.notes?.trim().slice(0, 400) || undefined }))
      // The same thing twice in one message is a model slip, not two events.
      .filter((o) => { const k = `${o.kind}|${o.value.toLowerCase()}`; if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, 8);
  } catch (e) {
    console.error('[extract] failed:', (e as Error).message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Read one exchange and write what it reports into the record.
 *
 *  Idempotent per exchange: anything previously written for this message is
 *  replaced, so a retry cannot double his dinner.
 */
export async function recordFrom(
  exchangeId: string, userId: string, said: string, localDay: string,
): Promise<number> {
  const found = await readMessage(said);
  if (!found || !found.length) {
    // Distinguishable from "not looked at yet": an empty array means read, and
    // nothing in it. Most messages are exactly this.
    await prisma.exchange.update({ where: { id: exchangeId }, data: { parsed: [] } }).catch(() => undefined);
    return 0;
  }

  await prisma.$transaction([
    prisma.observation.deleteMany({ where: { exchangeId } }),
    prisma.observation.createMany({
      data: found.map((o) => ({
        userId, localDay, exchangeId,
        variable: o.kind,
        value: o.value,
        notes: o.notes ?? null,
      })),
    }),
    prisma.exchange.update({ where: { id: exchangeId }, data: { parsed: found as never } }),
  ]);

  return found.length;
}

/** Read messages that were never read.
 *
 *  Everything said before this existed has `parsed` null - the app was
 *  answering and forgetting. Those messages still hold what he ate, how he
 *  slept and what hurt, and there is no reason for that to stay lost just
 *  because the code arrived late.
 *
 *  Capped per run and ordered oldest-first, so a long history catches up over a
 *  few restarts instead of one boot spending minutes on it. Runs after the
 *  server is listening, like the file digest, for the same reason: a deploy
 *  that waits on a backlog is a deploy that is down while it works.
 */
export async function recordPending(userId: string, limit = 25): Promise<{ read: number; recorded: number }> {
  const pending = await prisma.exchange.findMany({
    where: { userId, parsed: { equals: Prisma.DbNull } },
    orderBy: { saidAt: 'asc' },
    take: limit,
    select: { id: true, said: true, localDay: true },
  });

  let recorded = 0;
  for (const e of pending) {
    recorded += await recordFrom(e.id, userId, e.said, e.localDay).catch(() => 0);
  }
  return { read: pending.length, recorded };
}
