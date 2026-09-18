import multer from 'multer';
import type { NextFunction, Response } from 'express';
import { HttpStatusCode } from '../../shared/enums';
import { unauthorized, badRequest } from '../../errors/app.errors';
import type { AuthenticatedRequest } from '../../shared/types';
import { fileService } from './service';
import { digestPending } from '../record/digest';
import { uploadSchema, resolveType } from './types';

/** Held in memory, not streamed to a temp file.
 *
 *  The bytes are hashed before anything is written, because the hash decides
 *  whether they should be written at all - a duplicate upload must not create a
 *  second copy. Streaming to disk first would mean writing the file to find out
 *  we already had it.
 *
 *  25 MB is the ceiling. A scanned lab report is a few megabytes; the limit is
 *  what stops a single request from taking the process down with it, and it is
 *  enforced here rather than trusted from a Content-Length header.
 */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (resolveType(file.mimetype, file.originalname)) return cb(null, true);
    cb(badRequest(`Cannot accept ${file.originalname.split('.').pop() ?? 'that file type'} files`));
  },
});

/** Whose name a report must carry to be linked to their record.
 *
 *  Only his account has a record worth protecting, and the identity check needs
 *  a name to check against. Anything else is stored and left alone rather than
 *  matched against a name we do not have - guessing a person's name from their
 *  email address and then deciding whose blood test this is would be a very bad
 *  way to be wrong.
 */
const NAMES: Record<string, string> = { 'ekunalkhanna@gmail.com': 'Kunal Khanna' };

async function readSoon(userId: string, email: string): Promise<void> {
  const name = NAMES[email];
  if (!name) return;
  try {
    const results = await digestPending(userId, name, 5);
    for (const r of results) console.log(`[digest] ${r.result.padEnd(24)} ${r.file}${r.detail ? ' - ' + r.detail : ''}`);
  } catch (e) {
    console.error('[digest] after upload:', (e as Error).message, '- the file is stored; the next boot will read it');
  }
}

export const fileController = {
  async upload(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw unauthorized();
      if (!req.file) throw badRequest('No file was attached');
      const input = uploadSchema.parse(req.body ?? {});
      const { stored, duplicate } = await fileService.store(req.user.id, req.file, input);
      // 200 rather than 201 for a duplicate: nothing was created, and saying so
      // is what lets the interface tell him it was already here instead of
      // implying a second copy now exists.
      res.status(duplicate ? HttpStatusCode.Ok : HttpStatusCode.Created)
        .json({ ok: true, duplicate, data: stored });

      // Read it AFTER answering, not before.
      //
      // Reading a 43-page scan takes a second or two, and he uploads from a
      // phone - holding the response open for that turns a working upload into
      // something that looks stalled, and on a bad connection into something
      // that times out and gets retried. The file is safe the moment it is
      // stored; being read is what happens next, not what the upload waits for.
      //
      // Deliberately fire-and-forget: a failure here must never fail an upload
      // that has already succeeded, and the boot-time pass picks up anything
      // left unread.
      if (!duplicate) void readSoon(req.user.id, req.user.email);
    } catch (e) { next(e); }
  },

  /** Read anything still unread, now.
   *
   *  Until this existed, a file could only be read when the container next
   *  restarted. That made "re-read my files" a deployment, which is absurd for
   *  something the owner of the record should be able to ask for - and it meant
   *  a file that failed once sat unread until something unrelated happened to
   *  ship.
   *
   *  It answers with what it did, per file, rather than a count: "linked to your
   *  4 Sep panel" and "two reports share this booking, so it is not linked" are
   *  different outcomes and he should see which is which.
   */
  async readPending(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw unauthorized();
      const name = NAMES[req.user.email];
      if (!name) {
        res.status(HttpStatusCode.Ok).json({ ok: true, data: [], note: 'no identity on file to check reports against' });
        return;
      }
      const results = await digestPending(req.user.id, name, 30);
      res.status(HttpStatusCode.Ok).json({ ok: true, data: results });
    } catch (e) { next(e); }
  },

  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw unauthorized();
      res.status(HttpStatusCode.Ok).json({ ok: true, data: await fileService.list(req.user.id) });
    } catch (e) { next(e); }
  },

  async content(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw unauthorized();
      const { file, bytes } = await fileService.read(req.user.id, req.params.id as string);
      res.setHeader('Content-Type', file.mediaType);
      // inline, and the filename quoted: it is user-supplied text going into a
      // header, so it is escaped rather than interpolated.
      res.setHeader('Content-Disposition',
        `inline; filename="${file.filename.replace(/["\\\r\n]/g, '_')}"`);
      res.status(HttpStatusCode.Ok).send(bytes);
    } catch (e) { next(e); }
  },
};
