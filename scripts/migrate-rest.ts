/** The last of the old record that never moved.
 *
 *    npm run migrate:rest -- <email> [--apply]
 *
 *  Two things, neither of them a re-analysis. Nothing here reads a PDF, derives
 *  a value, or recomputes anything: his measurements were extracted once and
 *  stay exactly as they are.
 *
 *  1. variable_catalog - 348 rows saying what each marker name means. Reference
 *     data, not his record, which is why it has no owner. Without it a chart
 *     axis reads "vitamin_d_25oh" and two spellings of one analyte draw two
 *     lines that should have been one.
 *
 *  2. reports.source_file - the filename each report was read from, and the
 *     booking reference inside that name. This is the evidence of where his
 *     numbers came from, and it was sitting in a SQLite column that the first
 *     import did not carry across.
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

const DEFAULT_DB = `${process.env.HOME ?? ''}/Claude/Health/data/health.db`;

function openSqlite(file: string) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Database = require('better-sqlite3');
    return new Database(file, { readonly: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND') {
      throw new Error('Needs the SQLite driver for this run only:\n\n    npm i --no-save better-sqlite3\n');
    }
    throw e;
  }
}

/** Healthians name their files <date>_<lab>_<booking>.pdf, so the reference is
 *  already in the path. Taken from the name rather than by opening the file:
 *  the point is to record where a number came from, not to read it again. */
function refFromName(path: string | null): string | null {
  if (!path) return null;
  const m = path.match(/_(\d{6,})/);
  return m ? m[1] : null;
}

async function main(): Promise<void> {
  const email = process.argv[2];
  const apply = process.argv.includes('--apply');
  if (!email) throw new Error('usage: npm run migrate:rest -- <email> [--apply]');

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`no user ${email}`);

  const src = openSqlite(DEFAULT_DB);

  // --- 1. the dictionary -------------------------------------------------
  const cat = src.prepare('select variable, display_name, default_unit, category, aliases from variable_catalog').all() as
    { variable: string; display_name: string | null; default_unit: string | null; category: string | null; aliases: string | null }[];

  // --- 2. where each report came from ------------------------------------
  const reports = src.prepare('select report_date, report_type, lab, source_file from reports').all() as
    { report_date: string; report_type: string; lab: string | null; source_file: string | null }[];

  const mine = await prisma.report.findMany({
    where: { userId: user.id },
    select: { id: true, collectedOn: true, kind: true, lab: true, sourceName: true, bookingRef: true },
  });

  const plan: { id: string; sourceName: string; bookingRef: string | null; was: string }[] = [];
  for (const r of reports) {
    if (!r.source_file) continue;
    const ref = refFromName(r.source_file);
    // Same collection date AND same lab. Two of his blood tests share a date,
    // and they are told apart by the booking reference in the filename.
    const candidates = mine.filter((m) =>
      m.collectedOn.toISOString().slice(0, 10) === r.report_date
      && (m.lab ?? '').toLowerCase() === (r.lab ?? '').toLowerCase()
      && !plan.some((p) => p.id === m.id));
    const match = candidates[0];
    if (!match) continue;
    plan.push({ id: match.id, sourceName: r.source_file.replace(/^reports\//, ''), bookingRef: ref, was: `${r.report_date} ${r.lab}` });
  }

  console.log(`variable catalogue : ${cat.length} entries`);
  console.log(`report provenance  : ${plan.length} of ${reports.filter((r) => r.source_file).length} reports with a file matched`);
  for (const p of plan) console.log(`   ${p.was.padEnd(28)} -> ${p.sourceName}  ref=${p.bookingRef ?? '-'}`);

  const unmatched = reports.filter((r) => r.source_file && !plan.some((p) => p.sourceName === r.source_file!.replace(/^reports\//, '')));
  if (unmatched.length) {
    console.log('\nNOT matched (reported, never guessed):');
    for (const u of unmatched) console.log(`   ${u.report_date} ${u.lab} ${u.source_file}`);
  }

  if (!apply) { console.log('\nDRY RUN. Re-run with --apply to write.'); await prisma.$disconnect(); return; }

  for (const c of cat) {
    const aliases = (c.aliases ?? '').split('|').map((a) => a.trim()).filter(Boolean);
    await prisma.variableCatalog.upsert({
      where: { variable: c.variable },
      update: { displayName: c.display_name, defaultUnit: c.default_unit, category: c.category, aliases },
      create: { variable: c.variable, displayName: c.display_name, defaultUnit: c.default_unit, category: c.category, aliases },
    });
  }
  for (const p of plan) {
    await prisma.report.update({ where: { id: p.id }, data: { sourceName: p.sourceName, bookingRef: p.bookingRef } });
  }

  const known = await prisma.variableCatalog.count();
  const used = await prisma.measurement.findMany({
    where: { userId: user.id }, select: { variable: true }, distinct: ['variable'],
  });
  const missing = used.filter((u) => !cat.some((c) => c.variable === u.variable));
  console.log(`\nwrote ${known} catalogue entries and ${plan.length} report sources`);
  console.log(`markers he has with no dictionary entry: ${missing.length}${missing.length ? ' -> ' + missing.slice(0, 12).map((m) => m.variable).join(', ') : ''}`);
  await prisma.$disconnect();
}

main().catch((e: Error) => { console.error(e.message); process.exit(1); });
