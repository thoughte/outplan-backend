import { notFound } from '../../errors/app.errors';
import { reason } from '../../lib/anthropic';
import { promptRepo } from '../prompt/repo';
import { TALK_PROMPT_KEY } from '../prompt/defaults';
import { userRepo } from '../user/repo';
import { localDay } from '../../shared/helper';
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

    const prompt = await promptRepo.active(TALK_PROMPT_KEY).catch(() => null);
    if (prompt) {
      const result = await reason(prompt.content, [{ role: 'user', content: input.said }]);
      if (result) {
        await talkRepo.attachReply(exchange.id, {
          replied: result.text,
          model: result.model,
          promptVersion: `${prompt.key}@${prompt.version}`,
        });
      }
    }

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
