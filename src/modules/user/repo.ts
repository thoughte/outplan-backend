import { prisma } from '../../lib/prisma';
import type { User } from '../../../generated/prisma/client';

/** Pure data access. No business logic, no HTTP, no decisions. */
export const userRepo = {
  findById: (id: string): Promise<User | null> =>
    prisma.user.findUnique({ where: { id } }),

  findByEmail: (email: string): Promise<User | null> =>
    prisma.user.findUnique({ where: { email } }),

  /** Create on first sign-in, return the existing row afterwards.
   *
   *  Role is set only on create. An update path that touched it would let a
   *  sign-in silently re-grant or revoke a role, which is a privilege change
   *  disguised as a login. */
  upsertByEmail: (email: string): Promise<User> =>
    prisma.user.upsert({
      where: { email },
      update: {},
      create: { email },
    }),

  updateTimezone: (id: string, timezone: string): Promise<User> =>
    prisma.user.update({ where: { id }, data: { timezone } }),
};
