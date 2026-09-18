import type { Request } from 'express';

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNPROCESSABLE'
  | 'INTERNAL';

export type HttpCode = 400 | 401 | 403 | 404 | 409 | 422 | 500 | 503;

/** A request that has been through the auth middleware. `user` is present only
 *  after it; every route that reads it must sit behind it in routes.setup. */
export interface AuthenticatedRequest extends Request {
  user?: { id: string; email: string; role: 'member' | 'clinician' | 'admin' };
  /** The live session this request belongs to. Present on every route except
   *  the one that creates a session. */
  sessionId?: string;
  /** Present when the caller is an agent key rather than a signed-in person.
   *
   *  Anything that should behave differently for a non-human caller reads this
   *  - and it is what makes an agent's actions attributable to the key that
   *  made them rather than indistinguishable from his own. */
  agentKey?: { id: string; label: string; scopes: string[] };
}
