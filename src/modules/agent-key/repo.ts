import { prisma } from '../../lib/prisma';

export const agentKeyRepo = {
  /** A key that exists, has not been revoked, and has not expired.
   *
   *  Looked up by HASH. The secret is never stored, so a leaked database hands
   *  over no working access to anyone's health record - including to whoever
   *  leaked it. */
  async findLive(tokenHash: string) {
    const key = await prisma.agentKey.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, email: true, role: true } } },
    });
    if (!key) return null;
    if (key.revokedAt) return null;
    if (key.expiresAt && key.expiresAt < new Date()) return null;
    return key;
  },

  /** Records that the key was used.
   *
   *  Not awaited by the caller: "when was this last used" is the thing that
   *  makes a forgotten key noticeable, and it is never worth failing a request
   *  over. */
  async touch(id: string): Promise<void> {
    await prisma.agentKey.update({ where: { id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
  },

  /** Store a new key by its hash.
   *
   *  The secret never reaches this layer as something to be saved - only its
   *  hash arrives. A database that leaks must not hand anyone working access to
   *  a health record, including whoever leaked it. */
  create(userId: string, label: string, tokenHash: string, expiresAt: Date) {
    return prisma.agentKey.create({
      data: { userId, label, tokenHash, expiresAt },
      select: { id: true, label: true, scopes: true, createdAt: true, lastUsedAt: true, revokedAt: true, expiresAt: true },
    });
  },

  /** How many keys are live right now. A cap is not about abuse - it is his own
   *  account - but about a list staying readable enough to be worth reading. */
  countLive(userId: string) {
    return prisma.agentKey.count({ where: { userId, revokedAt: null } });
  },

  list(userId: string) {
    return prisma.agentKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, label: true, scopes: true, createdAt: true, lastUsedAt: true, revokedAt: true, expiresAt: true },
    });
  },

  /** Revoked, never deleted. A key that was used and then withdrawn is part of
   *  the history of who touched this record. */
  revoke(userId: string, id: string) {
    return prisma.agentKey.updateMany({ where: { id, userId, revokedAt: null }, data: { revokedAt: new Date() } });
  },
};
