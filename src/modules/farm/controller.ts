import type { Response, NextFunction } from 'express';
import { HttpStatusCode } from '../../shared/enums';
import { unauthorized } from '../../errors/app.errors';
import type { AuthenticatedRequest } from '../../shared/types';
import { farmFor } from './service';

export const farmController = {
  /** The farm, worked out fresh.
   *
   *  Nothing about it is stored, so there is nothing to invalidate and nothing
   *  that can disagree with the record it describes. It is a read of rows that
   *  already exist for their own reasons.
   */
  async mine(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw unauthorized();
      res.status(HttpStatusCode.Ok).json({ ok: true, data: await farmFor(req.user.id) });
    } catch (e) { next(e); }
  },
};
