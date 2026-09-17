import type { Express, Request, Response } from 'express';
import { API_PREFIX } from './shared/constants';
import { ALL_ROUTES } from './shared/routes';
import { HttpStatusCode } from './shared/enums';
import { databaseHealth } from './lib/prisma';
import { ENV_CONFIG } from './config/env.config';
import { fingerprint } from './config/fingerprint';
import { getSetting } from './config/app.config';
import { authMiddleware, requireSession } from './middleware/auth.middleware';
import { notFoundMiddleware, errorMiddleware } from './middleware/error.middleware';
import { userController } from './modules/user/controller';
import { authSessionController } from './modules/auth-session/controller';

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

    // `ok` means "can this process do its job", not "is every variable set".
    // The database and Firebase are required to serve anything at all. The
    // Anthropic key is required only when reasoning is switched on - marking a
    // container unhealthy over a key nothing calls yet would have the platform
    // restarting a working service.
    const reasoning = await getSetting('reasoning.enabled').catch(() => false);
    const required = reasoning
      ? (['database_url', 'firebase_service_account', 'anthropic_api_key'] as const)
      : (['database_url', 'firebase_service_account'] as const);

    const ok = db.up && db.migrated && required.every((k) => config[k].present);
    res.status(ok ? HttpStatusCode.Ok : HttpStatusCode.ServiceUnavailable).json({
      ok, db, config, at: new Date().toISOString(),
    });
  });

  // --- public -------------------------------------------------------------
  // None. Sign-in and sign-up happen in the browser against Firebase; the
  // backend only ever verifies the resulting token.

  // --- AUTH BOUNDARY ------------------------------------------------------
  app.use(API_PREFIX, authMiddleware);

  // --- token verified, session NOT yet required ---------------------------
  // Registering a device is the one call that cannot require a session: it is
  // the call that creates one.
  app.post(API_PREFIX + ALL_ROUTES.sessions.base, authSessionController.start);

  // --- SESSION BOUNDARY ---------------------------------------------------
  // Below this line a request needs a live session as well as a valid token.
  app.use(API_PREFIX, requireSession);

  // --- authenticated ------------------------------------------------------
  app.get(API_PREFIX + ALL_ROUTES.me, userController.me);
  app.patch(API_PREFIX + ALL_ROUTES.me, userController.updateMe);

  app.get(API_PREFIX + ALL_ROUTES.sessions.base, authSessionController.list);
  app.delete(API_PREFIX + ALL_ROUTES.sessions.one, authSessionController.revokeOne);
  app.delete(API_PREFIX + ALL_ROUTES.sessions.base, authSessionController.revokeAll);

  // --- ADMIN BOUNDARY -----------------------------------------------------
  // app.use(API_PREFIX + '/admin', requireRole('admin'));

  // --- terminal -----------------------------------------------------------
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);
}
