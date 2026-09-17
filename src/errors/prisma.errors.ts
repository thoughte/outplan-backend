import { Prisma } from '../../generated/prisma/client';
import { AppError, conflict, notFound, badRequest } from './app.errors';

/** Known Prisma codes to AppError. Unknown ones fall through deliberately:
 *  guessing at an unrecognised database failure is how a constraint violation
 *  becomes a cheerful 400 and nobody investigates. */
export function prismaToAppError(err: unknown): AppError | null {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return null;

  switch (err.code) {
    case 'P2002': {
      const target = (err.meta?.target as string[] | undefined)?.join(', ');
      return conflict(target ? `That ${target} is already taken` : 'Already exists', { code: err.code });
    }
    case 'P2025':
      return notFound('Not found', { code: err.code });
    case 'P2003':
      return badRequest('That refers to something that does not exist', { code: err.code });
    case 'P2000':
      return badRequest('That value is too long', { code: err.code });
    default:
      return null;
  }
}
