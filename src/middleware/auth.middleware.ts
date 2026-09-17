import type { NextFunction, Response } from 'express';
import { firebaseAuth } from '../config/firebase.config';
import { unauthorized, forbidden } from '../errors/app.errors';
import { userRepo } from '../modules/user/repo';
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
