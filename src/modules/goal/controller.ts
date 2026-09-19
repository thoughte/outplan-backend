import { z } from 'zod';
import type { Response, NextFunction } from 'express';
import { HttpStatusCode } from '../../shared/enums';
import { unauthorized, badRequest } from '../../errors/app.errors';
import type { AuthenticatedRequest } from '../../shared/types';
import { tree, refresh, confirm, abandon, scoreboard } from './service';
import { draft, save } from './decompose';

const proposeSchema = z.object({
  intent: z.string().min(3, 'Say what you want to change').max(500),
  exchangeId: z.string().uuid().optional(),
});
const confirmSchema = z.object({
  baselineValue: z.number().optional(),
  baselineText: z.string().max(200).optional(),
});

export const goalController = {
  /** Everything, as a tree, with progress worked out from the record. */
  async list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw unauthorized();
      await refresh(req.user.id);
      const [goals, score] = await Promise.all([tree(req.user.id), scoreboard(req.user.id)]);
      res.status(HttpStatusCode.Ok).json({ ok: true, data: { goals, scoreboard: score } });
    } catch (e) { next(e); }
  },

  /** Break something he wants into pieces, and put them up as suggestions.
   *
   *  Proposed, never active. A model suggesting a goal is not the same as him
   *  wanting one, and the difference is the entire reason there is a confirm
   *  step at all.
   */
  async propose(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw unauthorized();
      const input = proposeSchema.parse(req.body ?? {});
      const drafted = await draft(req.user.id, input.intent);
      if (!drafted.goals.length) {
        // Say which kind of nothing it was. Two of his four intents failed here
        // with an identical message and no way to tell them apart from outside.
        const why: Record<string, string> = {
          no_key: 'Reasoning is not configured on this server',
          upstream: 'The reasoning service did not answer',
          timeout: 'Breaking that down took too long',
          no_tool_call: 'That one did not come back as goals. It may be a subject the model will not plan for, which is worth knowing rather than working around',
          empty: 'That came back with no goals in it',
        };
        throw badRequest(why[drafted.failure ?? ''] ?? 'Could not break that down into goals just now');
      }
      const n = await save(req.user.id, input.intent, input.exchangeId ?? null, drafted.goals);
      await refresh(req.user.id);
      res.status(HttpStatusCode.Created).json({
        ok: true, data: { created: n, goals: await tree(req.user.id) },
      });
    } catch (e) { next(e); }
  },

  async confirm(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw unauthorized();
      const b = confirmSchema.parse(req.body ?? {});
      const g = await confirm(req.user.id, req.params.id as string,
        { value: b.baselineValue, text: b.baselineText });
      res.status(HttpStatusCode.Ok).json({ ok: true, data: g });
    } catch (e) { next(e); }
  },

  async abandon(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw unauthorized();
      await abandon(req.user.id, req.params.id as string);
      res.status(HttpStatusCode.NoContent).send();
    } catch (e) { next(e); }
  },
};
