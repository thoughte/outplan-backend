import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { HttpStatusCode } from '../../shared/enums';
import { unauthorized } from '../../errors/app.errors';
import type { AuthenticatedRequest } from '../../shared/types';
import { farmFor } from './service';
import { QUIZ, TREES } from './trees';
import { chooseTree, myFarmIdentity } from './identity';
import { findFor, listFor } from './discoveries';
import { createInvite, previewInvite, acceptInvite, neighboursOf } from '../social/service';

const plantSchema = z.object({
  answers: z.record(z.string(), z.number().int().min(0).max(9)).default({}),
  tree: z.enum(['banyan', 'mango', 'neem', 'cherry', 'oak', 'bamboo', 'baobab']).optional(),
  name: z.string().trim().min(1, 'Give your tree a name').max(40),
});

export const farmController = {
  /** The farm, worked out fresh. Nothing about it is stored, so there is nothing
   *  to invalidate and nothing that can disagree with the record. */
  async mine(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw unauthorized();
      const [farm, identity] = await Promise.all([farmFor(req.user.id), myFarmIdentity(req.user.id)]);
      res.status(HttpStatusCode.Ok).json({ ok: true, data: { ...farm, identity } });
    } catch (e) { next(e); }
  },

  /** The quiz. Public, because it runs before anyone signs up: the PRD wants
   *  someone to meet their tree before being asked for anything. */
  quiz(_req: Request, res: Response) {
    res.status(HttpStatusCode.Ok).json({ ok: true, data: { questions: QUIZ, trees: TREES } });
  },

  async plant(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw unauthorized();
      const i = plantSchema.parse(req.body ?? {});
      res.status(HttpStatusCode.Created).json({
        ok: true, data: await chooseTree(req.user.id, i.answers, i.tree, i.name),
      });
    } catch (e) { next(e); }
  },

  async discoveries(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw unauthorized();
      await findFor(req.user.id).catch(() => undefined);
      res.status(HttpStatusCode.Ok).json({ ok: true, data: await listFor(req.user.id) });
    } catch (e) { next(e); }
  },

  async neighbours(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw unauthorized();
      res.status(HttpStatusCode.Ok).json({ ok: true, data: await neighboursOf(req.user.id) });
    } catch (e) { next(e); }
  },

  async invite(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw unauthorized();
      res.status(HttpStatusCode.Created).json({ ok: true, data: await createInvite(req.user.id) });
    } catch (e) { next(e); }
  },

  /** What a visitor sees before signing up. PUBLIC, and therefore the most
   *  exposed surface here: a tree, a name, and earned rewards. Never a count of
   *  what is missing. */
  async preview(req: Request, res: Response, next: NextFunction) {
    try {
      res.status(HttpStatusCode.Ok).json({ ok: true, data: await previewInvite(String(req.params.code)) });
    } catch (e) { next(e); }
  },

  async accept(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw unauthorized();
      res.status(HttpStatusCode.Ok).json({ ok: true, data: await acceptInvite(req.user.id, String(req.params.code)) });
    } catch (e) { next(e); }
  },
};
