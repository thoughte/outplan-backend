import cors from 'cors';
import express from 'express';
import http from 'node:http';
import { ENV_CONFIG, assertConfig } from './config/env.config';
import { getSetting, seedSettings } from './config/app.config';
import { ensureDefaultPrompts } from './modules/prompt/defaults';
import { setupAppRoutes } from './routes.setup';
import { stampBoot } from './lib/files';
import { digestPending } from './modules/record/digest';
import { prisma } from './lib/prisma';

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

/** Read anything uploaded but not yet read.
 *
 *  Uploads happen from a phone, one tap, and reading a PDF takes seconds - so
 *  it is deliberately not part of the upload request. This runs on every boot
 *  and picks up whatever is outstanding, which also means a file that failed to
 *  read once gets another attempt on the next deploy rather than being stuck
 *  forever behind a transient error.
 *
 *  It never extracts measurements. See modules/record/digest.
 */
async function catchUpOnFiles(): Promise<void> {
  try {
    const users = await prisma.user.findMany({
      where: { files: { some: { digestedAt: null } } },
      select: { id: true, email: true },
    });
    for (const u of users) {
      // The name to check a report against comes from the account, and the only
      // account with a record to protect is his. Anything else is left alone.
      const name = u.email === 'ekunalkhanna@gmail.com' ? 'Kunal Khanna' : null;
      if (!name) continue;
      const results = await digestPending(u.id, name);
      for (const r of results) {
        console.log(`[digest] ${r.result.padEnd(24)} ${r.file}${r.detail ? ' - ' + r.detail : ''}`);
      }
    }
  } catch (e) {
    console.error('[digest] could not run:', (e as Error).message,
      '- files stay stored and unread, and the next boot tries again');
  }
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

  // Records this boot on the files volume, so /health can later show that the
  // storage predates the running container. Never throws.
  await stampBoot();

  const server = http.createServer(createApp());
  server.listen(ENV_CONFIG.PORT, () => {
    console.log(`[outplan] listening on ${ENV_CONFIG.PORT} (${ENV_CONFIG.NODE_ENV})`);
    // AFTER listening, never before. Reading a 43-page scan takes a second or
    // two, and a deploy that waits for a backlog is a deploy where the service
    // is down while it works - the exact failure that took this API off the
    // internet this morning. The health check passes first; files catch up.
    void catchUpOnFiles();
  });
}

if (require.main === module) {
  main().catch((e) => { console.error('[outplan] failed to start:', e.message); process.exit(1); });
}

export { createApp };
