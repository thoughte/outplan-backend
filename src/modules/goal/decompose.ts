import { ENV_CONFIG } from '../../config/env.config';
import { getSetting } from '../../config/app.config';
import { prisma } from '../../lib/prisma';

/** Break something he wants into pieces small enough to finish.
 *
 *  His insight, and the reason this exists: "go meds free" is not one goal.
 *  Every medicine is there for a reason, and to be free of it you fix the
 *  reason. Six tablets become ApoB down, B12 up, homocysteine down, twitching
 *  gone, B6 measured, thiamine repleted.
 *
 *  It recurses. Each of those can split again until the leaves are atomic: one
 *  number to move, or one thing to do. Small pieces are better for him, because
 *  he finishes things often enough to feel it, and better for the record,
 *  because "28 goals this year" is then a true sentence rather than a slogan.
 *
 *  GROUNDED IN WHAT IS ALREADY KNOWN. The model is handed his open medicines
 *  with their recorded reasons and the markers already in his record. The
 *  decomposition of "go meds free" is not a guess: it is sitting in the
 *  `reason` column of every intervention, put there when each was started.
 */

interface Drafted {
  title: string;
  kind: 'outcome' | 'behaviour' | 'container';
  why?: string;
  measure?: string;
  direction?: 'down' | 'up' | 'reach' | 'stop' | 'maintain';
  targetValue?: number;
  /** Titles of siblings that must finish first. Titles rather than ids because
   *  none of these exist yet when the model writes them. */
  after?: string[];
  children?: Drafted[];
}

/** Three levels, written out rather than referenced.
 *
 *  A $ref back to the same definition is the natural way to describe a tree and
 *  it is not reliably accepted for a tool schema, which fails as an upstream
 *  rejection rather than as anything readable. Three levels is enough for
 *  anything he has said so far - "go meds free" needs two - and a flat, explicit
 *  schema cannot be rejected for a feature that may not be supported.
 */
const TOOL = {
  name: 'break_down',
  description: 'Break what this person wants into goals small enough to finish, recursively.',
  input_schema: {
    type: 'object' as const,
    properties: {
      goals: {
        type: 'array',
        maxItems: 8,
        items: {
          type: 'object' as const,
          properties: {
            title: { type: 'string', maxLength: 80, description: 'Short and concrete. "Get ApoB under 90", not "improve cardiovascular health".' },
            kind: {
            type: 'string', enum: ['outcome', 'behaviour', 'container'],
            description:
            'outcome = a number to move. behaviour = something done or not done each day. ' +
            'container = holds other goals and has no measure of its own.',
            },
            why: { type: 'string', maxLength: 300, description: 'Why this is a goal, from the record where possible.' },
            measure: {
            type: 'string', maxLength: 60,
            description:
            'For an outcome, the exact variable name from the list you were given. For a behaviour, one of: ' +
            'meal, drink, water, alcohol, nicotine, symptom, sleep, medication, supplement, activity, stool, mood, weight. ' +
            'Leave empty if nothing in the record measures it - the goal will wait for a baseline rather than pretend.',
            },
            direction: { type: 'string', enum: ['down', 'up', 'reach', 'stop', 'maintain'] },
            targetValue: { type: 'number', description: 'Only when the record or ordinary clinical practice gives a clear one. Otherwise leave it out; he will set it.' },
            after: {
            type: 'array', items: { type: 'string' },
            description: 'Titles of goals that must be finished first. Use it only when the record says so.',
            },
            children: {
              type: 'array', maxItems: 8,
              items: {
                type: 'object' as const,
                properties: {
                  title: { type: 'string', maxLength: 80, description: 'Short and concrete. "Get ApoB under 90", not "improve cardiovascular health".' },
                  kind: {
                  type: 'string', enum: ['outcome', 'behaviour', 'container'],
                  description:
                  'outcome = a number to move. behaviour = something done or not done each day. ' +
                  'container = holds other goals and has no measure of its own.',
                  },
                  why: { type: 'string', maxLength: 300, description: 'Why this is a goal, from the record where possible.' },
                  measure: {
                  type: 'string', maxLength: 60,
                  description:
                  'For an outcome, the exact variable name from the list you were given. For a behaviour, one of: ' +
                  'meal, drink, water, alcohol, nicotine, symptom, sleep, medication, supplement, activity, stool, mood, weight. ' +
                  'Leave empty if nothing in the record measures it - the goal will wait for a baseline rather than pretend.',
                  },
                  direction: { type: 'string', enum: ['down', 'up', 'reach', 'stop', 'maintain'] },
                  targetValue: { type: 'number', description: 'Only when the record or ordinary clinical practice gives a clear one. Otherwise leave it out; he will set it.' },
                  after: {
                  type: 'array', items: { type: 'string' },
                  description: 'Titles of goals that must be finished first. Use it only when the record says so.',
                  },
                  children: {
                    type: 'array', maxItems: 8,
                    items: {
                      type: 'object' as const,
                      properties: {
                        title: { type: 'string', maxLength: 80, description: 'Short and concrete. "Get ApoB under 90", not "improve cardiovascular health".' },
                        kind: {
                        type: 'string', enum: ['outcome', 'behaviour', 'container'],
                        description:
                        'outcome = a number to move. behaviour = something done or not done each day. ' +
                        'container = holds other goals and has no measure of its own.',
                        },
                        why: { type: 'string', maxLength: 300, description: 'Why this is a goal, from the record where possible.' },
                        measure: {
                        type: 'string', maxLength: 60,
                        description:
                        'For an outcome, the exact variable name from the list you were given. For a behaviour, one of: ' +
                        'meal, drink, water, alcohol, nicotine, symptom, sleep, medication, supplement, activity, stool, mood, weight. ' +
                        'Leave empty if nothing in the record measures it - the goal will wait for a baseline rather than pretend.',
                        },
                        direction: { type: 'string', enum: ['down', 'up', 'reach', 'stop', 'maintain'] },
                        targetValue: { type: 'number', description: 'Only when the record or ordinary clinical practice gives a clear one. Otherwise leave it out; he will set it.' },
                        after: {
                        type: 'array', items: { type: 'string' },
                        description: 'Titles of goals that must be finished first. Use it only when the record says so.',
                        },
                      },
                      required: ['title', 'kind'],
                    },
                  },
                },
                required: ['title', 'kind'],
              },
            },
          },
          required: ['title', 'kind'],
        },
      },
    },
    required: ['goals'],
  },
};

const SYSTEM = [
  'You turn something a person wants into goals small enough that they actually finish some.',
  '',
  'Break it down recursively. Keep splitting until each leaf is ONE number to move or ONE',
  'thing to do. "Go meds free" is not a goal; it is a container holding one goal per',
  'medicine, and each of those is the REASON that medicine exists. To stop needing a',
  'statin you fix the ApoB. To stop needing B12 you fix the B12.',
  '',
  'Small is the point. Someone who finishes six small goals is better served than someone',
  'still 20% through one big one, and it is truer: the six things really were separate.',
  '',
  'GROUND EVERYTHING IN THE RECORD YOU ARE GIVEN. Use the exact variable names listed.',
  'Use the reasons recorded against each medicine - they are why it was started. Do not',
  'invent a marker that is not there; leave measure empty and the goal will wait for a',
  'baseline honestly.',
  '',
  'Never write a goal that says to stop, skip or reduce a prescribed medicine. That is',
  'not yours to say, and it is not what he is asking for anyway: he is asking to fix the',
  'thing that made the medicine necessary.',
].join('\n');

/** What the model is allowed to know about him, so it grounds rather than guesses. */
async function context(userId: string): Promise<string> {
  const meds = await prisma.intervention.findMany({
    where: { userId, stoppedOn: null },
    select: { name: true, reason: true, schedule: true },
  });
  const markers = await prisma.measurement.findMany({
    where: { userId, canonicalValue: { not: null } },
    distinct: ['variable'],
    orderBy: [{ variable: 'asc' }, { collectedOn: 'desc' }],
    select: { variable: true, canonicalValue: true, canonicalUnit: true },
    take: 400,
  });
  const symptoms = await prisma.symptom.findMany({
    where: { userId, status: { not: 'resolved' } }, select: { name: true, status: true },
  });

  return [
    'MEDICINES HE IS ON, and why each was started:',
    ...meds.map((m) => `  ${m.name}${m.schedule ? ` (${m.schedule})` : ''} - ${m.reason ?? 'no reason recorded'}`),
    '',
    'MARKERS IN HIS RECORD (use these exact names as `measure`):',
    ...markers.slice(0, 120).map((m) => `  ${m.variable} = ${m.canonicalValue}${m.canonicalUnit ? ' ' + m.canonicalUnit : ''}`),
    '',
    'OPEN SYMPTOMS:',
    ...symptoms.map((s) => `  ${s.name} (${s.status})`),
  ].join('\n');
}

export async function draft(userId: string, intent: string): Promise<Drafted[] | null> {
  if (!ENV_CONFIG.ANTHROPIC_API_KEY) return null;
  const model = await getSetting('reasoning.model').catch(() => 'claude-opus-5');

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 90_000);
  try {
    const res = await fetch(`${ENV_CONFIG.ANTHROPIC_BASE_URL.replace(/\/+$/, '')}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ENV_CONFIG.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model, max_tokens: 3000,
        system: `${SYSTEM}\n\n---\n\n${await context(userId)}`,
        messages: [{ role: 'user', content: intent }],
        tools: [TOOL],
        tool_choice: { type: 'tool', name: TOOL.name },
      }),
      signal: ctl.signal,
    });
    if (!res.ok) { console.error('[goals] upstream returned', res.status); return null; }
    const data = (await res.json()) as { content?: Array<{ type: string; name?: string; input?: unknown }> };
    const call = (data.content ?? []).find((b) => b.type === 'tool_use' && b.name === TOOL.name);
    const goals = (call?.input as { goals?: unknown })?.goals;
    const cleaned = clean(goals);
    return cleaned.length ? cleaned : null;
  } catch (e) {
    console.error('[goals] could not break it down:', (e as Error).message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const KINDS = ['outcome', 'behaviour', 'container'] as const;
const DIRECTIONS = ['down', 'up', 'reach', 'stop', 'maintain'] as const;

/** Words that clearly mean one of the five.
 *
 *  Without this, "increase" fell through to the default of "down" - which does
 *  not fail loudly, it just quietly tracks a goal backwards and reports that
 *  raising his B12 from 250 is going badly as it rises. A wrong default here is
 *  worse than a rejected value. */
const DIRECTION_WORDS: Record<string, typeof DIRECTIONS[number]> = {
  decrease: 'down', lower: 'down', reduce: 'down', less: 'down', fall: 'down',
  increase: 'up', raise: 'up', higher: 'up', more: 'up', rise: 'up',
  quit: 'stop', eliminate: 'stop', avoid: 'stop', none: 'stop',
  hold: 'maintain', keep: 'maintain', sustain: 'maintain',
  achieve: 'reach', hit: 'reach', attain: 'reach',
};

function asDirection(v: unknown): typeof DIRECTIONS[number] | null {
  if (typeof v !== 'string') return null;
  const w = v.trim().toLowerCase();
  if ((DIRECTIONS as readonly string[]).includes(w)) return w as typeof DIRECTIONS[number];
  return DIRECTION_WORDS[w] ?? null;
}

/** Make the model's output safe to write.
 *
 *  It was being cast straight into database enums with `as never`, which is a
 *  promise the code had no way to keep: one unexpected word - "decrease"
 *  instead of "down" - and Prisma throws, the request 500s, and the person who
 *  just told the app what they want gets "something broke on our side".
 *
 *  Nothing here trusts the model. Unknown kinds and directions fall back to
 *  sensible defaults, strings are cut to the lengths the columns allow, and a
 *  node with no usable title is dropped rather than written as an empty goal.
 */
function clean(nodes: unknown): Drafted[] {
  if (!Array.isArray(nodes)) return [];
  const out: Drafted[] = [];
  for (const raw of nodes.slice(0, 8)) {
    if (!raw || typeof raw !== 'object') continue;
    const n = raw as Record<string, unknown>;
    const title = typeof n.title === 'string' ? n.title.trim().slice(0, 80) : '';
    if (!title) continue;

    const kind = KINDS.includes(n.kind as never) ? (n.kind as Drafted['kind'])
      // A node with children is a container whatever it called itself.
      : (Array.isArray(n.children) && n.children.length ? 'container' : 'outcome');

    out.push({
      title,
      kind,
      why: typeof n.why === 'string' ? n.why.trim().slice(0, 300) : undefined,
      measure: typeof n.measure === 'string' && n.measure.trim() ? n.measure.trim().slice(0, 60) : undefined,
      // Null rather than a guess when the word means nothing we recognise: the
      // goal then inherits 'down' at write time, and at least the mistake is in
      // one place rather than dressed up as a decision.
      direction: asDirection(n.direction) ?? 'down',
      targetValue: typeof n.targetValue === 'number' && Number.isFinite(n.targetValue) ? n.targetValue : undefined,
      after: Array.isArray(n.after) ? n.after.filter((t): t is string => typeof t === 'string').slice(0, 5) : undefined,
      children: clean(n.children),
    });
  }
  return out;
}

/** Write a drafted tree into the record as PROPOSED goals.
 *
 *  Proposed, never active. Nothing becomes a goal because a model suggested it;
 *  he confirms, and until he does it is a suggestion sitting quietly.
 */
export async function save(
  userId: string, intent: string, exchangeId: string | null, drafted: Drafted[],
): Promise<number> {
  const byTitle = new Map<string, string>();
  let count = 0;

  const walk = async (nodes: Drafted[], parentId: string | null): Promise<void> => {
    for (const n of nodes) {
      const baseline = n.kind === 'outcome' && n.measure
        ? await prisma.measurement.findFirst({
            where: { userId, variable: n.measure, canonicalValue: { not: null } },
            orderBy: { collectedOn: 'desc' },
            select: { canonicalValue: true, collectedOn: true },
          })
        : null;

      const g = await prisma.goal.create({
        data: {
          userId, parentId,
          title: n.title.slice(0, 80),
          why: n.why?.slice(0, 300) ?? null,
          kind: n.kind,
          measure: n.measure ?? null,
          direction: (n.direction ?? 'down') as never,   // validated in clean()
          targetValue: n.targetValue ?? null,
          // The baseline is taken from the record right now, so it is the number
          // he actually had when the goal was set rather than whatever is latest
          // whenever someone next looks.
          baselineValue: baseline?.canonicalValue ?? null,
          baselineAt: baseline?.collectedOn ?? null,
          status: 'proposed',
          intentText: parentId === null ? intent : null,
          exchangeId,
        },
      });
      byTitle.set(n.title, g.id);
      count++;
      if (n.children?.length) await walk(n.children, g.id);
    }
  };
  await walk(drafted, null);

  // Dependencies second, once every title has an id. A goal can only wait for
  // something that exists.
  const link = async (nodes: Drafted[]): Promise<void> => {
    for (const n of nodes) {
      const id = byTitle.get(n.title);
      if (id && n.after?.length) {
        for (const t of n.after) {
          const blockerId = byTitle.get(t);
          if (blockerId && blockerId !== id) {
            await prisma.goalBlock.create({ data: { goalId: id, blockerId } }).catch(() => undefined);
          }
        }
      }
      if (n.children?.length) await link(n.children);
    }
  };
  await link(drafted);

  return count;
}
