import dotenv from 'dotenv';
import { defineConfig } from 'prisma/config';

dotenv.config();

/** Migrate's view of the database.
 *
 *  Plain ESM, not TypeScript, and that is deliberate. Keshav's guide shows a
 *  .ts config, which was right before Prisma 7 - but a .ts config needs a
 *  TypeScript runtime present wherever the CLI runs, and the CLI runs in the
 *  production image to apply migrations at boot. Shipping ts-node and the whole
 *  compiler into a runtime image to read six lines of configuration is a worse
 *  trade than writing those six lines in JavaScript. Compiling it does not help:
 *  tsc emits CommonJS and Prisma 7 requires ESM.
 *
 *  It reads process.env directly rather than importing ENV_CONFIG, because the
 *  production image contains only dist/ and that import would resolve to
 *  nothing. It configures a CLI; it has no business depending on the app.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
