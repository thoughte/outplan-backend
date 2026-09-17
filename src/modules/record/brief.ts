import { prisma } from '../../lib/prisma';

/** What the assistant is told about this person before it answers.
 *
 *  This is the difference between chatting with a stranger and chatting with
 *  something that knows you. The record holds 732 measurements, 573 genetic
 *  markers and 22 symptom write-ups running to thousands of characters each -
 *  none of which can go in whole. A brief that fills the context window leaves
 *  no room for the conversation and buries the three numbers that matter.
 *
 *  So it is ruthless about what earns a place:
 *
 *  LABS: the latest value per variable, plus the previous one when it moved
 *  enough to be worth seeing. A trend is what makes a number mean something -
 *  GGT of 88 is a fact, GGT 22 to 88 is a finding.
 *
 *  SYMPTOMS: name and status only. The reasoning behind each is long and stays
 *  in the record; the assistant needs to know the neck pain exists, not to
 *  re-read the differential every message.
 *
 *  GENETICS: excluded entirely. 573 markers would drown everything else and
 *  almost none of them change what to do tomorrow.
 *
 *  It says plainly when something is unknown rather than leaving a gap that
 *  reads as absence of a problem.
 */

const MOVED = 0.15;   // 15% change before a previous value earns its line

/** Markers that are always included, whether or not they moved.
 *
 *  Sorting by movement alone cut uric acid, HbA1c, eGFR and ApoB out of this
 *  person's brief - four of the numbers his entire plan is built around - purely
 *  because they were stable since the last draw. A number holding still at a bad
 *  level is not less important than one that wobbled.
 *
 *  Matched loosely against the variable key and the printed label, because labs
 *  name the same analyte differently and a strict match silently drops it.
 */
const ALWAYS = [
  'uric', 'hba1c', 'glycosylated', 'egfr', 'creatinin', 'apo', 'ldl', 'cholesterol',
  'testosterone', 'ggt', 'gamma', 'alt', 'sgpt', 'ast', 'sgot', 'crp', 'b12',
  'vitamin d', 'ferritin', 'homocystein', 'tsh', 'urine_ph', 'specific_gravity',
  'haemoglobin', 'hemoglobin', 'prolactin', 'lh', 'fsh', 'albumin',
];

const isCore = (variable: string, label: string | null): boolean => {
  const hay = `${variable} ${label ?? ''}`.toLowerCase();
  return ALWAYS.some((k) => hay.includes(k));
};

export async function buildBrief(userId: string): Promise<string | null> {
  const [symptoms, interventions, measurements, observations, user] = await Promise.all([
    prisma.symptom.findMany({
      where: { userId, status: { in: ['active', 'improving'] } },
      orderBy: { reportedOn: 'desc' },
    }),
    prisma.intervention.findMany({ where: { userId, stoppedOn: null }, orderBy: { kind: 'asc' } }),
    prisma.measurement.findMany({
      where: { userId, value: { not: null } },
      orderBy: { collectedOn: 'desc' },
    }),
    prisma.observation.findMany({
      where: { userId },
      orderBy: { localDay: 'desc' },
      take: 120,
    }),
    prisma.user.findUnique({ where: { id: userId } }),
  ]);

  if (!symptoms.length && !interventions.length && !measurements.length) return null;

  const out: string[] = ['WHAT YOU ALREADY KNOW ABOUT THIS PERSON', ''];

  // ---- labs, latest and direction -----------------------------------------
  const byVar = new Map<string, typeof measurements>();
  for (const m of measurements) byVar.set(m.variable, [...(byVar.get(m.variable) ?? []), m]);

  const lines: Array<{ line: string; core: boolean; moved: boolean }> = [];
  for (const [variable, rows] of byVar) {
    const latest = rows[0]!;
    const prior = rows.find((r) => r.collectedOn.getTime() !== latest.collectedOn.getTime());
    let moved = false;
    const name = latest.label ?? variable.replace(/_/g, ' ');
    const unit = latest.unit ? ` ${latest.unit}` : '';
    const when = latest.collectedOn.toISOString().slice(0, 10);

    let line = `${name}: ${latest.value}${unit} (${when})`;
    const core = isCore(variable, latest.label);
    if (prior?.value && latest.value) {
      const delta = Math.abs(latest.value - prior.value) / Math.max(Math.abs(prior.value), 0.001);
      if (delta >= MOVED) {
        const arrow = latest.value > prior.value ? 'up from' : 'down from';
        line += ` — ${arrow} ${prior.value}${unit} on ${prior.collectedOn.toISOString().slice(0, 10)}`;
        moved = true;
      }
    }
    lines.push({ line, core, moved: false });
  }
  if (lines.length) {
    out.push('Most recent lab values, newest first. An arrow means it moved by more');
    out.push('than 15% since the previous draw.');
    out.push('');
    // Core markers first, then things that moved, then the rest. A number that
    // changed is interesting; a core number sitting at a bad level is important,
    // and importance wins.
    lines.sort((a, b) =>
      Number(b.core) - Number(a.core) || Number(b.moved) - Number(a.moved));
    const CAP = 45;
    out.push(...lines.slice(0, CAP).map((l) => `  ${l.line}`));
    if (lines.length > CAP) out.push(`  (+${lines.length - CAP} more on file, ask if you need them)`);
    out.push('');
  }

  // ---- what they are taking ----------------------------------------------
  if (interventions.length) {
    out.push('Currently taking:');
    for (const i of interventions) {
      const since = i.startedOn ? `, since ${i.startedOn.toISOString().slice(0, 10)}` : '';
      out.push(`  ${i.name}${i.dose ? ` — ${i.dose}` : ''}${since}`);
    }
    out.push('');
  }

  // ---- what is going on ---------------------------------------------------
  if (symptoms.length) {
    out.push('Open or improving:');
    for (const s of symptoms) out.push(`  ${s.name} (${s.status}, since ${s.reportedOn.toISOString().slice(0, 10)})`);
    out.push('');
  }

  // ---- the last few days --------------------------------------------------
  const days = [...new Set(observations.map((o) => o.localDay))].slice(0, 5);
  if (days.length) {
    out.push('The last few days, as recorded:');
    for (const d of days) {
      const items = observations.filter((o) => o.localDay === d).map((o) => `${o.variable} ${o.value}`);
      out.push(`  ${d}: ${items.slice(0, 8).join(' · ')}`);
    }
    out.push('');
  }

  out.push('Use this the way a friend who already knows would - do not recite it back,');
  out.push('do not open by listing their numbers, and never state a value they did not');
  out.push('just mention unless it actually bears on what they said.');
  if (user?.timezone) out.push(`They are in ${user.timezone}.`);

  return out.join('\n');
}
