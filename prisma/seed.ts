/** Manual seed entry point. The real work is in src/modules/prompt/defaults.ts
 *  and runs at boot, because deployment is a git push and nobody runs this. */
import { prisma } from '../src/lib/prisma';
import { ensureDefaultPrompts } from '../src/modules/prompt/defaults';

ensureDefaultPrompts()
  .then(() => console.log('[seed] default prompts applied'))
  .catch((e) => { console.error('[seed]', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
