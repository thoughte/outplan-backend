import { initializeApp, cert, getApps, type App, type ServiceAccount } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { ENV_CONFIG } from './env.config';

/** Firebase Admin, initialised once.
 *
 *  The service account arrives base64-encoded in a single environment variable,
 *  because a multi-line PEM inside a JSON string survives approximately no
 *  deployment platform intact. It is a secret and therefore stays in the
 *  environment rather than app_config: a key in a table is readable by anything
 *  that can read the table.
 *
 *  Verification is LOCAL. firebase-admin fetches Google's public keys once and
 *  checks the JWT signature against that cache - there is no round trip per
 *  request, which is precisely why this needs no session table to avoid one.
 */
let app: App | null = null;

export function firebaseApp(): App {
  if (app) return app;
  const existing = getApps();
  if (existing.length) { app = existing[0]!; return app; }

  if (!ENV_CONFIG.FIREBASE_SERVICE_ACCOUNT) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT is not set. Every authenticated route depends ' +
      'on it, so failing here is better than failing per request.',
    );
  }
  const json = Buffer.from(ENV_CONFIG.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8');
  app = initializeApp({ credential: cert(JSON.parse(json) as ServiceAccount) });
  return app;
}

export function firebaseAuth(): Auth {
  return getAuth(firebaseApp());
}

export const firebaseConfigured = (): boolean => !!ENV_CONFIG.FIREBASE_SERVICE_ACCOUNT;
