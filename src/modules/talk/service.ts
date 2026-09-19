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
import { talkRepo } from './repo';
import {
  toExchangeResponse,
  type CorrectInput, type CreateExchangeInput, type ExchangeResponse, type ListQuery,
} from './types';

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

export interface TalkService {
  say(userId: string, input: CreateExchangeInput): Promise<ExchangeResponse>;
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
  async say(userId, input) {
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

      const result = await reason(system, [
        ...turns,
        { role: 'user' as const, content: saidNow },
      ]);
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
    void recordFrom(
      exchange.id, userId,
      // Same reason as above: "Boiled" alone records nothing. With the question
      // in front of it, "Worse after boiled eggs or after bhurji? Boiled" is a
      // sentence the extractor can read. The question was asked by the
      // assistant, so it is never treated as something he said: it is context
      // for reading the one word that is his.
      answered ? `${answered}\n${input.said}` : input.said,
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
