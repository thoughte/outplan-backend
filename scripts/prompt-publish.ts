/** Publish the prompt in this repo over whatever is live.
 *
 *    npm run prompt:show                list every version, mark the active one
 *    npm run prompt:publish             publish TALK_V2 as a new version and activate it
 *
 *  WHY THIS EXISTS. `ensureDefaultPrompts` upgrades the active prompt at boot,
 *  but only when the active row is one this repo shipped, marked `notes:
 *  'shipped default'`. A row somebody wrote by hand is never touched, because
 *  silently reverting an edit made in production is the worst thing that
 *  function could do.
 *
 *  That guard is right and it also froze the live prompt. `talk.system` v5 was
 *  written directly with notes "no em dashes, no AI tells", so every later
 *  change to the text in this repo has been inert: the question-chain rewrite,
 *  the closing rules, the guess-stays-a-guess rule, all of it sat in the file
 *  while v5 kept saying "QUESTION: use it often" to a real person.
 *
 *  So the override is explicit and lives here, where running it is a decision
 *  somebody made rather than something a deploy did on its own.
 *
 *  Rows are NEVER updated. Publishing adds a version and moves activation, so
 *  every past answer stays traceable to the exact text that produced it, which
 *  is what `promptVersion` on each exchange is for.
 *
 *  It prints a diff of section headings first and refuses to publish if the live
 *  prompt has a section the new one lacks, unless --force is passed. A prompt is
 *  the only thing standing between a model and somebody's health record, and
 *  losing a section of it by accident is not a small mistake.
 */
import { prisma } from '../src/lib/prisma';
import { readFileSync } from 'node:fs';

const KEY = 'talk.system';

function shippedText(): string {
  const src = readFileSync('src/modules/prompt/defaults.ts', 'utf8');
  const open = 'const TALK_V2 = `';
  const start = src.indexOf(open);
  const end = src.indexOf('`;\n\n/** Marks a row');
  if (start < 0 || end < 0) throw new Error('could not find TALK_V2 in defaults.ts');
  return src.slice(start + open.length, end);
}

/** Section headings, which is the level a person can actually check. */
function sections(text: string): string[] {
  return text.split('\n').map((l) => l.trim()).filter((l) => /^[A-Z][A-Z ,'-]{6,}$/.test(l));
}

async function main() {
  const publish = process.argv.includes('--publish');
  const force = process.argv.includes('--force');

  try {
    const rows = await prisma.prompt.findMany({ where: { key: KEY }, orderBy: { version: 'desc' } });
    for (const r of rows) {
      console.log(`v${r.version}${r.active ? ' ACTIVE' : '      '}  ${r.content.length} chars  ${JSON.stringify(r.notes)}`);
    }
    const live = rows.find((r) => r.active);
    const next = shippedText();

    if (live && live.content === next) { console.log('\nalready live. nothing to do.'); return; }

    const lost = sections(live?.content ?? '').filter((h) => !sections(next).includes(h));
    const gained = sections(next).filter((h) => !sections(live?.content ?? '').includes(h));
    console.log(`\nrepo version: ${next.length} chars`);
    console.log('sections it would REMOVE:', lost.length ? '\n  ' + lost.join('\n  ') : ' (none)');
    console.log('sections it would ADD:', gained.length ? '\n  ' + gained.join('\n  ') : ' (none)');

    if (!publish) { console.log('\nnothing changed. add --publish to activate it.'); return; }
    if (lost.length && !force) {
      console.log(`\nREFUSED: the live prompt has ${lost.length} section(s) the new one does not.`);
      console.log('Read them above. If dropping them is the intent, add --force.');
      process.exitCode = 1;
      return;
    }

    const version = (rows[0]?.version ?? 0) + 1;
    await prisma.prompt.create({
      data: { key: KEY, version, content: next, notes: 'shipped default', active: false },
    });
    await prisma.$transaction([
      prisma.prompt.updateMany({ where: { key: KEY, active: true }, data: { active: false } }),
      prisma.prompt.updateMany({ where: { key: KEY, version }, data: { active: true } }),
    ]);
    console.log(`\npublished v${version} and activated it. v${live?.version} is untouched.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
