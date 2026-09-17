import { defineConfig } from 'prisma/config';
import { ENV_CONFIG } from './src/config/env.config';

/** Migrate's view of the database. The runtime client does not read this - it
 *  gets its connection through the pg adapter in src/lib/prisma.ts. Both read
 *  the same ENV_CONFIG, so there is one source for the URL and no second place
 *  to forget to update. */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: ENV_CONFIG.DATABASE_URL },
});
