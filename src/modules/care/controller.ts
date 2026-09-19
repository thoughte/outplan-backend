import { z } from 'zod';
import type { Response, NextFunction } from 'express';
import { HttpStatusCode } from '../../shared/enums';
import { unauthorized } from '../../errors/app.errors';
import type { AuthenticatedRequest } from '../../shared/types';
import { invite, setSharing, pause, circleOf, viewOf } from './service';

const inviteSchema = z.object({ email: z.string().email() });
const sharingSchema = z.object({
  seeCheckIn: z.boolean().optional(),
  seeDoses: z.boolean().optional(),
  seeProblems: z.boolean().optional(),
  seeQuietDays: z.boolean().optional(),
  quietAfterDays: z.number().int().min(1).max(30).optional(),
});

export const careController = {
  /** Who is in my circle, and exactly what each one can see. */
  async mine(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw unauthorized();
      res.status(HttpStatusCode.Ok).json({ ok: true, data: await circleOf(req.user.id) });
    } catch (e) { next(e); }
  },

  async add(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw unauthorized();
      const { email } = inviteSchema.parse(req.body ?? {});
      res.status(HttpStatusCode.Created).json({ ok: true, data: await invite(req.user.id, email) });
    } catch (e) { next(e); }
  },

  async share(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw unauthorized();
      const s = sharingSchema.parse(req.body ?? {});
      res.status(HttpStatusCode.Ok).json({ ok: true, data: await setSharing(req.user.id, String(req.params.id), s) });
    } catch (e) { next(e); }
  },

  async pause(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw unauthorized();
      const paused = req.body?.paused !== false;
      res.status(HttpStatusCode.Ok).json({ ok: true, data: await pause(req.user.id, String(req.params.id), paused) });
    } catch (e) { next(e); }
  },

  /** Looking at someone who put me in their circle. Assembled from their
   *  toggles: a field that is off is never read, so no rendering bug can leak
   *  what the query never returned. */
  async view(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw unauthorized();
      res.status(HttpStatusCode.Ok).json({ ok: true, data: await viewOf(req.user.id, String(req.params.ownerId)) });
    } catch (e) { next(e); }
  },
};
