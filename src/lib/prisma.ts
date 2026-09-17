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

export interface DatabaseHealth {
  up: boolean;
  migrated: boolean;
  pending: number;
  /** How many migrations have finished, and the newest one by name.
   *
   *  Counting unfinished rows is not enough, and that gap bit twice. A migration
   *  that never REACHED the database has no row at all, so "pending: 0" reads
   *  identically whether every migration applied or the deploy never happened.
   *  The name is what makes it checkable from outside: compare it against the
   *  newest directory in prisma/migrations and you know which build is actually
   *  serving.
   */
  applied: number;
  latest: string | null;
}

/** Reachable AND migrated. A database that answers SELECT 1 with no tables is
 *  not healthy, and reporting it as such is how a broken deploy shows green. */
export async function databaseHealth(): Promise<DatabaseHealth> {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    return { up: false, migrated: false, pending: -1, applied: 0, latest: null };
  }
  try {
    const rows = await prisma.$queryRaw<Array<{ migration_name: string; finished_at: Date | null }>>`
      SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY started_at`;
    const pending = rows.filter((r) => r.finished_at === null).length;
    const done = rows.filter((r) => r.finished_at !== null);
    return {
      up: true,
      migrated: pending === 0 && done.length > 0,
      pending,
      applied: done.length,
      latest: done.length ? (done[done.length - 1]!.migration_name ?? null) : null,
    };
  } catch {
    return { up: true, migrated: false, pending: -1, applied: 0, latest: null };
  }
}
