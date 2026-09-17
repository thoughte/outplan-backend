/** Reference data, applied like a migration.
 *
 *  Deployment is a git push - there is no step where anyone runs a seed script
 *  against production, and expecting one is how the knowledge tree ends up empty
 *  on the only machine that matters. Every writer here must be an upsert.
 */
import { prisma } from '../src/lib/prisma';

async function main(): Promise<void> {
  // departments, knowledge nodes, lexicons - ported from app/outplan
  console.log('[seed] nothing to seed yet');
}

main()
  .catch((e) => { console.error('[seed]', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
