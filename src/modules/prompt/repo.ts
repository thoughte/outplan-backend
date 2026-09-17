import { prisma } from '../../lib/prisma';
import type { Prompt } from '../../../generated/prisma/client';

export const promptRepo = {
  active: (key: string): Promise<Prompt | null> =>
    prisma.prompt.findFirst({ where: { key, active: true } }),

  list: (key: string): Promise<Prompt[]> =>
    prisma.prompt.findMany({ where: { key }, orderBy: { version: 'desc' } }),

  /** A new version. Rows are never updated - an answer must remain traceable to
   *  the exact text that produced it. */
  async addVersion(key: string, content: string, notes?: string): Promise<Prompt> {
    const latest = await prisma.prompt.findFirst({ where: { key }, orderBy: { version: 'desc' } });
    return prisma.prompt.create({
      data: { key, version: (latest?.version ?? 0) + 1, content, notes: notes ?? null },
    });
  },

  /** Move activation. Deactivate then activate in one transaction: the partial
   *  unique index makes the interleaving fatal rather than merely wrong, and
   *  without the transaction a failure between the two leaves no active prompt
   *  at all. */
  async activate(key: string, version: number): Promise<void> {
    await prisma.$transaction([
      prisma.prompt.updateMany({ where: { key, active: true }, data: { active: false } }),
      prisma.prompt.updateMany({ where: { key, version }, data: { active: true } }),
    ]);
  },
};
