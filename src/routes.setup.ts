import type { Express, Request, Response } from 'express';
import { API_PREFIX } from './shared/constants';
import { ALL_ROUTES } from './shared/routes';
import { HttpStatusCode } from './shared/enums';
import { databaseHealth } from './lib/prisma';
import { ENV_CONFIG } from './config/env.config';
import { fingerprint } from './config/fingerprint';
import { authMiddleware } from './middleware/auth.middleware';
import { notFoundMiddleware, errorMiddleware } from './middleware/error.middleware';
import { userController } from './modules/user/controller';

/** Registration order is the security model, not a style choice.
 *
 *    health        - before everything, and never redirected
 *    public        - nothing yet: Firebase handles sign-in in the browser, so
 *                    this API has no login endpoint to expose
 *    AUTH          - everything below this line requires a verified token
 *    authenticated - the app
 *    ADMIN         - everything below this line requires a role
 *
 *  A route registered above the auth middleware is public whether or not anyone
 *  intended it to be. This file is the only place that fact is visible, which is
 *  why every module registers here rather than mounting itself.
 */
export function setupAppRoutes(app: Express): void {
  // --- health -------------------------------------------------------------
  app.get(ALL_ROUTES.health, async (_req: Request, res: Response) => {
    const db = await databaseHealth();

    // Which configuration this process actually received. Fingerprints, never
    // values - see src/config/fingerprint.ts for why this is not the first and
    // last few characters. It lives on the PUBLIC health endpoint on purpose:
    // the thing it diagnoses is a missing or truncated secret, and when that
    // secret is the one auth depends on, an authenticated endpoint cannot
    // report it.
    const config = {
      database_url: fingerprint(ENV_CONFIG.DATABASE_URL),
      anthropic_base_url: fingerprint(ENV_CONFIG.ANTHROPIC_BASE_URL),
      anthropic_api_key: fingerprint(ENV_CONFIG.ANTHROPIC_API_KEY),
      firebase_service_account: fingerprint(ENV_CONFIG.FIREBASE_SERVICE_ACCOUNT),
    };

    const ok = db.up && db.migrated && Object.values(config).every((c) => c.present);
    res.status(ok ? HttpStatusCode.Ok : HttpStatusCode.ServiceUnavailable).json({
      ok, db, config, at: new Date().toISOString(),
    });
  });

  // --- public -------------------------------------------------------------
  // None. Sign-in and sign-up happen in the browser against Firebase; the
  // backend only ever verifies the resulting token.

  // --- AUTH BOUNDARY ------------------------------------------------------
  app.use(API_PREFIX, authMiddleware);

  // --- authenticated ------------------------------------------------------
  app.get(API_PREFIX + ALL_ROUTES.me, userController.me);
  app.patch(API_PREFIX + ALL_ROUTES.me, userController.updateMe);

  // --- ADMIN BOUNDARY -----------------------------------------------------
  // app.use(API_PREFIX + '/admin', requireRole('admin'));

  // --- terminal -----------------------------------------------------------
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);
}
