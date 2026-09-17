import { prisma } from '../../lib/prisma';
import type { Correction, Exchange } from '../../../generated/prisma/client';

type WithCorrections = Exchange & { corrections: Correction[] };

export const talkRepo = {
  /** Store the words FIRST, before anything interprets them. Everything else on
   *  this row is derived and can be recomputed; the person's own sentence
   *  cannot. */
  create: (data: { userId: string; said: string; localDay: string }): Promise<Exchange> =>
    prisma.exchange.create({ data }),

  attachReply: (
    id: string,
    data: { replied: string; replyParts: unknown; model: string; promptVersion: string | null },
  ): Promise<Exchange> =>
    prisma.exchange.update({
      where: { id },
      data: { ...data, replyParts: data.replyParts as never, repliedAt: new Date() },
    }),

  attachParse: (id: string, parsed: unknown): Promise<Exchange> =>
    prisma.exchange.update({ where: { id }, data: { parsed: parsed as never } }),

  findOwned: (id: string, userId: string): Promise<WithCorrections | null> =>
    prisma.exchange.findFirst({
      where: { id, userId },
      include: { corrections: { orderBy: { createdAt: 'asc' } } },
    }),

  list: (
    userId: string,
    opts: { day?: string; limit: number; cursor?: string },
  ): Promise<WithCorrections[]> =>
    prisma.exchange.findMany({
      where: { userId, ...(opts.day ? { localDay: opts.day } : {}) },
      include: { corrections: { orderBy: { createdAt: 'asc' } } },
      orderBy: { saidAt: 'desc' },
      take: opts.limit,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    }),

  /** The last N exchanges, returned OLDEST FIRST.
   *
   *  Taken newest-first by the database so "the last 30" is cheap, then
   *  reversed - a conversation handed to a model in reverse order is worse than
   *  no conversation, because it reads as a coherent sequence that says the
   *  opposite of what happened.
   */
  async recent(userId: string, limit: number, beforeId?: string): Promise<WithCorrections[]> {
    const rows = await prisma.exchange.findMany({
      where: { userId, ...(beforeId ? { id: { not: beforeId } } : {}) },
      include: { corrections: { orderBy: { createdAt: 'asc' } } },
      orderBy: { saidAt: 'desc' },
      take: limit,
    });
    return rows.reverse();
  },

  /** Everything, oldest first. For the person's own export - not paginated,
   *  because "give me my data" that returns a page is not giving them their
   *  data. */
  all: (userId: string): Promise<WithCorrections[]> =>
    prisma.exchange.findMany({
      where: { userId },
      include: { corrections: { orderBy: { createdAt: 'asc' } } },
      orderBy: { saidAt: 'asc' },
    }),

  addCorrection: (data: {
    exchangeId: string; userId: string; wasWrong: string; isRight?: string; domain?: string;
  }): Promise<Correction> =>
    prisma.correction.create({
      data: {
        exchangeId: data.exchangeId,
        userId: data.userId,
        wasWrong: data.wasWrong,
        isRight: data.isRight ?? null,
        domain: data.domain ?? null,
      },
    }),
};
