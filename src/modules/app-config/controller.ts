import type { Request, Response, NextFunction } from 'express';
import { HttpStatusCode } from '../../shared/enums';
import { getSetting } from '../../config/app.config';

/** The settings a browser is allowed to know.
 *
 *  An allowlist, and it will always be an allowlist. This table also holds the
 *  CORS origins and which model is in use; a handler that returned the whole
 *  thing would publish the lot the first time someone added a key without
 *  thinking about this endpoint. Adding a setting must never be the same act as
 *  exposing it.
 */
const PUBLIC_KEYS = ['talk.status_labels', 'talk.placeholder', 'talk.max_message_chars'] as const;

export const appConfigController = {
  async client(_req: Request, res: Response, next: NextFunction) {
    try {
      const entries = await Promise.all(
        PUBLIC_KEYS.map(async (k) => [k, await getSetting(k).catch(() => null)] as const),
      );
      const data = Object.fromEntries(entries.filter(([, v]) => v !== null));
      // Briefly cacheable. These change rarely, a stale label for a minute costs
      // nothing, and fetching them on every app open costs a round trip before
      // the first message can be sent.
      res.setHeader('Cache-Control', 'public, max-age=60');
      res.status(HttpStatusCode.Ok).json({ ok: true, data });
    } catch (e) { next(e); }
  },
};
