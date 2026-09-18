import { notFound } from '../../errors/app.errors';
import { reason } from '../../lib/anthropic';
import { promptRepo } from '../prompt/repo';
import { buildBrief } from '../record/brief';
import { buildContext } from './context';
import { TALK_PROMPT_KEY } from '../prompt/defaults';
import { userRepo } from '../user/repo';
import { localDay } from '../../shared/helper';
import { recordFrom } from '../record/extract';
import { talkRepo } from './repo';
import {
  toExchangeResponse,
  type CorrectInput, type CreateExchangeInput, type ExchangeResponse, type ListQuery,
} from './types';

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

    const exchange = await talkRepo.create({
      userId,
      said: input.said,
      localDay: localDay(new Date(), user.timezone),
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
      const system = [
        prompt.content,
        brief ? `---\n\n${brief}` : null,
        summary ? `---\n\nEARLIER IN THIS CONVERSATION, condensed:\n\n${summary}` : null,
      ].filter(Boolean).join('\n\n');

      // The unanswered ones and this one go in as ONE user turn. Consecutive
      // user turns are not a conversation, and sending them separately asks the
      // model to reply to the last line while the earlier ones scroll past.
      const saidNow = [...orphans.map((o) => o.said), input.said].join('\n');

      const result = await reason(system, [
        ...turns,
        { role: 'user' as const, content: saidNow },
      ]);
      if (result) {
        // Mark the earlier messages as covered BEFORE the reply lands, so there
        // is no moment where they are answered and still look abandoned.
        if (orphans.length) await talkRepo.markCovered(orphans.map((o) => o.id), exchange.id);
        await talkRepo.attachReply(exchange.id, {
          replied: result.text,
          replyParts: result.parts,
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
    void recordFrom(exchange.id, userId, input.said, localDay(new Date(), user.timezone))
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
