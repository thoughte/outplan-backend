import { z } from 'zod';
import type { Response, NextFunction } from 'express';
import { HttpStatusCode } from '../../shared/enums';
import { unauthorized } from '../../errors/app.errors';
import type { AuthenticatedRequest } from '../../shared/types';
import { userRepo } from '../user/repo';
import { localDay } from '../../shared/helper';
import { planFor, setDone } from './service';

const daySchema = z.object({
  /** Their day, not the server's. Omitted means today where they are. */
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
const doneSchema = z.object({ done: z.boolean().default(true) });

export const planController = {
  async today(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw unauthorized();
      const { day } = daySchema.parse(req.query ?? {});
      const user = await userRepo.findById(req.user.id);
      const on = day ?? localDay(new Date(), user?.timezone ?? 'Asia/Kolkata');
      res.status(HttpStatusCode.Ok).json({ ok: true, data: { day: on, items: await planFor(req.user.id, on) } });
    } catch (e) { next(e); }
  },

  async setDone(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw unauthorized();
      const { done } = doneSchema.parse(req.body ?? {});
      res.status(HttpStatusCode.Ok).json({ ok: true, data: await setDone(req.user.id, req.params.id as string, done) });
    } catch (e) { next(e); }
  },
};
