import multer from 'multer';
import type { NextFunction, Response } from 'express';
import { HttpStatusCode } from '../../shared/enums';
import { unauthorized, badRequest } from '../../errors/app.errors';
import type { AuthenticatedRequest } from '../../shared/types';
import { fileService } from './service';
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
