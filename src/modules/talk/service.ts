import { notFound } from '../../errors/app.errors';
import { reason } from '../../lib/anthropic';
import { promptRepo } from '../prompt/repo';
import { buildBrief } from '../record/brief';
import { buildContext } from './context';
import { TALK_PROMPT_KEY } from '../prompt/defaults';
import { userRepo } from '../user/repo';
import { localDay, clockFor } from '../../shared/helper';
import { recordFrom } from '../record/extract';
import { redFlag } from '../farm/safety';
import { reasoningHealth } from '../../lib/reasoning-health';
import { OPS, BY_NAME } from './tools/ops';
import { toolSchema } from './tools/registry';
import { runOp } from './tools/run';
import { platformNotes } from './tools/platform';
import { prisma } from '../../lib/prisma';
import { talkRepo } from './repo';
import {
  toExchangeResponse,
  type CorrectInput, type CreateExchangeInput, type ExchangeResponse, type ListQuery,
} from './types';

/** Said when the reasoning service cannot be reached.
 *
 *  Plain, short, and not in the assistant's usual voice: it is the app speaking
 *  about itself, not the assistant having a thought. It does not apologise
 *  twice, does not explain infrastructure, and it makes clear the message was
 *  kept, because the thing a person actually worries about is whether what they
 *  just wrote is gone. */
const COULD_NOT_ANSWER = 'I could not get through just now. What you wrote is saved, so say more when you want and I will pick it up.';

/** How many recent replies are looked at, and how many of them may carry a
 *  question before the next one is refused. Four and two: a question in half of
 *  the last four replies is already a chain. */
const ASK_WINDOW = 4;
const ASK_CEILING = 2;

/** The question text off a stored replyParts blob, if there is one.
 *
 *  `replyParts` is Json and typed unknown, so this reads defensively. Rows
 *  written before questions existed have no shape at all. */
function questionOf(parts: unknown): string | null {
  if (!parts || typeof parts !== 'object') return null;
  const q = (parts as { question?: { text?: unknown } }).question;
  return q && typeof q.text === 'string' && q.text.trim() ? q.text.trim() : null;
}

/** Take the flattened question back off the end of the reply text.
 *
 *  `reason()` appends the question to the prose so the next turn reads one
 *  string. When the question is dropped, that append has to come off too, or
 *  the model reads back a question it never actually asked. */
function stripQuestion(text: string, question?: { text: string }): string {
  if (!question) return text;
  const tail = `\n\n${question.text}`;
  return text.endsWith(tail) ? text.slice(0, -tail.length).trimEnd() : text;
}

/** A tool result small enough to send, still valid JSON, and honest about what
 *  was left out.
 *
 *  The first version sliced the serialised string at 4000 characters, which
 *  produced truncated JSON and a model that could see something was missing but
 *  not what. Now the biggest array in the result is shortened and a line is
 *  added saying how many were dropped, so the model knows to narrow its question
 *  rather than guessing at the rest. */
function fitResult(result: unknown, limit = 12_000): string {
  const whole = JSON.stringify(result);
  if (whole.length <= limit) return whole;

  if (result && typeof result === 'object') {
    const copy: Record<string, unknown> = { ...(result as Record<string, unknown>) };
    const arrays = Object.entries(copy)
      .filter((e): e is [string, unknown[]] => Array.isArray(e[1]))
      .sort((a, b) => b[1].length - a[1].length);

    for (const [key, arr] of arrays) {
      while (JSON.stringify(copy).length > limit && (copy[key] as unknown[]).length > 5) {
        const cut = copy[key] as unknown[];
        copy[key] = cut.slice(0, Math.max(5, Math.floor(cut.length * 0.7)));
      }
      copy[`${key}_note`] = `showing ${(copy[key] as unknown[]).length} of ${arr.length}. Ask for a narrower slice if you need the rest.`;
      if (JSON.stringify(copy).length <= limit) return JSON.stringify(copy);
    }
    return JSON.stringify(copy).slice(0, limit);
  }
  return whole.slice(0, limit);
}

/** One thing the assistant did, as stored on the exchange. */
interface DidThing { id: string; name: string; input: unknown; result: unknown; say?: string; undone?: boolean }

export interface TalkService {
  say(userId: string, input: CreateExchangeInput, viaAgent?: boolean): Promise<ExchangeResponse>;
  unrecord(userId: string, id: string): Promise<ExchangeResponse>;
  undoThing(userId: string, id: string, opId: string): Promise<ExchangeResponse>;
  list(userId: string, q: ListQuery): Promise<ExchangeResponse[]>;
  one(userId: string, id: string): Promise<ExchangeResponse>;
  correct(userId: string, id: string, input: CorrectInput): Promise<ExchangeResponse>;
  exportAll(userId: string): Promise<ExchangeResponse[]>;
}

export const talkService: TalkService = {
  /** The order here is the whole design.
   *
   *  The row is written BEFORE the model is called, and the reply is attached
   *  afterwards. If Claude is down, slow, or returns nothing, the person's words
   *  are already saved and the exchange simply has no reply yet. The alternative
   *  - compose the answer, then store both - loses the message whenever the
   *  answer fails, which is exactly when the message matters most.
   */
  async say(userId, input, viaAgent = false) {
    const user = await userRepo.findById(userId);
    if (!user) throw notFound('No such account');

    // What this answers, if he tapped rather than typed. Checked against his
    // own exchanges, so a forged id cannot attach his message to somebody
    // else's conversation.
    const answered = input.answering
      ? await talkRepo.askedIn(userId, input.answering).catch(() => null)
      : null;

    const exchange = await talkRepo.create({
      userId,
      said: input.said,
      localDay: localDay(new Date(), user.timezone),
      answeringId: answered ? input.answering : null,
      viaAgent,
    });

    // Anything they sent that never got an answer.
    //
    // Three taps of "I had momos" / "with red chutney" / "post dinner" is one
    // thought, and the first two used to sit there with nothing underneath -
    // indistinguishable from being ignored. They are answered together now, and
    // the reply is attached to this message with the earlier ones pointing at
    // it.
    //
    // Bounded by time as well as count: something sent an hour ago and never
    // answered is not part of what they are saying now, it is a failure to go
    // and look at separately.
    const orphans = await talkRepo.unanswered(userId, exchange.id, 15 * 60_000, 5);

    // RED FLAGS RUN FIRST, on his own words, before any model sees them.
    //
    // Two reasons it is here rather than in the prompt. A model can be talked
    // out of a prompt rule and cannot be talked out of a regex. And this message
    // must not arrive in the tree's warm, playful voice: someone describing
    // chest pain needs the plain one, immediately, with a number to call.
    //
    // It does not replace the reply. The conversation continues underneath -
    // cutting someone off after they have said something frightening is its own
    // kind of abandonment.
    const flag = redFlag(input.said);
    if (flag) {
      await talkRepo.attachReply(exchange.id, {
        replied: flag.say,
        replyParts: { messages: flag.say.split('\n\n') },
        model: 'safety',
        promptVersion: `safety:${flag.reason}`,
      });
      console.warn(`[safety] ${flag.reason} flagged for ${userId}`);
      return this.one(userId, exchange.id);
    }

    const prompt = await promptRepo.active(TALK_PROMPT_KEY).catch(() => null);
    if (prompt) {
      // The record goes in the SYSTEM prompt, not the conversation. In the
      // conversation it would look like something the person said, and the
      // model would answer it. As instructions it is background the assistant
      // simply has - which is what knowing someone means.
      const brief = await buildBrief(userId).catch(() => null);
      const platform = await platformNotes().catch(() => '');

      // A file came with this message. The model is told it exists and what it
      // is called, and explicitly told not to read anything out of it. Numbers
      // reach the record through digest, which checks the name on the document,
      // refuses anything with no collection date, and recognises a duplicate. A
      // model reading "ApoB 121" off a photo is the hallucinated record with a
      // camera attached.
      const attached = input.attachedFileId
        ? await prisma.storedFile.findFirst({
            where: { id: input.attachedFileId, userId },
            select: { filename: true, kind: true, mediaType: true, digestNote: true },
          })
        : null;
      const { turns, summary } = await buildContext(userId, exchange.id);

      // Order matters. The prompt is who it is, the record is what is true, and
      // the summary is what has already been said and no longer fits. All three
      // are background; only the live turns are the conversation.
      // The clock goes near the top, above the record.
      //
      // It is not a fact about his health, it is the context the whole
      // conversation happens in, and without it the model was inferring the hour
      // from what he had eaten. For someone whose reflux is a function of the
      // gap between eating and lying down, that is advice produced out of
      // nothing.
      const clock = clockFor(new Date(), user.timezone);
      const whoAndWhen = [
        user.name ? `You are talking to ${user.name}.` : null,
        clock
          ? `It is ${clock} where they are${user.city ? ` (${user.city})` : ''}.`
          : 'You do not know what time it is for them. Say so if asked; never guess it from what they have eaten.',
      ].filter(Boolean).join(' ');

      // What it has been asking. Stated as a fact by the server rather than
      // left for the model to re-derive from prose, because it cannot: the
      // question is flattened onto the end of the reply text before it is
      // stored, and the options are dropped. A rate the only party asked to
      // obey it cannot measure is the same failure as "use it often", pointing
      // the other way.
      const recent = await talkRepo.recentAsks(userId, exchange.id, ASK_WINDOW).catch(() => []);
      const asked = recent.filter((r) => questionOf(r.replyParts));
      const lastAsk = questionOf(recent[0]?.replyParts);
      const askLine = recent.length === 0
        ? null
        : asked.length === 0
          ? `You have not asked ${user.name ?? 'them'} anything in your last ${recent.length} replies.`
          : `You asked a question in ${asked.length} of your last ${recent.length} replies.`
            + (asked.length >= ASK_CEILING ? ' Do not ask another one now.' : '')
            + (lastAsk ? ` Your most recent was "${lastAsk}". If they answered it, spend the answer and close it out loud.` : '');

      const system = [
        prompt.content,
        `---\n\n${whoAndWhen}`,
        askLine ? `---\n\n${askLine}` : null,
        brief ? `---\n\n${brief}` : null,
        summary ? `---\n\nEARLIER IN THIS CONVERSATION, condensed:\n\n${summary}` : null,
        // What the app can do, so "how do I see my goals" gets a real answer.
        platform ? `---\n\n${platform}` : null,
        attached
          ? `---\n\nTHEY ATTACHED A FILE: ${attached.filename} (${attached.mediaType}).\n`
            + 'It is stored and it will be read on its own, properly, by the part of this\n'
            + 'system that checks the name on the document, refuses anything with no\n'
            + 'collection date, and notices a duplicate. You do NOT read numbers out of it\n'
            + 'and you do not guess at what it says. Acknowledge it arrived, say it is being\n'
            + 'read, and answer whatever they actually asked.'
          : null,
      ].filter(Boolean).join('\n\n');

      // The unanswered ones and this one go in as ONE user turn. Consecutive
      // user turns are not a conversation, and sending them separately asks the
      // model to reply to the last line while the earlier ones scroll past.
      //
    // A tapped answer is sent as the option label on its own. "Boiled" is not a
    // message, it is half of one, and on its own it reads to the model as a
    // change of subject and to the extractor as nothing at all. Put the
    // question back in front of it.
    const saidNow = [
      ...orphans.map((o) => o.said),
      answered ? `${answered}\n${input.said}` : input.said,
    ].join('\n');

      // Operations, and the loop that runs them.
      //
      // The model may ask for several before it has anything to say: read the
      // plan, then tick two items off it, then reply. Each round runs what it
      // asked for, hands back the results, and asks again. Bounded, because a
      // loop that can go round forever on somebody's health record is not a
      // feature.
      const ran: Array<{ id: string; name: string; input: unknown; result: unknown; say?: string }> = [];
      const history: Array<{ role: 'user' | 'assistant'; content: unknown }> = [
        ...turns,
        { role: 'user' as const, content: saidNow },
      ];

      let result = await reason(system, history, { tools: OPS.map(toolSchema) });

      for (let round = 0; round < 4 && result?.ops.length; round++) {
        const results: unknown[] = [];
        for (const ask of result.ops) {
          const out = await runOp(ask, { userId, localDay: exchange.localDay, exchangeId: exchange.id });
          ran.push({ id: ask.id, name: ask.name, input: ask.input, result: out.result, say: out.say });
          // Truncated STRUCTURALLY, never mid-JSON.
          //
          // A blind slice at 4000 characters cut the goals list in half and the
          // model said so out loud: "the goals list gets truncated before it
          // reaches the workout branch, so I can't see its status from here". A
          // tool result that is not valid JSON is worse than a short one,
          // because the model cannot tell what it is missing.
          results.push({
            type: 'tool_result',
            tool_use_id: ask.id,
            content: fitResult(out.result),
          });
        }
        history.push({ role: 'assistant' as const, content: result.raw });
        history.push({ role: 'user' as const, content: results });
        // Longer after an operation ran. Breaking a goal down calls the model
        // again and takes the best part of a minute, and the default here would
        // give up while that was still in flight.
        result = await reason(system, history, { tools: OPS.map(toolSchema), timeoutMs: 120_000 });
      }
      // Four rounds of reading and still nothing said is not an answer. A turn
      // with operations and no words is valid INSIDE the loop; left over after
      // the cap it must not be stored as an empty reply.
      if (result && !result.parts.messages.length) result = null;

      // Everything it did goes on the exchange, so the screen can name each one
      // and offer to undo it. A write the person cannot see is a write they
      // cannot object to.
      if (ran.length) {
        await prisma.exchange.update({
          where: { id: exchange.id },
          data: { didThings: ran.map(({ id, name, input, result: r, say }) => ({ id, name, input, result: r, say })) as never },
        }).catch(() => undefined);
      }
      if (result) {
        // The ceiling, enforced here rather than trusted to the prompt.
        //
        // This codebase already makes that argument once, a few lines above:
        // red flags run as a regex because a model can be talked out of a
        // prompt rule and cannot be talked out of a regex. The same holds for
        // asking. Under the old prompt a question cost nothing, so there was
        // one on almost every reply; under the new one it is supposed to be
        // rare, and "supposed to" is not a mechanism.
        //
        // The messages always ship. Only the question is dropped, down the same
        // path a malformed one already takes.
        const parts = asked.length >= ASK_CEILING && result.parts.question
          ? { messages: result.parts.messages }
          : result.parts;
        if (parts !== result.parts) {
          console.warn(`[talk] dropped a question: ${asked.length} of the last ${recent.length} replies already carried one`);
        }

        // Mark the earlier messages as covered BEFORE the reply lands, so there
        // is no moment where they are answered and still look abandoned.
        if (orphans.length) await talkRepo.markCovered(orphans.map((o) => o.id), exchange.id);
        await talkRepo.attachReply(exchange.id, {
          // `replied` is what the next turn reads back as its own previous
          // answer. It has to match what was actually shown, or the model sees
          // a question it never asked and closes a thread nobody opened.
          replied: parts.question ? result.text : stripQuestion(result.text, result.parts.question),
          replyParts: parts,
          model: result.model,
          promptVersion: `${prompt.key}@${prompt.version}`,
        });
      } else {
        // It could not answer. SAY SO.
        //
        // Before this, a failed call attached nothing: the message was stored
        // with no reply and the screen showed it sitting there with nothing
        // underneath, which is exactly what being ignored looks like. During a
        // reasoning outage that happened to every message, for as long as the
        // outage lasted, with no way for anyone to tell the difference between
        // "this is broken" and "it read that and had nothing to say".
        //
        // His words are already safely stored by this point. This only fills in
        // what sits under them.
        const brain = reasoningHealth();
        await talkRepo.attachReply(exchange.id, {
          replied: COULD_NOT_ANSWER,
          replyParts: { messages: [COULD_NOT_ANSWER] },
          // Not a model and not a prompt version, because no model produced it.
          // Anything reading back promptVersion to judge a reply must not find
          // one here.
          model: 'unavailable',
          // The status AND the type, so a row can say 429 rate_limit_error
          // rather than a bare 'unavailable' nobody can act on.
          promptVersion: brain.status
            ? `unavailable:${brain.status}${brain.type ? ':' + brain.type : ''}`
            : 'unavailable',
        });
        console.error('[talk] no reply produced; reasoning health:', JSON.stringify(brain));
      }
    }

    // Write down what the message reported, AFTER the reply is ready.
    //
    // Not awaited: he is sitting there waiting for an answer, and reading the
    // message a second time would double that wait for something he never sees
    // happen. It also must not be able to cost him the reply - or the message
    // itself, which is the one thing this app promises to keep.
    //
    // Until this existed the app said "I'll log that" and logged nothing: not a
    // single observation had ever been written from a conversation.
    // NOTHING IS READ OUT OF A REHEARSAL. A message sent with an agent key goes
    // through the whole path so the path can be checked, and stops short of the
    // record. His record contains what he said, and he did not say this.
    if (viaAgent) return this.one(userId, exchange.id);

    void recordFrom(
      exchange.id, userId,
      // Same reason as above: "Boiled" alone records nothing. With the question
      // in front of it, "Worse after boiled eggs or after bhurji? Boiled" is a
      // sentence the extractor can read. The question was asked by the
      // assistant, so it is never treated as something he said: it is context
      // for reading the one word that is his.
      // The question is stripped of digits before it is handed to extraction.
      // It is the assistant's sentence, included only so "Boiled" reads as an
      // answer rather than a change of subject. A number inside it is not his
      // and must not become an amount.
      answered ? `${answered.replace(/\d[\d.,]*/g, 'some')}\n${input.said}` : input.said,
      localDay(new Date(), user.timezone),
    )
      .then((n) => { if (n) console.log(`[extract] ${n} recorded from ${exchange.id}`); })
      .catch((e: Error) => console.error('[extract] could not record:', e.message));

    return this.one(userId, exchange.id);
  },

  async list(userId, q) {
    const rows = await talkRepo.list(userId, { day: q.day, limit: q.limit, cursor: q.cursor });
    return rows.map(toExchangeResponse);
  },

  async one(userId, id) {
    const row = await talkRepo.findOwned(id, userId);
    // Scoped by userId, so someone else's exchange is not-found rather than
    // forbidden. Confirming that an id exists is confirming whose it is.
    if (!row) throw notFound('No such entry');
    return toExchangeResponse(row);
  },

  /** A correction is a ROW. The original reply is untouched.
   *
   *  The wrong answer, the right one and the reason are one artefact - editing
   *  the original destroys the half that is hard to get, and that half is the
   *  only data here that cannot be bought.
   */
  /** Take back what was read from a message.
   *
   *  Undo, not approval. His words are stored the instant he sends them and an
   *  observation derived from them can always be rebuilt, so the extraction is
   *  written straight away and shown on the message that produced it. Asking
   *  first would tax every correct reading to catch the rare wrong one, and it
   *  would be another question, which is the thing he has told me to stop.
   *
   *  The message itself is never touched. Only what was inferred from it.
   */
  async unrecord(userId, id) {
    const exchange = await prisma.exchange.findFirst({ where: { id, userId }, select: { id: true } });
    if (!exchange) throw notFound('No such message');

    const written = await prisma.observation.findMany({
      where: { exchangeId: id, userId }, select: { id: true },
    });
    const ids = written.map((o) => o.id);

    await prisma.$transaction([
      // The plan tick goes with it, or the record and the plan disagree and the
      // plan is the one he looks at. `doneVia: 'said'` items carry the
      // observation they came from precisely so this is possible.
      ...(ids.length
        ? [prisma.planItem.updateMany({
            where: { userId, observationId: { in: ids } },
            data: { status: 'pending', doneAt: null, doneVia: null, observationId: null },
          })]
        : []),
      prisma.observation.deleteMany({ where: { exchangeId: id, userId } }),
      // Empty array, never null. "Read, and nothing in it" and "not looked at
      // yet" are different facts and this codebase keeps them apart.
      prisma.exchange.update({ where: { id }, data: { parsed: [] } }),
    ]);

    console.log(`[record] removed ${ids.length} observation(s) read from one message`);
    return this.one(userId, id);
  },

  /** Undo one thing the assistant did on a message.
   *
   *  Every operation is recorded with what it was given and what came back, and
   *  each one carries its own `undo`, which the type system required when the
   *  operation was written. So this is a lookup and a call, not a guess at how
   *  to reverse something.
   *
   *  The entry is marked rather than removed. What the assistant did and what
   *  he thought of it are both part of the record, and a row that vanishes
   *  takes the reason it existed with it. */
  async undoThing(userId, id, opId) {
    const ex = await prisma.exchange.findFirst({
      where: { id, userId }, select: { didThings: true, localDay: true },
    });
    if (!ex) throw notFound('No such message');

    const things = Array.isArray(ex.didThings) ? (ex.didThings as unknown as DidThing[]) : [];
    const thing = things.find((t) => t.id === opId);
    if (!thing) throw notFound('Nothing like that on this message');
    if (thing.undone) return this.one(userId, id);

    const op = BY_NAME.get(thing.name);
    if (op?.tier === 'undoable') {
      await op.undo(
        { input: thing.input, result: thing.result },
        { userId, localDay: ex.localDay, exchangeId: id },
      );
    }

    await prisma.exchange.update({
      where: { id },
      data: { didThings: things.map((t) => (t.id === opId ? { ...t, undone: true } : t)) as never },
    });
    console.log(`[tools] undid ${thing.name} on one message`);
    return this.one(userId, id);
  },

  async correct(userId, id, input) {
    const row = await talkRepo.findOwned(id, userId);
    if (!row) throw notFound('No such entry');
    await talkRepo.addCorrection({
      exchangeId: row.id,
      userId,
      wasWrong: input.wasWrong,
      isRight: input.isRight,
      domain: input.domain,
    });
    return this.one(userId, id);
  },

  async exportAll(userId) {
    return (await talkRepo.all(userId)).map(toExchangeResponse);
  },
};
