import { createHash } from 'node:crypto';
import type { NextFunction, Response } from 'express';
import { firebaseAuth } from '../config/firebase.config';
import { unauthorized, forbidden } from '../errors/app.errors';
import { userRepo } from '../modules/user/repo';
import { authSessionRepo } from '../modules/auth-session/repo';
import { agentKeyRepo } from '../modules/agent-key/repo';
import { AGENT_PREFIX } from '../modules/agent-key/types';
import { BEARER_PREFIX } from '../shared/constants';
import { HttpHeader } from '../shared/enums';
import type { AuthenticatedRequest } from '../shared/types';

/** Verify the Firebase ID token, then attach OUR user.
 *
 *  Two things this deliberately does not do.
 *
 *  It does not trust any identity in the request body or path. The only input
 *  is the signed token; everything downstream reads req.user.
 *
 *  It does not accept an unverified email. Firebase will happily issue a token
 *  for an email/password account the moment it is created, before the address
 *  has been confirmed - so without this check anyone can sign up as anyone's
 *  address and receive their record. Google sign-in arrives verified.
 */
export async function authMiddleware(
  req: AuthenticatedRequest, _res: Response, next: NextFunction,
): Promise<void> {
  try {
    const header = req.headers[HttpHeader.Authorization];
    if (typeof header !== 'string' || !header.startsWith(BEARER_PREFIX)) {
      throw unauthorized('Sign in to continue');
    }
    const token = header.slice(BEARER_PREFIX.length).trim();
    if (!token) throw unauthorized('Sign in to continue');

    // An agent key, if that is what arrived.
    //
    // This is an ADDITIONAL credential, never a way around the one below. It
    // does not weaken Firebase verification, it cannot be produced by guessing
    // at a signature, and it is recognised only by its own prefix - so a
    // malformed or expired Firebase token can never accidentally be read as one.
    //
    // Everything about it is visible and reversible: it is listed with his
    // devices, it records every use, and revoking it is a single row. That is
    // the difference between a key and a backdoor, and it is the only version of
    // this worth building in something that will hold other people's blood
    // tests.
    if (token.startsWith(AGENT_PREFIX)) {
      const agent = await agentKeyRepo.findLive(createHash('sha256').update(token).digest('hex'));
      if (!agent) throw unauthorized('That key is not valid, or it has been revoked');
      req.user = { id: agent.user.id, email: agent.user.email, role: agent.user.role };
      req.agentKey = { id: agent.id, label: agent.label, scopes: agent.scopes };
      void agentKeyRepo.touch(agent.id);
      next();
      return;
    }

    // Local signature check against cached Google keys. No network per request.
    const decoded = await firebaseAuth().verifyIdToken(token).catch(() => {
      throw unauthorized('That session has expired. Sign in again.');
    });

    const email = decoded.email?.toLowerCase();
    if (!email) throw forbidden('That sign-in method did not provide an email address');
    if (!decoded.email_verified) {
      throw forbidden('Confirm your email address first - check your inbox');
    }

    const user = await userRepo.upsertByEmail(email);
    req.user = { id: user.id, email: user.email, role: user.role };
    next();
  } catch (e) { next(e); }
}

/** How recently a session must have been touched before we write again.
 *
 *  Updating lastSeenAt on every request is a database write per API call for a
 *  field nobody reads more than once a week. A minute of staleness in "last
 *  used" is invisible; the write amplification is not. */
const TOUCH_AFTER_MS = 60_000;

/** Require a LIVE session, not just a valid token.
 *
 *  This is what makes "log out that phone" possible. Firebase cannot do it:
 *  it has no way to enumerate a user's live tokens, and revokeRefreshTokens
 *  kills every device at once.
 *
 *  It also means a stolen token alone is not enough - an attacker needs the
 *  session id too, and that id is revocable in one row.
 *
 *  Registered AFTER authMiddleware and skipped only on the route that creates a
 *  session, which cannot require one.
 */
export async function requireSession(
  req: AuthenticatedRequest, _res: Response, next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) throw unauthorized();

    // An agent key IS the session. There is no phone to register and nothing to
    // sign out of - revoking the key is the equivalent, and it is one row.
    if (req.agentKey) { next(); return; }

    const id = req.headers[HttpHeader.SessionId];
    if (typeof id !== 'string' || !id) {
      throw unauthorized('This device is not registered. Sign in again.');
    }

    const session = await authSessionRepo.findLive(id, req.user.id);
    if (!session) {
      // Covers three cases with one message, on purpose: revoked, expired, or
      // belonging to somebody else. Distinguishing them tells an attacker
      // whether a session id they hold is real.
      throw unauthorized('That device was signed out. Sign in again.');
    }

    req.sessionId = session.id;

    if (Date.now() - session.lastSeenAt.getTime() > TOUCH_AFTER_MS) {
      await authSessionRepo.touch(session.id).catch(() => undefined);
    }
    next();
  } catch (e) { next(e); }
}

/** Role gate. Registered after authMiddleware, never instead of it. */
export function requireRole(...roles: Array<'member' | 'clinician' | 'admin'>) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) {
      // Deliberately not "you are a member, this needs clinician". Telling
      // someone what role a page wants is telling them what to go and get.
      return next(forbidden('Not yours'));
    }
    next();
  };
}

/** Refuse an agent key on routes that are the person speaking.
 *
 *  The key's scopes say it may move records, not talk. Writing that in a column
 *  and never checking it is worse than not writing it at all - it reads as a
 *  guarantee while being decoration.
 *
 *  What this protects is specific: an agent key must not be able to put words
 *  into his conversation, and must not be able to read a conversation back. The
 *  record is data he asked to be maintained; the talking is him.
 */
export function peopleOnly(
  req: AuthenticatedRequest, _res: Response, next: NextFunction,
): void {
  if (req.agentKey) {
    next(forbidden('An agent key cannot be used for conversation - only for records'));
    return;
  }
  next();
}
