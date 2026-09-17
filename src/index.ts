import cors from 'cors';
import express from 'express';
import http from 'node:http';
import { ENV_CONFIG, assertConfig } from './config/env.config';
import { getSetting, seedSettings } from './config/app.config';
import { ensureDefaultPrompts } from './modules/prompt/defaults';
import { setupAppRoutes } from './routes.setup';

function createApp() {
  const app = express();

  // The allowlist is read per request from app_config, not captured at boot.
  // Adding an origin takes effect within the cache TTL instead of requiring a
  // redeploy - which is the entire point of moving it out of the environment.
  //
  // An unreachable database yields the default: an empty list, which denies
  // every cross-origin request. This API carries one person's health record, so
  // the failure mode is closed, and the origin is never reflected back.
  app.use(cors({
    credentials: true,
    origin: (origin, done) => {
      getSetting('cors.origins')
        .then((allowed) => {
          if (!origin) return done(null, true);          // same-origin or curl
          done(null, allowed.includes(origin));
        })
        .catch(() => done(null, false));
    },
  }));

  app.use(express.json({ limit: '1mb' }));
  app.disable('x-powered-by');

  setupAppRoutes(app);
  return app;
}

async function main() {
  assertConfig();

  // Any key missing from app_config arrives with its default. Safe on every
  // boot: an existing row keeps whatever it was set to.
  await seedSettings().catch((e) => {
    console.error('[config] could not seed settings:', e.message,
      '- serving defaults, which are the restrictive ones');
  });

  // Prompts, like settings, arrive with the code rather than by someone
  // remembering to run a script. Never overwrites an existing active version.
  await ensureDefaultPrompts().catch((e) => {
    console.error('[prompts] could not apply defaults:', e.message,
      '- talk will store words but produce no reply');
  });

  const server = http.createServer(createApp());
  server.listen(ENV_CONFIG.PORT, () => {
    console.log(`[outplan] listening on ${ENV_CONFIG.PORT} (${ENV_CONFIG.NODE_ENV})`);
  });
}

if (require.main === module) {
  main().catch((e) => { console.error('[outplan] failed to start:', e.message); process.exit(1); });
}

export { createApp };
