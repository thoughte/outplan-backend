import type { NextFunction, Response } from 'express';
import { HttpStatusCode } from '../../shared/enums';
import { unauthorized } from '../../errors/app.errors';
import type { AuthenticatedRequest } from '../../shared/types';
import { authSessionService } from './service';
import { createSessionSchema } from './types';

export const authSessionController = {
  /** Register this device. Runs AFTER token verification but does not itself
   *  require a session header - it is the call that creates one. */
  async start(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw unauthorized();
      const input = createSessionSchema.parse(req.body ?? {});
      const session = await authSessionService.start(req.user.id, {
        label: input.label,
        userAgent: req.headers['user-agent'],
        ip: (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.ip,
      });
      res.status(HttpStatusCode.Created).json({ ok: true, data: session });
    } catch (e) { next(e); }
  },

  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw unauthorized();
      const data = await authSessionService.list(req.user.id, req.sessionId);
      res.status(HttpStatusCode.Ok).json({ ok: true, data });
    } catch (e) { next(e); }
  },

  async revokeOne(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw unauthorized();
      await authSessionService.revokeOne(req.user.id, req.params.id as string, req.user.id);
      res.status(HttpStatusCode.NoContent).send();
    } catch (e) { next(e); }
  },

  async revokeAll(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw unauthorized();
      // ?keep=current signs out everything except the device asking, which is
      // what "sign out my other devices" means and is the safer default to
      // offer beside the nuclear one.
      const exceptId = req.query.keep === 'current' ? req.sessionId : undefined;
      const count = await authSessionService.revokeAll(req.user.id, req.user.id, { exceptId });
      res.status(HttpStatusCode.Ok).json({ ok: true, data: { revoked: count } });
    } catch (e) { next(e); }
  },
};
