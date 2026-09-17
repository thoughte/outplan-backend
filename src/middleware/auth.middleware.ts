import type { NextFunction, Response } from 'express';
import { firebaseAuth } from '../config/firebase.config';
import { unauthorized, forbidden } from '../errors/app.errors';
import { userRepo } from '../modules/user/repo';
import { authSessionRepo } from '../modules/auth-session/repo';
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
