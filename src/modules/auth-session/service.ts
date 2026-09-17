import { notFound } from '../../errors/app.errors';
import { firebaseAuth } from '../../config/firebase.config';
import { authSessionRepo } from './repo';
import { labelFromUserAgent, ipPrefix, toSessionResponse, type SessionResponse } from './types';

export interface AuthSessionService {
  start(userId: string, ctx: { label?: string; userAgent?: string; ip?: string }): Promise<SessionResponse>;
  list(userId: string, currentId?: string): Promise<SessionResponse[]>;
  revokeOne(userId: string, id: string, by: string): Promise<void>;
  revokeAll(userId: string, by: string, opts?: { exceptId?: string }): Promise<number>;
}

export const authSessionService: AuthSessionService = {
  async start(userId, ctx) {
    const s = await authSessionRepo.create({
      userId,
      label: ctx.label ?? labelFromUserAgent(ctx.userAgent),
      userAgent: ctx.userAgent,
      ipPrefix: ipPrefix(ctx.ip),
    });
    return toSessionResponse(s, s.id);
  },

  async list(userId, currentId) {
    const rows = await authSessionRepo.listActive(userId);
    return rows.map((r) => toSessionResponse(r, currentId));
  },

  async revokeOne(userId, id, by) {
    const { count } = await authSessionRepo.revoke(id, userId, by);
    // updateMany is scoped to userId, so a session belonging to someone else
    // matches nothing and is reported as not-found. Never confirm that another
    // person's session id exists.
    if (count === 0) throw notFound('No such session');
  },

  /** Sign out everywhere.
   *
   *  This also revokes the Firebase refresh tokens, which is the part that
   *  matters: without it a signed-out device could mint a fresh ID token and
   *  simply register a new session. Per-device revocation deliberately does NOT
   *  do this - it would sign out every device, which is the thing we built this
   *  table to avoid.
   */
  async revokeAll(userId, by, opts) {
    const { count } = await authSessionRepo.revokeAll(userId, by, opts?.exceptId);
    if (!opts?.exceptId) {
      const user = await import('../user/repo').then((m) => m.userRepo.findById(userId));
      if (user) {
        // Best effort: the session rows are the authority for this API, and a
        // Firebase outage must not leave the person unable to sign out.
        await firebaseAuth().revokeRefreshTokens(user.email).catch(() => undefined);
      }
    }
    return count;
  },
};
