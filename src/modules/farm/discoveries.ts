import { prisma } from '../../lib/prisma';

/** Something true about this person that nobody told them.
 *
 *  The PRD calls these the top-tier reward: "you sleep 40 minutes longer on days
 *  you walk before 6pm". They are also the most dangerous thing in the product,
 *  because a sentence in that shape reads as medical advice whether or not it
 *  was meant as one.
 *
 *  So the rules here are strict, and all of them are about NOT saying things.
 *
 *  It compares behaviours to behaviours, never to a lab value. "You sleep worse
 *  in weeks your ApoB is high" would be nonsense dressed as insight, and would
 *  also make a number he cannot directly move into something the game comments
 *  on.
 *
 *  It needs enough days, and it says how many it used. A pattern over four days
 *  is a coincidence with a nice sentence attached, and the count is shown so
 *  that judgement is his rather than mine.
 *
 *  It describes, and never prescribes. "On days you walk, you log sleep more
 *  often" is an observation. "Walk more to sleep better" is advice, and this is
 *  not the voice that gives it.
 */

const MIN_DAYS = 14;
const MIN_EACH_SIDE = 4;

interface Candidate {
  key: string;
  /** The behaviour that might be the lever. */
  when: string;
  /** The behaviour that might follow it. */
  then: string;
  phrase: (withIt: number, without: number, days: number) => { title: string; detail: string };
}

const CANDIDATES: Candidate[] = [
  {
    key: 'activity-sleep', when: 'activity', then: 'sleep',
    phrase: (a, b, d) => ({
      title: 'Moving and sleeping travel together',
      detail: `Over ${d} days, you logged sleep on ${Math.round(a * 100)}% of the days you also moved, `
        + `against ${Math.round(b * 100)}% of the days you did not.`,
    }),
  },
  {
    key: 'water-symptom', when: 'water', then: 'symptom',
    phrase: (a, b, d) => ({
      title: 'Water and how you feel',
      detail: `Over ${d} days, you mentioned a symptom on ${Math.round(a * 100)}% of the days you logged water, `
        + `against ${Math.round(b * 100)}% of the days you did not.`,
    }),
  },
  {
    key: 'meds-symptom', when: 'medication', then: 'symptom',
    phrase: (a, b, d) => ({
      title: 'Your medicines and your symptoms',
      detail: `Over ${d} days, you mentioned a symptom on ${Math.round(a * 100)}% of the days you took everything, `
        + `against ${Math.round(b * 100)}% of the days you did not.`,
    }),
  },
];

/** Look for patterns, and keep the ones that survive the thresholds. */
export async function findFor(userId: string): Promise<{ found: number }> {
  const rows = await prisma.observation.findMany({
    where: { userId, planned: false },
    select: { variable: true, localDay: true },
    distinct: ['variable', 'localDay'],
  });
  const days = [...new Set(rows.map((r) => r.localDay))].sort();
  if (days.length < MIN_DAYS) return { found: 0 };

  const has = (v: string, d: string) => rows.some((r) => r.variable === v && r.localDay === d);
  let found = 0;

  for (const c of CANDIDATES) {
    const withIt = days.filter((d) => has(c.when, d));
    const without = days.filter((d) => !has(c.when, d));
    // Both sides need enough days, or this is comparing a habit against three
    // exceptions and calling the difference a finding.
    if (withIt.length < MIN_EACH_SIDE || without.length < MIN_EACH_SIDE) continue;

    const rateWith = withIt.filter((d) => has(c.then, d)).length / withIt.length;
    const rateWithout = without.filter((d) => has(c.then, d)).length / without.length;
    // A gap worth a sentence. Below this it is noise, and noise presented as
    // insight is how someone changes a habit for nothing.
    if (Math.abs(rateWith - rateWithout) < 0.3) continue;

    const { title, detail } = c.phrase(rateWith, rateWithout, days.length);
    await prisma.discovery.upsert({
      where: { userId_key: { userId, key: c.key } },
      create: { userId, key: c.key, title, detail, days: days.length },
      // Kept once found, with the numbers refreshed. A card that vanishes when
      // the data shifts was never worth collecting.
      update: { title, detail, days: days.length },
    });
    found++;
  }
  return { found };
}

export function listFor(userId: string) {
  return prisma.discovery.findMany({
    where: { userId }, orderBy: { foundAt: 'desc' },
    select: { id: true, title: true, detail: true, days: true, foundAt: true },
  });
}
