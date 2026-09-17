import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';
import { ENV_CONFIG } from '../config/env.config';

/** One client for the process.
 *
 *  The pg adapter is used rather than Prisma's own engine because this schema
 *  keeps ltree, generated tsvector columns and optionally pgvector in raw SQL
 *  migrations that Prisma does not model. Those are read through $queryRaw in a
 *  repository layer; Prisma owns the ordinary relational models only. */
const adapter = new PrismaPg({ connectionString: ENV_CONFIG.DATABASE_URL });

export const prisma = new PrismaClient({
  adapter,
  log: ENV_CONFIG.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

/** Reachable AND migrated. A database that answers SELECT 1 with no tables is
 *  not healthy, and reporting it as such is how a broken deploy shows green. */
export async function databaseHealth(): Promise<{ up: boolean; migrated: boolean; pending: number }> {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    return { up: false, migrated: false, pending: -1 };
  }
  try {
    const rows = await prisma.$queryRaw<Array<{ pending: bigint }>>`
      SELECT count(*) AS pending FROM _prisma_migrations WHERE finished_at IS NULL`;
    const pending = Number(rows[0]?.pending ?? 0);
    return { up: true, migrated: pending === 0, pending };
  } catch {
    return { up: true, migrated: false, pending: -1 };
  }
}
