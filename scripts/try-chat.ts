/** Say something to the assistant as a real account, and watch what it does.
 *
 *    npm run try -- <email> "how do I create a goal?"
 *    npm run try -- <email> "how do I create a goal?" --dry
 *
 *  WHY THIS EXISTS. `/talk` refuses agent keys on purpose: an agent key may move
 *  records and must never put words in somebody's mouth. That rule is right and
 *  it also meant every change to the conversation shipped untested, with him
 *  asked to go and try it. Three real bugs reached him that way in one evening:
 *  a goal created twice for one sentence, a tool result truncated mid-JSON, and
 *  a goal switched on that he never asked to switch on.
 *
 *  So this drives the SAME path a message takes, in process, without pretending
 *  to be him over HTTP. It prints every tool the model reaches for, what it got
 *  back and how big that was, and the reply.
 *
 *  --dry runs everything except the writes: operations are matched against the
 *  registry and their arguments validated, but `run` is not called. Use it on a
 *  real account. Without it, this writes to that person's record exactly as a
 *  real message would.
 */
import { prisma } from '../src/lib/prisma';
import { reason } from '../src/lib/anthropic';
import { promptRepo } from '../src/modules/prompt/repo';
import { TALK_PROMPT_KEY } from '../src/modules/prompt/defaults';
import { buildBrief } from '../src/modules/record/brief';
import { clockFor, localDay } from '../src/shared/helper';
import { OPS, BY_NAME } from '../src/modules/talk/tools/ops';
import { toolSchema } from '../src/modules/talk/tools/registry';
import { runOp } from '../src/modules/talk/tools/run';
import { platformNotes } from '../src/modules/talk/tools/platform';

async function main() {
  const email = process.argv[2];
  const said = process.argv[3];
  const dry = process.argv.includes('--dry');
  if (!email || !said) {
    console.error('usage: try-chat.ts <email> "<message>" [--dry]');
    process.exit(1);
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) { console.error(`no account for ${email}`); process.exit(1); }

    const prompt = await promptRepo.active(TALK_PROMPT_KEY);
    if (!prompt) { console.error('no active prompt'); process.exit(1); }

    const day = localDay(new Date(), user.timezone);
    const brief = await buildBrief(user.id).catch(() => null);
    const platform = await platformNotes().catch(() => '');
    const clock = clockFor(new Date(), user.timezone);

    const system = [
      prompt.content,
      `---\n\n${user.name ? `You are talking to ${user.name}. ` : ''}${clock ? `It is ${clock} where they are.` : ''}`,
      brief ? `---\n\n${brief}` : null,
      platform ? `---\n\n${platform}` : null,
    ].filter(Boolean).join('\n\n');

    console.log(`prompt ${prompt.key}@${prompt.version}, system ${system.length} chars${dry ? ', DRY RUN' : ''}`);
    console.log(`\n> ${said}\n`);

    const history: Array<{ role: 'user' | 'assistant'; content: unknown }> = [
      { role: 'user', content: said },
    ];
    const ctx = { userId: user.id, localDay: day, exchangeId: '00000000-0000-0000-0000-000000000000' };

    let result = await reason(system, history, { tools: OPS.map(toolSchema) });
    let calls = 0;

    for (let round = 0; round < 4 && result?.ops.length; round++) {
      const results: unknown[] = [];
      for (const ask of result.ops) {
        calls++;
        const op = BY_NAME.get(ask.name);
        const tier = op?.tier ?? 'UNKNOWN';
        if (dry) {
          const parsed = op?.schema.safeParse(ask.input ?? {});
          console.log(`  [${tier}] ${ask.name}  args=${JSON.stringify(ask.input)}  valid=${parsed?.success ?? false}`);
          results.push({ type: 'tool_result', tool_use_id: ask.id, content: '{"ok":true,"dry":true}' });
          continue;
        }
        const out = await runOp(ask, ctx);
        const body = JSON.stringify(out.result);
        console.log(`  [${tier}] ${ask.name}  ${body.length} bytes  ${out.say ? `→ ${out.say}` : ''}`);
        results.push({ type: 'tool_result', tool_use_id: ask.id, content: body.slice(0, 12_000) });
      }
      history.push({ role: 'assistant', content: result.raw });
      history.push({ role: 'user', content: results });
      result = await reason(system, history, { tools: OPS.map(toolSchema), timeoutMs: 120_000 });
    }

    console.log(`\ntools used: ${calls}`);
    console.log(`\n${result?.parts.messages.join('\n') ?? '(no reply)'}`);
    if (result?.parts.question) {
      console.log(`\nQ: ${result.parts.question.text}  [${result.parts.question.options.join(' / ')}]`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
