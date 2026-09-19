import { prisma } from '../../lib/prisma';
import { localDay } from '../../shared/helper';
import { healthFrom, VISITOR_RULES, type Health, type Mechanic, type Visitor, lapsed } from './rules';

const WINDOW = 7;

/** The days in the window, newest first, in the person's own timezone. */
function windowDays(timezone: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < WINDOW; i++) {
    out.push(localDay(new Date(Date.now() - i * 86_400_000), timezone));
  }
  return out;
}

export interface Farm {
  today: string;
  mechanics: Mechanic[];
  visitors: Visitor[];
  /** Records as roots. Completeness, never results: a report full of bad numbers
   *  grows exactly the same root as a perfect one. */
  roots: { category: string; count: number }[];
  /** One ring a month since they arrived. */
  rings: number;
  /** Illness puts the farm into a calm dormant season: no problem states, and
   *  rest is the only thing asked of anyone. */
  winter: boolean;
  /** How long since anything was logged, and what to say about it.
   *
   *  Null under a week, because a few quiet days is not a thing that needs
   *  mentioning. Never a score, never a count of what was missed.
   *
   *  Deliberately NOT winter. Winter is a rest season the farm enters because he
   *  is unwell, and it says nothing is being asked of him today. Being away is
   *  not being ill, and treating the two the same would have the app deciding he
   *  was sick because he was busy. */
  away: { days: number; say: string } | null;
  /** What is worth doing next, and never more than one thing. A farm that lists
   *  six chores is a chore. */
  nudge: string | null;
}

export async function farmFor(userId: string): Promise<Farm> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true, createdAt: true } });
  const tz = user?.timezone ?? 'Asia/Kolkata';
  const days = windowDays(tz);
  const since = days[days.length - 1]!;

  // Everything the farm reacts to, in two queries. Observations are the
  // behaviours; plan items are whether the medicines were actually taken, which
  // is a better signal than someone mentioning them in passing.
  const [obs, plan, files, everObs, lastRow] = await Promise.all([
    prisma.observation.groupBy({
      by: ['variable', 'localDay'],
      where: { userId, localDay: { gte: since }, planned: false },
      _sum: { amount: true },
    }),
    prisma.planItem.groupBy({
      by: ['localDay'],
      where: { userId, localDay: { gte: since } },
      _count: { _all: true },
    }),
    prisma.storedFile.groupBy({ by: ['kind'], where: { userId }, _count: { _all: true } }),
    prisma.observation.groupBy({ by: ['variable'], where: { userId }, _count: { _all: true } }),
    // The last day he actually logged something, over all time. Measured from
    // what he DID, not from when the app was last opened: opening it is not
    // using it, and the farm should not congratulate a glance.
    prisma.observation.findFirst({
      where: { userId }, orderBy: { localDay: 'desc' }, select: { localDay: true },
    }),
  ]);
  const lastLoggedDay = lastRow?.localDay ?? null;

  const doneByDay = await prisma.planItem.groupBy({
    by: ['localDay'],
    where: { userId, localDay: { gte: since }, status: 'done' },
    _count: { _all: true },
  });

  const daysWith = (kinds: string[]): { days: number; amount: number | null } => {
    const hit = new Set<string>();
    let total = 0; let sawAmount = false;
    for (const o of obs) {
      if (!kinds.includes(o.variable)) continue;
      hit.add(o.localDay);
      if (o._sum.amount != null) { total += o._sum.amount; sawAmount = true; }
    }
    return { days: hit.size, amount: sawAmount ? Math.round(total * 100) / 100 : null };
  };

  const everLogged = (kinds: string[]) => everObs.some((e) => kinds.includes(e.variable));

  // Adherence counted PER DOSE, not per perfect day.
  //
  // All-or-nothing was the first rule here and it was cruel arithmetic: he took
  // five of his six tablets yesterday and the farm reported "0 of 7", which
  // reads as having taken nothing. On a six-item stack one missed tablet would
  // erase the whole day, every time.
  //
  // The PRD says pests clear when a scheduled dose is taken. A dose, not a
  // flawless day.
  const scheduled = plan.reduce((n, p) => n + p._count._all, 0);
  const taken = doneByDay.reduce((n, d) => n + d._count._all, 0);
  const doseRate = scheduled ? taken / scheduled : 0;
  // Days where at least something was taken, for the "days" figure on screen.
  const dosingDays = doneByDay.filter((d) => d._count._all > 0).length;

  const water = daysWith(['water', 'drink']);
  const sleep = daysWith(['sleep']);
  const move = daysWith(['activity']);
  const food = daysWith(['meal']);
  const mood = daysWith(['mood']);
  const havePlan = plan.length > 0;

  // Winter is for being ILL, not for having symptoms.
  //
  // The first version turned it on for any symptom logged in the last two days,
  // which for him means permanent winter: his record carries a standing
  // headache, reflux and twitching. A season meant to say "rest, nothing is
  // being asked of you" would have become his normal state, and then it says
  // nothing at all.
  //
  // So it wants words that mean unwell today, from his own message.
  const ILL = /\b(fever|flu|sick|unwell|ill|vomit|infection|food poisoning|bed rest|can'?t get up)\b/i;
  const illRows = await prisma.observation.findMany({
    where: { userId, localDay: { in: days.slice(0, 3) }, variable: { in: ['symptom', 'mood'] } },
    select: { value: true, notes: true },
  });
  const recentSymptom = illRows.some((r) => ILL.test(`${r.value} ${r.notes ?? ''}`));

  const mechanics: Mechanic[] = [
    {
      key: 'hydration', scene: 'Leaves',
      health: healthFrom(water.days, WINDOW, everLogged(['water', 'drink'])),
      days: water.days, window: WINDOW, amount: water.amount, unit: water.amount != null ? 'logged' : null,
      note: water.days ? `Water on ${water.days} of the last ${WINDOW} days` : 'Tell me when you drink and the leaves pick up',
    },
    {
      key: 'medication', scene: 'Pests',
      // Scaled from the dose rate so the thresholds mean the same thing here as
      // everywhere else, without pretending a rate is a count of days.
      health: havePlan ? healthFrom(Math.round(doseRate * WINDOW), WINDOW, true) : 'unknown',
      days: dosingDays, window: WINDOW,
      amount: scheduled ? Math.round(doseRate * 100) : null,
      unit: scheduled ? '%' : null,
      note: havePlan
        ? `${taken} of ${scheduled} doses over the last ${WINDOW} days`
        : 'Nothing scheduled yet',
    },
    {
      key: 'activity', scene: 'Sunlight',
      health: healthFrom(move.days, WINDOW, everLogged(['activity'])),
      days: move.days, window: WINDOW, amount: move.amount, unit: move.amount != null ? 'logged' : null,
      note: move.days ? `Moving on ${move.days} of the last ${WINDOW} days` : 'Mention a walk and the sky clears',
    },
    {
      key: 'sleep', scene: 'Night',
      health: healthFrom(sleep.days, WINDOW, everLogged(['sleep'])),
      days: sleep.days, window: WINDOW, amount: sleep.amount, unit: sleep.amount != null ? 'hours' : null,
      note: sleep.days ? `Sleep on ${sleep.days} of the last ${WINDOW} nights` : 'Say how you slept and the fireflies come',
    },
    {
      key: 'nutrition', scene: 'Soil',
      health: healthFrom(food.days, WINDOW, everLogged(['meal'])),
      days: food.days, window: WINDOW, amount: null, unit: null,
      note: food.days ? `Meals on ${food.days} of the last ${WINDOW} days` : 'Meals feed the soil',
    },
    {
      key: 'mood', scene: 'Weather',
      health: healthFrom(mood.days, WINDOW, everLogged(['mood'])),
      days: mood.days, window: WINDOW, amount: null, unit: null,
      note: mood.days ? `How you felt, on ${mood.days} of ${WINDOW} days` : 'Say how you are and the weather follows',
    },
  ];

  const byKey = new Map(mechanics.map((m) => [m.key, m]));
  const rootTotal = files.reduce((n, f) => n + f._count._all, 0);

  // How long he has been gone, measured from the last thing he actually logged
  // rather than from the last time the app was opened. Opening it is not the
  // same as using it, and the farm should not congratulate a glance.
  //
  // ABSENCE IS NEVER A SCORE. No catch-up list, no count of missed days, nothing
  // withered and nothing recoverable by effort. Nothing on this farm dies, and a
  // long absence is exactly the case that rule exists for: coming back after six
  // weeks must not be met with six weeks of failure.
  const away = lapsed(lastLoggedDay, days[0]!);

  const visitors: Visitor[] = VISITOR_RULES.map((v) => ({
    key: v.key, name: v.name, earnedFor: v.earnedFor,
    earned: v.mechanic === 'roots' ? rootTotal >= v.needs : (byKey.get(v.mechanic)?.days ?? 0) >= v.needs,
  }));

  const months = user
    ? Math.max(0, Math.floor((Date.now() - user.createdAt.getTime()) / (30 * 86_400_000)))
    : 0;

  // One thing. The weakest mechanic that has ever had anything logged, because
  // suggesting something they have never once done is a lecture rather than a
  // nudge. In winter, nothing is asked at all.
  const order: Health[] = ['needs_attention', 'dormant', 'steady', 'thriving', 'unknown'];
  const weakest = [...mechanics]
    .filter((m) => m.health !== 'unknown')
    .sort((a, b) => order.indexOf(a.health) - order.indexOf(b.health))[0];

  return {
    today: days[0]!,
    mechanics,
    visitors,
    roots: files.map((f) => ({ category: f.kind, count: f._count._all })),
    rings: months,
    winter: recentSymptom,
    away,
    // A long absence silences the nudge entirely. Coming back after a month to
    // be told what is weakest is being handed a chore on the doorstep, and the
    // one thing that must not happen here is arriving to a list.
    nudge: away && away.days >= 30
      ? null
      : recentSymptom
        ? 'Resting. Nothing is being asked of you today.'
        : weakest && weakest.health !== 'thriving'
          ? weakest.note
          : null,
  };
}
