import dotenv from 'dotenv';

dotenv.config();

/** The environment holds THREE things, and only three.
 *
 *  DATABASE_URL, because it is how the rest of the configuration is reached.
 *  The two Anthropic values, because they are secrets and a secret in a table is
 *  readable by anything that can read the table.
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

  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: Number(process.env.PORT ?? 4000),
} as const;

export function assertConfig(): void {
  if (!ENV_CONFIG.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not set. Refusing to start rather than failing at the ' +
      'first request - a process that boots against nothing reports healthy ' +
      'until someone uses it.',
    );
  }
}
