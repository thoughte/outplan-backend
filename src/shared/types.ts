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
}
