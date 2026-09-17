import cors from 'cors';
import express from 'express';
import http from 'node:http';
import { ENV_CONFIG, assertConfig } from './config/env.config';
import { setupAppRoutes } from './routes.setup';

function createApp() {
  const app = express();

  // An empty allowlist means same-origin only. Never reflect the request
  // origin: this API carries one person's health record.
  app.use(cors({
    origin: ENV_CONFIG.CORS_ORIGINS.length ? ENV_CONFIG.CORS_ORIGINS : false,
    credentials: true,
  }));

  app.use(express.json({ limit: '1mb' }));
  app.disable('x-powered-by');

  setupAppRoutes(app);
  return app;
}

async function main() {
  assertConfig();
  const server = http.createServer(createApp());
  server.listen(ENV_CONFIG.PORT, () => {
    console.log(`[outplan] listening on ${ENV_CONFIG.PORT} (${ENV_CONFIG.NODE_ENV})`);
  });
}

if (require.main === module) {
  main().catch((e) => { console.error('[outplan] failed to start:', e.message); process.exit(1); });
}

export { createApp };
