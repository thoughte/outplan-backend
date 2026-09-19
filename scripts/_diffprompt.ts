import { prisma } from '../src/lib/prisma';
import { readFileSync } from 'node:fs';

async function main() {
  try {
    const live = await prisma.prompt.findFirst({ where: { key: 'talk.system', active: true } });
    if (!live) { console.log('no active prompt'); return; }

    // TALK_V2 as it stands in the repo right now.
    const src = readFileSync('src/modules/prompt/defaults.ts', 'utf8');
    const v2 = src.slice(src.indexOf('const TALK_V2 = `') + 'const TALK_V2 = `'.length, src.indexOf('`;\n\n/** Marks a row'));

    const heads = (t: string) => t.split('\n').filter((l) => /^[A-Z][A-Z ,'-]{6,}$/.test(l.trim())).map((l) => l.trim());
    const a = new Set(heads(live.content));
    const b = new Set(heads(v2));

    console.log(`live v${live.version}: ${live.content.length} chars, ${a.size} sections`);
    console.log(`repo TALK_V2: ${v2.length} chars, ${b.size} sections\n`);

    const lost = [...a].filter((h) => !b.has(h));
    const gained = [...b].filter((h) => !a.has(h));
    console.log('SECTIONS ONLY IN THE LIVE ONE (would be lost):');
    console.log(lost.length ? lost.map((h) => '  ' + h).join('\n') : '  (none)');
    console.log('\nSECTIONS ONLY IN THE REPO ONE (would be gained):');
    console.log(gained.map((h) => '  ' + h).join('\n'));

    console.log('\nchecks on the repo version:');
    for (const [label, re] of [
      ['em dash present', /—/], ['no-em-dash rule kept', /NO EM DASHES/],
      ['"use it often" gone', /QUESTION: use it often/], ['new ask rule', /MOSTLY DO NOT ASK/],
      ['insult section kept', /IF THEY INSULT YOU/], ['nothing off topic kept', /NOTHING IS OFF TOPIC/],
    ] as const) {
      console.log(`  ${label}: ${re.test(v2)}`);
    }
  } finally { await prisma.$disconnect(); }
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
