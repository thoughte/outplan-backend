/** Dump one account's conversation for review.
 *
 *    npm run transcript -- someone@example.com
 *
 *  This reads message content, which the diagnostics script deliberately does
 *  not. It exists because reviewing a stress test eventually means reading what
 *  was actually said - but keeping it in a separate, explicitly-invoked command
 *  means that never happens as a side effect of checking whether the app works.
 */
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../src/lib/prisma';

async function main(): Promise<void> {
  const email = process.argv[2];
  if (!email) { console.error('usage: npm run transcript -- <email>'); process.exit(1); }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) { console.error(`no account for ${email}`); process.exit(1); }

  const rows = await prisma.exchange.findMany({
    where: { userId: user.id },
    include: { corrections: { orderBy: { createdAt: 'asc' } } },
    orderBy: { saidAt: 'asc' },
  });

  const lines: string[] = [`# ${email} — ${rows.length} exchanges\n`];
  for (const e of rows) {
    const t = e.saidAt.toISOString().slice(11, 16);
    const p = e.replyParts as { messages?: string[]; question?: { text: string; options: string[] } } | null;
    lines.push(`[${t}] (${e.promptVersion ?? 'no prompt'})`);
    lines.push(`  THEM: ${e.said}`);
    if (p?.messages?.length) {
      p.messages.forEach((m, i) => lines.push(`  APP ${i + 1}: ${m}`));
      if (p.question) lines.push(`  ASK : ${p.question.text}  [${p.question.options.join(' | ')}]`);
    } else if (e.replied) {
      lines.push(`  APP : ${e.replied}`);
    } else {
      lines.push('  APP : (no reply)');
    }
    for (const c of e.corrections) lines.push(`  FIX : ${c.wasWrong}${c.isRight ? ` -> ${c.isRight}` : ''}`);
    lines.push('');
  }

  const out = path.join('/tmp', `transcript-${email.replace(/[^a-z0-9]/gi, '_')}.txt`);
  fs.writeFileSync(out, lines.join('\n'));
  console.log(`wrote ${rows.length} exchanges to ${out}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
