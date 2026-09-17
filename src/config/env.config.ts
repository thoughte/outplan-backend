import dotenv from 'dotenv';

dotenv.config();

/** The environment holds FOUR things, and only four.
 *
 *  DATABASE_URL, because it is how the rest of the configuration is reached.
 *  The two Anthropic values and the Firebase service account, because they are
 *  secrets and a secret in a table is readable by anything that can read the
 *  table - including a bug in an unrelated query.
 *
 *  Everything else - CORS origins, the model name, timezone, limits - lives in
 *  app_config and is changeable without a redeploy. See src/config/app.config.ts.
 *  A value that needs a rebuild to change is not configuration, it is a constant
 *  with extra steps.
 *
 *  NODE_ENV and PORT are set by the image and the platform respectively and are
 *  read here rather than configured: the process must bind a port before it can
 *  query anything, so PORT cannot come from the database.
 */
export const ENV_CONFIG = {
  DATABASE_URL: process.env.DATABASE_URL ?? '',
  ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
  FIREBASE_SERVICE_ACCOUNT: process.env.FIREBASE_SERVICE_ACCOUNT ?? '',

  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: Number(process.env.PORT ?? 4000),
} as const;

/** Refuse to start rather than failing per request.
 *
 *  A process that boots without these looks healthy and then returns 500 to
 *  every authenticated request with no indication why - which is exactly what
 *  happened the first time this was tested: a missing service account surfaced
 *  as "Something broke on our side" on a route whose real answer was 401.
 */
export function assertConfig(): void {
  const missing: string[] = [];
  if (!ENV_CONFIG.DATABASE_URL) missing.push('DATABASE_URL');
  if (!ENV_CONFIG.FIREBASE_SERVICE_ACCOUNT) missing.push('FIREBASE_SERVICE_ACCOUNT');

  if (missing.length) {
    throw new Error(
      `Missing: ${missing.join(', ')}. Every authenticated route depends on ` +
      `these, so failing here is better than failing on every request.`,
    );
  }
}
