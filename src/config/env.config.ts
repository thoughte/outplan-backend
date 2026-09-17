import dotenv from 'dotenv';

dotenv.config();

/** Every environment variable, read once, in one place.
 *
 *  DATABASE_URL has no default on purpose. A default here would let the process
 *  start against nothing and fail at the first query - which is how a
 *  half-configured deployment reports healthy while every request 500s. */
export const ENV_CONFIG = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: Number(process.env.PORT ?? 4000),
  TZ: process.env.TZ ?? 'Asia/Kolkata',

  DATABASE_URL: process.env.DATABASE_URL ?? '',

  CORS_ORIGINS: (process.env.CORS_ORIGINS ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean),

  ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com',
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '',
  REASONING_MODEL: process.env.REASONING_MODEL ?? 'claude-sonnet-5',
} as const;

export function assertConfig(): void {
  const missing: string[] = [];
  if (!ENV_CONFIG.DATABASE_URL) missing.push('DATABASE_URL');
  if (missing.length) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
      `Refusing to start rather than failing at the first request.`,
    );
  }
}
