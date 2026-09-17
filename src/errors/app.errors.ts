import type { ErrorCode, HttpCode } from '../shared/types';

/** The only error type that reaches a client.
 *
 *  `message` is shown to the person, so it must never carry a stack, a query, or
 *  another user's data. `detail` is logged and never serialised. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: HttpCode;
  readonly detail?: unknown;

  constructor(code: ErrorCode, status: HttpCode, message: string, detail?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.detail = detail;
    Error.captureStackTrace?.(this, AppError);
  }
}

export const badRequest = (m = 'Bad request', d?: unknown) => new AppError('BAD_REQUEST', 400, m, d);
export const unauthorized = (m = 'Sign in to continue', d?: unknown) => new AppError('UNAUTHORIZED', 401, m, d);
export const forbidden = (m = 'Not yours', d?: unknown) => new AppError('FORBIDDEN', 403, m, d);
export const notFound = (m = 'Not found', d?: unknown) => new AppError('NOT_FOUND', 404, m, d);
export const conflict = (m = 'Already exists', d?: unknown) => new AppError('CONFLICT', 409, m, d);
export const unprocessable = (m = 'Cannot process', d?: unknown) => new AppError('UNPROCESSABLE', 422, m, d);
export const internal = (m = 'Something broke on our side', d?: unknown) => new AppError('INTERNAL', 500, m, d);

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;
