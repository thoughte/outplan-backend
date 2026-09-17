import type { NextFunction, Request, Response } from 'express';
import { AppError, internal, isAppError } from '../errors/app.errors';
import { prismaToAppError } from '../errors/prisma.errors';
import { zodToAppError } from '../errors/zod.errors';
import { ENV_CONFIG } from '../config/env.config';

/** Last middleware registered. Everything that throws ends here.
 *
 *  Two rules: the client sees a code and a sentence, never a stack; and an
 *  unrecognised error is a 500 that gets logged in full, never a 400 that gets
 *  forgotten. A health API that turns unknown failures into tidy 400s is one
 *  that stops noticing when it breaks. */
export function errorMiddleware(
  err: unknown, _req: Request, res: Response, _next: NextFunction,
): void {
  const mapped: AppError =
    (isAppError(err) ? err : null) ??
    zodToAppError(err) ??
    prismaToAppError(err) ??
    internal();

  if (mapped.status >= 500) {
    console.error('[error]', mapped.message, err instanceof Error ? err.stack : err);
  } else if (ENV_CONFIG.NODE_ENV !== 'production') {
    console.warn('[error]', mapped.code, mapped.message, mapped.detail ?? '');
  }

  res.status(mapped.status).json({
    ok: false,
    error: { code: mapped.code, message: mapped.message, ...(mapped.detail ? { detail: mapped.detail } : {}) },
  });
}

/** 404 for anything the router did not claim. Registered before the error
 *  middleware so an unknown path is a normal outcome, not an exception. */
export function notFoundMiddleware(_req: Request, res: Response): void {
  res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'No such endpoint' } });
}
