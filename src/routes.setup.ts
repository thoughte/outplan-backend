import type { Express, Request, Response } from 'express';
import { API_PREFIX } from './shared/constants';
import { ALL_ROUTES } from './shared/routes';
import { HttpStatusCode } from './shared/enums';
import { databaseHealth } from './lib/prisma';
import { notFoundMiddleware, errorMiddleware } from './middleware/error.middleware';

/** Registration order is the security model, not a style choice.
 *
 *    health        - before everything, and never redirected
 *    public        - sign-in, sign-up
 *    AUTH          - everything below this line requires a user
 *    authenticated - the app
 *    ADMIN         - everything below this line requires a role
 *
 *  A route registered above the auth middleware is public whether or not anyone
 *  intended it to be. This file is the only place that fact is visible, which is
 *  why every module registers here rather than mounting itself. */
export function setupAppRoutes(app: Express): void {
  // --- health -------------------------------------------------------------
  app.get(ALL_ROUTES.health, async (_req: Request, res: Response) => {
    const db = await databaseHealth();
    const ok = db.up && db.migrated;
    res.status(ok ? HttpStatusCode.Ok : HttpStatusCode.ServiceUnavailable).json({
      ok, db, at: new Date().toISOString(),
    });
  });

  // --- public -------------------------------------------------------------
  // (auth module mounts here once the auth decision is made)

  // --- AUTH BOUNDARY ------------------------------------------------------
  // app.use(authMiddleware);

  // --- authenticated ------------------------------------------------------
  // app.use(API_PREFIX + ALL_ROUTES.talk.base, talkRouter);
  void API_PREFIX;

  // --- ADMIN BOUNDARY -----------------------------------------------------
  // app.use(adminMiddleware);

  // --- terminal -----------------------------------------------------------
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);
}
