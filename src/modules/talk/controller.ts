import type { NextFunction, Response } from 'express';
import { HttpStatusCode } from '../../shared/enums';
import { unauthorized } from '../../errors/app.errors';
import type { AuthenticatedRequest } from '../../shared/types';
import { talkService } from './service';
import { correctSchema, createExchangeSchema, listQuerySchema } from './types';

export const talkController = {
  async say(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw unauthorized();
      const input = createExchangeSchema.parse(req.body);
      const data = await talkService.say(req.user.id, input);
      res.status(HttpStatusCode.Created).json({ ok: true, data });
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
