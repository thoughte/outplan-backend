import dotenv from 'dotenv';
import { defineConfig } from 'prisma/config';

dotenv.config();

/** Migrate's view of the database.
 *
 *  This reads process.env directly rather than importing ENV_CONFIG, because it
 *  runs in the production image where only dist/ exists - an import of
 *  ./src/config/env.config resolves to nothing there, and the migration fails
 *  before it reaches the database. The runtime client gets its connection
 *  through the pg adapter in src/lib/prisma.ts.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
