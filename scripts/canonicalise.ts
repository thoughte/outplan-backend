/** Fill in the chartable number beside every measurement.
 *
 *    npm run canonicalise -- <email> [--apply]
 *
 *  Dry by default. Nothing about a person's record should change because a
 *  script was run without an argument.
 *
 *  Per marker it picks the unit most of that marker's readings already use, and
 *  converts the rest into it. It never edits `value` or `unit`: those are what
 *  the lab printed, and a conversion you cannot re-check is a conversion you
 *  cannot trust.
 *
 *  Where the printed unit and the printed value disagree - platelets recorded as
 *  "190000 thou/mm3" when the other readings are ~300 - it refuses and records
 *  why. Left unplotted and visible beats quietly rewritten into whatever makes
 *  the line look sensible.
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import { normaliseUnit, convert } from '../src/lib/units';

const OUTLIER = 5; // times the median, in either direction

async function main(): Promise<void> {
  const email = process.argv[2];
  const apply = process.argv.includes('--apply');
  if (!email) throw new Error('usage: npm run canonicalise -- <email> [--apply]');

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`no user ${email}`);

  const rows = await prisma.measurement.findMany({
    where: { userId: user.id },
    select: { id: true, variable: true, value: true, unit: true, collectedOn: true },
    orderBy: [{ variable: 'asc' }, { collectedOn: 'asc' }],
  });

  const byVar = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!byVar.has(r.variable)) byVar.set(r.variable, []);
    byVar.get(r.variable)!.push(r);
  }

  const writes: { id: string; canonicalValue: number | null; canonicalUnit: string | null; canonicalFlag: string | null }[] = [];
  const changed: string[] = [];
  const flagged: string[] = [];

  for (const [variable, rs] of byVar) {
    // The unit this marker is mostly reported in wins. Not a unit I prefer -
    // his own record decides, so the chart is labelled the way his reports are.
    const counts = new Map<string, number>();
    for (const r of rs) {
      const n = normaliseUnit(r.unit);
      if (n) counts.set(n.unit, (counts.get(n.unit) ?? 0) + 1);
    }
    if (!counts.size) {
      for (const r of rs) writes.push({ id: r.id, canonicalValue: r.value, canonicalUnit: r.unit, canonicalFlag: r.unit ? `unrecognised unit ${r.unit}` : null });
      continue;
    }
    const target = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];

    const converted = rs.map((r) => ({
      r, out: r.value == null ? null : (r.unit ? convert(r.value, r.unit, target) : r.value),
    }));

    const nums = converted.map((c) => c.out).filter((n): n is number => n != null && Number.isFinite(n));
    const sorted = [...nums].sort((a, b) => a - b);
    const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : null;

    for (const { r, out } of converted) {
      if (r.value == null) { writes.push({ id: r.id, canonicalValue: null, canonicalUnit: null, canonicalFlag: null }); continue; }
      if (out == null) {
        const flag = `cannot convert ${r.unit ?? 'no unit'} to ${target}`;
        flagged.push(`  ${variable}: ${r.value} ${r.unit} — ${flag}`);
        writes.push({ id: r.id, canonicalValue: null, canonicalUnit: null, canonicalFlag: flag });
        continue;
      }
      if (median != null && median > 0 && nums.length > 2 && (out > median * OUTLIER || out < median / OUTLIER)) {
        const flag = `printed unit and value disagree: ${r.value} ${r.unit} reads as ${out} ${target} against a median of ${median}`;
        flagged.push(`  ${variable}: ${flag}`);
        writes.push({ id: r.id, canonicalValue: null, canonicalUnit: null, canonicalFlag: flag });
        continue;
      }
      if (Math.abs(out - r.value) > 1e-9) {
        changed.push(`  ${variable} ${r.collectedOn.toISOString().slice(0, 10)}: ${r.value} ${r.unit} -> ${out} ${target}`);
      }
      writes.push({ id: r.id, canonicalValue: out, canonicalUnit: target, canonicalFlag: null });
    }
  }

  console.log(`${rows.length} measurements, ${byVar.size} markers\n`);
  console.log(`VALUES THAT CHANGE (${changed.length}) — these are the ones a chart was drawing wrong:`);
  console.log(changed.length ? changed.join('\n') : '  none');
  console.log(`\nREFUSED (${flagged.length}) — left unplotted rather than guessed:`);
  console.log(flagged.length ? flagged.join('\n') : '  none');

  if (!apply) { console.log('\nDRY RUN. Re-run with --apply to write.'); await prisma.$disconnect(); return; }

  let n = 0;
  for (const w of writes) {
    await prisma.measurement.update({ where: { id: w.id }, data: { canonicalValue: w.canonicalValue, canonicalUnit: w.canonicalUnit, canonicalFlag: w.canonicalFlag } });
    n++;
  }
  console.log(`\nwrote ${n} rows`);
  await prisma.$disconnect();
}

main().catch((e: Error) => { console.error(e.message); process.exit(1); });
