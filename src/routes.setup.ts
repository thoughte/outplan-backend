import type { Express, Request, Response } from 'express';
import { API_PREFIX } from './shared/constants';
import { ALL_ROUTES } from './shared/routes';
import { HttpStatusCode } from './shared/enums';
import { databaseHealth } from './lib/prisma';
import { volumeHealth } from './lib/files';
import { ENV_CONFIG } from './config/env.config';
import { fingerprint } from './config/fingerprint';
import { getSetting } from './config/app.config';
import { authMiddleware, requireSession, peopleOnly } from './middleware/auth.middleware';
import { reasoningHealth, looksLikeCredential } from './lib/reasoning-health';
import { notFoundMiddleware, errorMiddleware } from './middleware/error.middleware';
import { userController } from './modules/user/controller';
import { authSessionController } from './modules/auth-session/controller';
import { talkController } from './modules/talk/controller';
import { fileController, upload } from './modules/file/controller';
import { agentKeyController } from './modules/agent-key/controller';
import { appConfigController } from './modules/app-config/controller';
import { planController } from './modules/plan/controller';
import { goalController } from './modules/goal/controller';
import { farmController } from './modules/farm/controller';
import { careController } from './modules/care/controller';

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
    const [db, files] = await Promise.all([databaseHealth(), volumeHealth()]);

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

    // Whether the reasoning service has actually been answering, as opposed to
    // whether a key is set.
    //
    // This endpoint answered ok:true through a complete reasoning outage. The
    // production credential is an OAuth session, it expired, and every call
    // started coming back "Failed to authenticate: OAuth session expired and
    // could not be refreshed". Chat replies, record extraction, conversation
    // compaction and goal decomposition all stopped at once, and the only
    // symptom anybody could see was messages that never got answered. The check
    // here was that ANTHROPIC_API_KEY was present, which it was the whole time.
    // A key being set is not the same claim as a service answering.
    const reasoningState = reasoningHealth();
    const brain = {
      ...reasoningState,
      // Named plainly, because the fix differs. A 429 or a 529 wants waiting; an
      // expired credential wants a person to go and renew it.
      needsNewCredential: looksLikeCredential(reasoningState),
    };

    // Deliberately does NOT gate `ok`.
    //
    // Marking the container unhealthy would have the platform restart it, and a
    // restart cannot renew an expired OAuth session: it would crash-loop while
    // reporting the wrong problem. The same reasoning as the files volume a few
    // lines down. It is reported loudly and left to a human, which is the only
    // thing that can actually fix it.
    const ok = db.up && db.migrated && required.every((k) => config[k].present);
    // The files volume is REPORTED but does not gate `ok`. Nothing serving a
    // conversation needs it, and marking the container unhealthy over storage
    // would have the platform restarting a service that is answering fine -
    // the same mistake as requiring an unused Anthropic key at boot.
    res.status(ok ? HttpStatusCode.Ok : HttpStatusCode.ServiceUnavailable).json({
      ok, db, files, config, brain, at: new Date().toISOString(),
    });
  });

  // --- public -------------------------------------------------------------
  // The handful of settings a browser needs before anyone has signed in. An
  // allowlist inside the controller decides what that means; this table also
  // holds CORS origins and the model name.
  app.get(API_PREFIX + ALL_ROUTES.clientConfig, appConfigController.client);

  // The quiz and an invitation preview run BEFORE anyone signs up. That is the
  // whole referral idea: a link opens onto a friend's farm and the plot saved
  // for you, with no account and no install in the way. Both are therefore the
  // most exposed surfaces here, and both return earned rewards only.
  app.get(API_PREFIX + ALL_ROUTES.farm.quiz, farmController.quiz);
  app.get(API_PREFIX + ALL_ROUTES.farm.preview, farmController.preview);

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

  // Files. `upload.single` runs before the controller so multipart is parsed
  // into req.file; it is registered per route rather than globally, because a
  // body parser that runs on every request is a body parser that will one day
  // run on a request nobody checked.
  app.post(API_PREFIX + ALL_ROUTES.files.base, upload.single('file'), fileController.upload);
  app.get(API_PREFIX + ALL_ROUTES.files.base, fileController.list);
  // Before /files/:id, or Express reads "read-pending" as an id and this route
  // is unreachable - the same trap as /talk/export.
  app.post(API_PREFIX + ALL_ROUTES.files.readPending, fileController.readPending);
  app.get(API_PREFIX + ALL_ROUTES.files.content, fileController.content);

  // /talk/export before /talk/:id - Express matches in registration order, and
  // the other way round "export" is read as an id and the route is dead.
  app.get(API_PREFIX + ALL_ROUTES.agentKeys.base, agentKeyController.list);
  app.post(API_PREFIX + ALL_ROUTES.agentKeys.base, agentKeyController.create);
  app.delete(API_PREFIX + ALL_ROUTES.agentKeys.one, agentKeyController.revoke);

  // /goals/propose before /goals/:id, or Express reads "propose" as an id and
  // the route is unreachable - the same trap as /talk/export.
  app.get(API_PREFIX + ALL_ROUTES.farm.base, farmController.mine);
  // Specific paths before /farm/invite/:code, or Express reads "quiz" as a code.
  app.post(API_PREFIX + ALL_ROUTES.farm.plant, farmController.plant);
  app.get(API_PREFIX + ALL_ROUTES.farm.discoveries, farmController.discoveries);
  app.get(API_PREFIX + ALL_ROUTES.farm.roots, farmController.roots);
  app.get(API_PREFIX + ALL_ROUTES.farm.neighbours, farmController.neighbours);
  app.post(API_PREFIX + ALL_ROUTES.farm.invite, farmController.invite);
  app.post(API_PREFIX + ALL_ROUTES.farm.accept, farmController.accept);

  app.get(API_PREFIX + ALL_ROUTES.care.base, careController.mine);
  app.post(API_PREFIX + ALL_ROUTES.care.base, careController.add);
  app.post(API_PREFIX + ALL_ROUTES.care.one, careController.share);
  app.post(API_PREFIX + ALL_ROUTES.care.pause, careController.pause);
  app.get(API_PREFIX + ALL_ROUTES.care.view, careController.view);

  app.get(API_PREFIX + ALL_ROUTES.goals.base, goalController.list);
  app.post(API_PREFIX + ALL_ROUTES.goals.propose, goalController.propose);
  app.post(API_PREFIX + ALL_ROUTES.goals.confirm, goalController.confirm);
  app.delete(API_PREFIX + ALL_ROUTES.goals.one, goalController.abandon);

  app.get(API_PREFIX + ALL_ROUTES.plan.base, planController.today);
  app.post(API_PREFIX + ALL_ROUTES.plan.done, planController.setDone);

  // Conversation is the person, not the agent. An agent key carries no scope
  // for it, and this is where that is actually enforced rather than merely
  // recorded in a column.
  // Reading a conversation back is refused for an agent key. Sending is not:
  // a rehearsal has to go through the real path, and the exchange it creates is
  // marked so it is never mistaken for something he said.
  app.get(API_PREFIX + ALL_ROUTES.talk.base, peopleOnly);
  app.get(API_PREFIX + ALL_ROUTES.talk.one, peopleOnly);
  app.get(API_PREFIX + ALL_ROUTES.talk.export, peopleOnly);
  app.get(API_PREFIX + ALL_ROUTES.talk.export, talkController.exportAll);
  app.post(API_PREFIX + ALL_ROUTES.talk.base, talkController.say);
  app.get(API_PREFIX + ALL_ROUTES.talk.base, talkController.list);
  app.get(API_PREFIX + ALL_ROUTES.talk.one, talkController.one);
  app.post(API_PREFIX + ALL_ROUTES.talk.correct, talkController.correct);
  app.delete(API_PREFIX + ALL_ROUTES.talk.record, talkController.unrecord);
  app.delete(API_PREFIX + ALL_ROUTES.talk.undoThing, talkController.undoThing);
  // Multipart, so it needs the same upload middleware the Records screen uses.
  app.post(API_PREFIX + ALL_ROUTES.talk.attach, upload.single('file'), talkController.attach);

  // --- ADMIN BOUNDARY -----------------------------------------------------
  // app.use(API_PREFIX + '/admin', requireRole('admin'));

  // --- terminal -----------------------------------------------------------
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);
}
