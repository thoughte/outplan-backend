import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { ENV_CONFIG } from '../../config/env.config';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../errors/app.errors';
import { ACCEPTED, TEXTUAL, resolveType, type UploadInput } from './types';
import type { StoredFile } from '../../../generated/prisma/client';

/** Where a file lives on the volume.
 *
 *  Path is derived from the hash, never from the uploaded name. A name arriving
 *  over the wire can contain "../" and any amount of unicode, and the moment it
 *  reaches a filesystem path it is a directory traversal. The original name is
 *  kept in the database, where it is data rather than an instruction.
 *
 *  Sharded by the first two hex characters so one directory does not accumulate
 *  every file this person ever uploads.
 */
const relPath = (userId: string, hash: string, ext: string): string =>
  join(userId, hash.slice(0, 2), `${hash}.${ext}`);

export const fileService = {
  /** Store the bytes, once.
   *
   *  The hash decides. Uploading the same PDF twice - re-sent, retried after a
   *  dropped connection, mailed again by the lab - returns the file that is
   *  already there rather than creating a second one, because digesting it
   *  twice would double his measurements. `duplicate` says which happened, so
   *  the interface can tell him instead of pretending it worked.
   */
  async store(userId: string, file: Express.Multer.File, input: UploadInput):
    Promise<{ stored: StoredFile; duplicate: boolean }> {
    const mediaType = resolveType(file.mimetype, file.originalname);
    if (!mediaType) {
      throw badRequest(`Cannot accept ${file.originalname.split('.').pop() ?? 'that file type'} files`);
    }
    const ext = ACCEPTED[mediaType];
    if (!file.size) throw badRequest('That file is empty');

    const hash = createHash('sha256').update(file.buffer).digest('hex');

    const existing = await prisma.storedFile.findUnique({
      where: { userId_hash: { userId, hash } },
    });
    if (existing) return { stored: existing, duplicate: true };

    const rel = relPath(userId, hash, ext);
    const abs = join(ENV_CONFIG.FILES_DIR, rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, file.buffer);

    // Text goes in the database because the engine reads the database and never
    // opens a file. A PDF is stored now and parsed later; saying so beats
    // leaving a null nobody can explain.
    const textual = TEXTUAL.has(mediaType);
    const text = textual ? file.buffer.toString('utf8') : null;

    try {
      const stored = await prisma.storedFile.create({
        data: {
          userId, hash, filename: file.originalname, mediaType,
          bytes: file.size, path: rel, kind: input.kind, status: input.status,
          contentDate: input.contentDate ? new Date(`${input.contentDate}T00:00:00Z`) : null,
          text,
          digestedAt: textual ? new Date() : null,
          digestNote: textual ? (input.note ?? null)
            : `stored; ${mediaType} text not extracted yet`,
        },
      });
      return { stored, duplicate: false };
    } catch (e) {
      // The row is what makes the bytes findable. Without it the file is an
      // orphan on the volume that nothing will ever read or clean up.
      await unlink(abs).catch(() => undefined);
      throw e;
    }
  },

  /** Everything the person put here. Not everything stored under their id.
   *
   *  `internal` rows are the app's own material: documents its tooling wrote,
   *  kept as provenance and never listed as the person's own. They were, once,
   *  and the owner found nine of them on his Records screen between his blood
   *  tests. A generated document is not a record.
   */
  async list(userId: string) {
    return prisma.storedFile.findMany({
      where: { userId, internal: false },
      orderBy: [{ contentDate: 'desc' }, { uploadedAt: 'desc' }],
      select: {
        id: true, filename: true, mediaType: true, bytes: true, kind: true,
        status: true, contentDate: true, uploadedAt: true, digestedAt: true,
        digestNote: true, hash: true,
        // What reading it found. On screen this is the difference between "a
        // file is here" and "this is your 4 Sep blood panel, 43 pages" - and
        // between a report that is in the record and one that merely exists.
        bookingRef: true, pages: true,
      },
    });
  },

  /** The bytes back, for showing the person their own original. */
  async read(userId: string, id: string): Promise<{ file: StoredFile; bytes: Buffer }> {
    // Same exclusion as the list. A row the screen cannot see must not be
    // reachable by guessing its id either.
    const file = await prisma.storedFile.findFirst({ where: { id, userId, internal: false } });
    if (!file) throw notFound('No such file');
    const bytes = await readFile(join(ENV_CONFIG.FILES_DIR, file.path)).catch(() => {
      throw notFound('That file is recorded but its contents are missing from storage');
    });
    return { file, bytes };
  },
};
