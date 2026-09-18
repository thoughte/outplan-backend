/** Move the health record out of SQLite and into the person's account.
 *
 *    npm run import:record -- <email> [path/to/health.db]
 *
 *  The record was kept on a laptop in SQLite while the app was being built. It
 *  is his, and it belongs in his account - not in a file he has to be told
 *  about.
 *
 *  IDEMPOTENT. Re-running replaces this user's record rather than doubling it,
 *  because an import that must only ever be run once is an import that will be
 *  run twice.
 */
import type DatabaseType from 'better-sqlite3';
import path from 'node:path';

/** Loaded at call time, not imported at the top, and deliberately NOT a
 *  dependency of this package.
 *
 *  better-sqlite3 is a native module: installing it compiles C++ and needs
 *  Python and a toolchain. The server image has neither, and it never runs this
 *  script - but `npm ci` installs devDependencies too, so simply listing it here
 *  broke every container build with a node-gyp error four layers deep. Nothing
 *  in the running service ever touches SQLite; only this one migration tool
 *  does, and only on a laptop.
 *
 *  So it is fetched on demand, and the failure tells you the one command to run
 *  rather than throwing MODULE_NOT_FOUND at you.
 */
function openSqlite(file: string): DatabaseType.Database {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Database = require('better-sqlite3') as typeof DatabaseType;
    return new Database(file, { readonly: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND') {
      throw new Error(
        'This script needs the SQLite driver, which is not installed because the\n' +
        'server image cannot compile it. Install it just for this run:\n\n' +
        '    npm i --no-save better-sqlite3\n');
    }
    throw e;
  }
}
import { prisma } from '../src/lib/prisma';

const DEFAULT_DB = path.join(process.env.HOME ?? '', 'Claude/Health/data/health.db');

const date = (s: string | null | undefined): Date | null => {
  if (!s) return null;
  const d = new Date(`${s.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
};

const KIND: Record<string, 'blood' | 'urine' | 'genetic' | 'imaging' | 'body_metrics' | 'self_reported' | 'other'> = {
  blood: 'blood', urine: 'urine', genetic: 'genetic', dexa: 'imaging', imaging: 'imaging',
  body_metrics: 'body_metrics', self_reported: 'self_reported',
};

async function main(): Promise<void> {
  const email = process.argv[2];
  const dbPath = process.argv[3] ?? DEFAULT_DB;
  if (!email) { console.error('usage: npm run import:record -- <email> [health.db]'); process.exit(1); }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) { console.error(`no account for ${email}`); process.exit(1); }

  const src = openSqlite(dbPath);
  const all = <T>(q: string): T[] => src.prepare(q).all() as T[];

  // Clear this user's record first. Reports cascade to measurements and markers.
  await prisma.$transaction([
    prisma.report.deleteMany({ where: { userId: user.id } }),
    prisma.symptom.deleteMany({ where: { userId: user.id } }),
    prisma.intervention.deleteMany({ where: { userId: user.id } }),
    prisma.observation.deleteMany({ where: { userId: user.id } }),
  ]);

  // ---- reports, with their measurements and markers ----------------------
  const reports = all<{ id: number; report_date: string; report_type: string; lab: string | null; fasting: number | null; notes: string | null }>(
    'select id, report_date, report_type, lab, fasting, notes from reports');

  let nMeas = 0, nMark = 0;
  for (const r of reports) {
    const collectedOn = date(r.report_date);
    if (!collectedOn) { console.warn(`  skipped report ${r.id}: unreadable date ${r.report_date}`); continue; }

    const created = await prisma.report.create({
      data: {
        userId: user.id,
        collectedOn,
        kind: KIND[r.report_type] ?? 'other',
        lab: r.lab,
        fasting: r.fasting === null ? null : r.fasting === 1,
        notes: r.notes,
      },
    });

    const ms = all<{ variable: string; label: string | null; value: number | null; value_text: string | null; unit: string | null; panel: string | null; method: string | null; notes: string | null }>(
      `select variable, label, value, value_text, unit, panel, method, notes from measurements where report_id = ${r.id}`);
    if (ms.length) {
      await prisma.measurement.createMany({
        data: ms.map((m) => ({
          reportId: created.id, userId: user.id, collectedOn,
          variable: m.variable, label: m.label, value: m.value,
          valueText: m.value_text, unit: m.unit, panel: m.panel, method: m.method, notes: m.notes,
        })),
      });
      nMeas += ms.length;
    }

    const gs = all<{ section: string | null; trait: string; gene: string | null; snp: string | null; genotype: string | null; result: string | null; notes: string | null }>(
      `select section, trait, gene, snp, genotype, result, notes from genetics where report_id = ${r.id}`);
    if (gs.length) {
      await prisma.geneticMarker.createMany({
        data: gs.map((g) => ({ reportId: created.id, userId: user.id, ...g })),
      });
      nMark += gs.length;
    }
  }

  // ---- symptoms -----------------------------------------------------------
  const symptoms = all<{ reported_on: string; symptom: string; detail: string | null; status: string; resolved_on: string | null }>(
    'select reported_on, symptom, detail, status, resolved_on from symptoms');
  for (const s of symptoms) {
    const reportedOn = date(s.reported_on);
    if (!reportedOn) continue;
    await prisma.symptom.create({
      data: {
        userId: user.id, name: s.symptom, detail: s.detail, reportedOn,
        resolvedOn: date(s.resolved_on),
        status: (['active', 'improving', 'resolved'] as const).includes(s.status as never)
          ? (s.status as 'active' | 'improving' | 'resolved') : 'active',
      },
    });
  }

  // ---- interventions ------------------------------------------------------
  const iv = all<{ name: string; kind: string; dose: string | null; schedule: string | null; started_on: string | null; stopped_on: string | null; reason: string | null; notes: string | null }>(
    'select name, kind, dose, schedule, started_on, stopped_on, reason, notes from interventions');
  for (const i of iv) {
    await prisma.intervention.create({
      data: {
        userId: user.id, name: i.name, dose: i.dose, schedule: i.schedule,
        startedOn: date(i.started_on), stoppedOn: date(i.stopped_on),
        reason: i.reason, notes: i.notes,
        kind: (['medication', 'supplement', 'protocol'] as const).includes(i.kind as never)
          ? (i.kind as 'medication' | 'supplement' | 'protocol') : 'protocol',
      },
    });
  }

  // ---- daily observations -------------------------------------------------
  const obs = all<{ recorded_on: string; variable: string; value: string; notes: string | null }>(
    'select recorded_on, variable, value, notes from lifestyle');
  if (obs.length) {
    await prisma.observation.createMany({
      data: obs.map((o) => ({
        userId: user.id, localDay: o.recorded_on.slice(0, 10),
        variable: o.variable, value: o.value, notes: o.notes,
      })),
    });
  }

  src.close();
  console.log(`\n  imported into ${email}`);
  console.log(`    reports        ${reports.length}`);
  console.log(`    measurements   ${nMeas}`);
  console.log(`    genetic markers${String(nMark).padStart(4)}`);
  console.log(`    symptoms       ${symptoms.length}`);
  console.log(`    interventions  ${iv.length}`);
  console.log(`    observations   ${obs.length}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
