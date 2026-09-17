import { ZodError } from 'zod';
import { AppError, badRequest } from './app.errors';

/** A validation failure names the field, never the value.
 *
 *  Echoing the value back is how a health API ends up writing a symptom into a
 *  log line, an error tracker and a browser console at once. */
export function zodToAppError(err: unknown): AppError | null {
  if (!(err instanceof ZodError)) return null;
  const fields = err.issues.map((i) => ({
    path: i.path.join('.') || '(root)',
    code: i.code,
    message: i.message,
  }));
  return badRequest('Some of that did not look right', { fields });
}
