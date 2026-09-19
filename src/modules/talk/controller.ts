import type { NextFunction, Response } from 'express';
import { HttpStatusCode } from '../../shared/enums';
import { unauthorized, badRequest } from '../../errors/app.errors';
import { fileService } from '../file/service';
import { readSoon } from '../file/controller';
import type { AuthenticatedRequest } from '../../shared/types';
import { talkService } from './service';
import { correctSchema, createExchangeSchema, listQuerySchema } from './types';
import { uploadSchema } from '../file/types';

export const talkController = {
  /**
   * POST /api/v1/talk/attach   (multipart)
   * Say something with a file attached. The file goes through the SAME store
   * and the SAME digest as the Records screen: identity check, collection date,
   * duplicate check. Chat is not a second door with weaker locks.
   * Body:
   *  - file: the attachment
   *  - said: optional message alongside it
   */
  async attach(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw unauthorized();
      if (!req.file) throw badRequest('No file was attached');

      const { stored, duplicate } = await fileService.store(req.user.id, req.file, uploadSchema.parse({}));

      // The message names the file so the conversation reads as a conversation.
      // His own words come first when he typed any: the file is the attachment,
      // not the point.
      const typed = typeof req.body?.said === 'string' ? req.body.said.trim() : '';
      const said = [typed, `[attached ${stored.filename}]`].filter(Boolean).join('\n');

      const data = await talkService.say(req.user.id, { said, attachedFileId: stored.id });
      res.status(HttpStatusCode.Created).json({ ok: true, duplicate, file: stored, data });

      // Read it after answering, exactly as the Records upload does. A digest
      // that takes two seconds must not hold up a reply.
      if (!duplicate) void readSoon(req.user.id);
    } catch (e) { next(e); }
  },

  /**
   * DELETE /api/v1/talk/:id/did/:opId
   * Undo one thing the assistant did on that message.
   */
  async undoThing(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw unauthorized();
      const data = await talkService.undoThing(
        req.user.id, req.params.id as string, req.params.opId as string,
      );
      res.status(HttpStatusCode.Ok).json({ ok: true, data });
    } catch (e) { next(e); }
  },

  async say(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw unauthorized();
      const input = createExchangeSchema.parse(req.body);
      const data = await talkService.say(req.user.id, input);
      res.status(HttpStatusCode.Created).json({ ok: true, data });
    } catch (e) { next(e); }
  },

  /**
   * DELETE /api/v1/talk/:id/record
   * Take back what was read from one message. The message itself is untouched.
   * Params:
   *  - id: string
   * Middleware:
   *  - authenticated, his own exchanges only, agent keys refused (peopleOnly)
   */
  async unrecord(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw unauthorized();
      const data = await talkService.unrecord(req.user.id, req.params.id as string);
      res.status(HttpStatusCode.Ok).json({ ok: true, data });
    } catch (e) { next(e); }
  },

  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw unauthorized();
      const q = listQuerySchema.parse(req.query);
      res.status(HttpStatusCode.Ok).json({ ok: true, data: await talkService.list(req.user.id, q) });
    } catch (e) { next(e); }
  },

  async one(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw unauthorized();
      res.status(HttpStatusCode.Ok).json({ ok: true, data: await talkService.one(req.user.id, req.params.id as string) });
    } catch (e) { next(e); }
  },

  async correct(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw unauthorized();
      const input = correctSchema.parse(req.body);
      const data = await talkService.correct(req.user.id, req.params.id as string, input);
      res.status(HttpStatusCode.Created).json({ ok: true, data });
    } catch (e) { next(e); }
  },

  /** The person's own data, all of it, unpaginated. "Give me my data" that
   *  returns a page is not giving them their data. */
  async exportAll(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw unauthorized();
      const data = await talkService.exportAll(req.user.id);
      res.setHeader('content-disposition', 'attachment; filename="outplan-export.json"');
      res.status(HttpStatusCode.Ok).json({ ok: true, exportedAt: new Date().toISOString(), data });
    } catch (e) { next(e); }
  },
};
