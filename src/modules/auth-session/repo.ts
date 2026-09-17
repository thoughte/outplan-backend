import { prisma } from '../../lib/prisma';
import type { AuthSession } from '../../../generated/prisma/client';

export const authSessionRepo = {
  create: (data: { userId: string; label: string; userAgent?: string; ipPrefix: string | null }): Promise<AuthSession> =>
    prisma.authSession.create({
      data: {
        userId: data.userId,
        label: data.label,
        userAgent: data.userAgent ?? null,
        ipPrefix: data.ipPrefix,
      },
    }),

  /** Live sessions only, newest first. */
  listActive: (userId: string): Promise<AuthSession[]> =>
    prisma.authSession.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastSeenAt: 'desc' },
    }),

  findLive: (id: string, userId: string): Promise<AuthSession | null> =>
    prisma.authSession.findFirst({ where: { id, userId, revokedAt: null } }),

  /** Revoked, not deleted. "That device was signed out at 3am" is something the
   *  person may need to see afterwards, and a deleted row cannot tell them. */
  revoke: (id: string, userId: string, by: string): Promise<{ count: number }> =>
    prisma.authSession.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedBy: by },
    }),

  revokeAll: (userId: string, by: string, exceptId?: string): Promise<{ count: number }> =>
    prisma.authSession.updateMany({
      where: { userId, revokedAt: null, ...(exceptId ? { id: { not: exceptId } } : {}) },
      data: { revokedAt: new Date(), revokedBy: by },
    }),

  touch: (id: string): Promise<unknown> =>
    prisma.authSession.update({ where: { id }, data: { lastSeenAt: new Date() } }),
};
