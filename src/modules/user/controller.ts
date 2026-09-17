import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from '../../shared/types';
import { HttpStatusCode } from '../../shared/enums';
import { unauthorized } from '../../errors/app.errors';
import { userService } from './service';
import { updateMeSchema } from './types';

/** HTTP only. No business logic, no queries.
 *
 *  Every handler reads req.user.id and never a userId from the path or body.
 *  A route that takes an id from the request is a route that can be asked for
 *  someone else's, and that is the bug this codebase has already shipped once. */
export const userController = {
  async me(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw unauthorized();
      res.status(HttpStatusCode.Ok).json({ ok: true, data: await userService.me(req.user.id) });
    } catch (e) { next(e); }
  },

  async updateMe(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw unauthorized();
      const input = updateMeSchema.parse(req.body);
      res.status(HttpStatusCode.Ok).json({ ok: true, data: await userService.updateMe(req.user.id, input) });
    } catch (e) { next(e); }
  },
};
