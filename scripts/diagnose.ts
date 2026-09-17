/** What the app is actually doing, without reading anyone's words.
 *
 *    npm run diag
 *
 *  Built because inspecting a stress test should not mean hand-writing SQL, and
 *  because the interesting questions during one are structural: is it answering,
 *  how fast, how long are the replies, is it using the features it was given,
 *  and is anyone correcting it.
 *
 *  It deliberately prints NO message content. Everything here is a count, a
 *  length or a duration - enough to find a bug, not enough to read a health
 *  record. Reading the words is a separate, deliberate act.
 */
import { prisma } from '../src/lib/prisma';

const pad = (s: string | number, n: number) => String(s).padEnd(n);
const num = (s: string | number, n: number) => String(s).padStart(n);

async function main(): Promise<void> {
  const [users, exchanges, corrections, sessions] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.exchange.findMany({ orderBy: { saidAt: 'asc' } }),
    prisma.correction.findMany(),
    prisma.authSession.findMany(),
  ]);

  const parts = (e: (typeof exchanges)[number]) =>
    (e.replyParts as { messages?: string[]; question?: unknown } | null) ?? null;

  // ---- overall ------------------------------------------------------------
  const unanswered = exchanges.filter((e) => !e.replied);
  const latencies = exchanges
    .filter((e) => e.repliedAt)
    .map((e) => e.repliedAt!.getTime() - e.saidAt.getTime())
    .sort((a, b) => a - b);

  console.log('\n  OVERALL');
  console.log(`    users ${users.length}   exchanges ${exchanges.length}   sessions ${sessions.length}`);
  console.log(`    unanswered ${unanswered.length}${unanswered.length ? '   <-- these failed' : ''}`);
  console.log(`    corrections ${corrections.length}${
    exchanges.length && corrections.length === 0
      ? '   <-- nobody has told it it was wrong. Either it is never wrong, or the affordance is invisible.'
      : ''}`);
  if (latencies.length) {
    const p = (q: number) => Math.round(latencies[Math.floor(latencies.length * q)] ?? 0) / 1000;
    console.log(`    reply time  p50 ${p(0.5)}s   p90 ${p(0.9)}s   max ${Math.round(latencies.at(-1)! / 1000)}s`);
  }

  // ---- per prompt version -------------------------------------------------
  console.log('\n  BY PROMPT VERSION');
  console.log(`    ${pad('version', 18)}${num('turns', 6)}${num('avg reply', 11)}${num('bubbles', 9)}${num('questions', 11)}`);
  const versions = new Map<string, typeof exchanges>();
  for (const e of exchanges) {
    const k = e.promptVersion ?? '(none)';
    versions.set(k, [...(versions.get(k) ?? []), e]);
  }
  for (const [v, rows] of [...versions].sort()) {
    const withParts = rows.map(parts).filter((p): p is { messages: string[] } => !!p?.messages);
    const bubbles = withParts.length
      ? (withParts.reduce((n, p) => n + p.messages.length, 0) / withParts.length).toFixed(2)
      : '-';
    const qs = rows.filter((e) => (parts(e) as { question?: unknown } | null)?.question).length;
    const avg = Math.round(rows.reduce((n, e) => n + (e.replied?.length ?? 0), 0) / rows.length);
    console.log(`    ${pad(v, 18)}${num(rows.length, 6)}${num(avg, 11)}${num(bubbles, 9)}${num(withParts.length ? qs : '-', 11)}`);
  }

  // ---- per person ---------------------------------------------------------
  console.log('\n  BY ACCOUNT');
  console.log(`    ${pad('email', 32)}${num('turns', 6)}${num('answered', 10)}${num('avg typed', 11)}${num('corrections', 13)}`);
  for (const u of users) {
    const mine = exchanges.filter((e) => e.userId === u.id);
    if (!mine.length) { console.log(`    ${pad(u.email, 32)}${num(0, 6)}`); continue; }
    const typed = Math.round(mine.reduce((n, e) => n + e.said.length, 0) / mine.length);
    const corr = corrections.filter((c) => c.userId === u.id).length;
    console.log(`    ${pad(u.email, 32)}${num(mine.length, 6)}${num(mine.filter((e) => e.replied).length, 10)}${num(typed, 11)}${num(corr, 13)}`);
  }

  // ---- the failure modes that actually happened ---------------------------
  //
  // Reply LENGTH was the headline number here and it was the wrong one. It
  // reported prompt v2 as the big win - 249 characters down to 86 - and those
  // 86 characters were "Nahi." repeated at someone until they left. Short is
  // not good. Short is just short.
  //
  // These three are what went wrong in the first real conversation, so these
  // are what get counted.
  console.log('\n  FAILURE MODES');

  const replies = exchanges.filter((e) => e.replied).map((e) => e.replied!);

  // Repetition: does a reply reuse a six-word run from an earlier one? The
  // broken-record failure looked exactly like this - the same sentence offered
  // eight times until the person stopped answering.
  const shingles = (t: string) => {
    const w = t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
    return new Set(Array.from({ length: Math.max(0, w.length - 5) }, (_, i) => w.slice(i, i + 6).join(' ')));
  };
  const seen = new Set<string>();
  let repeated = 0;
  for (const r of replies) {
    const sh = shingles(r);
    if ([...sh].some((x) => seen.has(x))) repeated++;
    sh.forEach((x) => seen.add(x));
  }

  // Deflection: refusing the conversation instead of steering it. Counted on
  // what the MODEL said, never on what the person said.
  const DEFLECT = [
    /main yahan hoon/i, /health ki baat/i, /nahi karunga/i, /mera kaam nahi/i,
    /only here for/i, /i'?m here when/i, /not here to/i, /sahi jagah nahi/i,
  ];
  const deflected = replies.filter((r) => DEFLECT.some((rx) => rx.test(r))).length;

  const withQ = exchanges.filter((e) => (parts(e) as { question?: unknown } | null)?.question).length;
  const withParts = exchanges.filter((e) => (parts(e) as { messages?: unknown[] } | null)?.messages?.length).length;

  const pc = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '-');
  console.log(`    repeats itself      ${num(repeated, 4)} of ${replies.length}   ${pc(repeated, replies.length)}   <- broken record`);
  console.log(`    deflects            ${num(deflected, 4)} of ${replies.length}   ${pc(deflected, replies.length)}   <- refusing instead of steering`);
  console.log(`    asks a question     ${num(withQ, 4)} of ${withParts}   ${pc(withQ, withParts)}   <- tappable options`);

  // ---- what to look at ----------------------------------------------------
  const v3 = exchanges.filter((e) => e.promptVersion?.endsWith('@3'));
  const notes: string[] = [];
  if (withParts > 3 && withQ === 0) {
    notes.push('The question field has never been used. The prompt is gating it too hard.');
  }
  if (replies.length > 5 && deflected / replies.length > 0.2) {
    notes.push(`${pc(deflected, replies.length)} of replies deflect rather than steer. Nothing is off topic - a fight at college IS health.`);
  }
  if (replies.length > 5 && repeated / replies.length > 0.25) {
    notes.push(`${pc(repeated, replies.length)} of replies repeat an earlier one. Offered twice and not taken means drop it.`);
  }
  if (exchanges.length > 10 && corrections.length === 0) {
    notes.push('No corrections at all. The whole training-data argument rests on these existing.');
  }
  const longest = Math.max(0, ...exchanges.map((e) => e.replied?.length ?? 0));
  if (longest > 600) notes.push(`Longest reply is ${longest} characters. On a phone that is a wall.`);

  if (notes.length) {
    console.log('\n  WORTH LOOKING AT');
    for (const n of notes) console.log(`    - ${n}`);
  }
  console.log('');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
