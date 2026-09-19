import { prisma } from '../../lib/prisma';
import { notFound, badRequest } from '../../errors/app.errors';
import { standing, adherence, rollUp, type Direction, type Standing } from './progress';

/** The goal tree, with every number worked out from the record.
 *
 *  Nothing about progress is stored. A saved percentage is a number that drifts
 *  away from the measurements it claims to summarise, and then the app is
 *  telling someone about their own health using a figure nothing supports.
 */

export interface GoalNode {
  id: string;
  title: string;
  why: string | null;
  kind: 'outcome' | 'behaviour' | 'container';
  status: string;
  direction: Direction;
  measure: string | null;
  baselineValue: number | null;
  targetValue: number | null;
  achievedAt: Date | null;
  intentText: string | null;
  /** Reasoned to, not read off the record. Shown as such, and never confirmed
   *  by confirming its parent. */
  inferred: boolean;
  blockedBy: { id: string; title: string; achieved: boolean }[];
  standing: Standing;
  children: GoalNode[];
}

/** The latest reading for whatever a goal watches.
 *
 *  Canonical value, never the printed one. His free testosterone was recorded
 *  once in pg/mL and once in ng/dL; a goal comparing those two directly would
 *  report a collapse where there was a rise.
 */
async function latestFor(userId: string, measure: string): Promise<{ value: number | null; unit: string | null }> {
  const m = await prisma.measurement.findFirst({
    where: { userId, variable: measure, canonicalValue: { not: null } },
    orderBy: { collectedOn: 'desc' },
    select: { canonicalValue: true, canonicalUnit: true },
  });
  return { value: m?.canonicalValue ?? null, unit: m?.canonicalUnit ?? null };
}

/** How many of the last N days carried this behaviour. */
async function daysWith(userId: string, measure: string, days: number): Promise<{ hit: number; window: number }> {
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const rows = await prisma.observation.findMany({
    where: { userId, variable: measure, localDay: { gte: since }, planned: false },
    select: { localDay: true },
    distinct: ['localDay'],
  });
  return { hit: rows.length, window: days };
}

async function standingFor(userId: string, g: {
  kind: string; measure: string | null; baselineValue: number | null;
  targetValue: number | null; direction: string;
}): Promise<Standing> {
  if (g.kind === 'container') return { fraction: null, current: null, reached: false, summary: '' };
  if (!g.measure) return { fraction: null, current: null, reached: false, summary: 'nothing to read yet' };

  if (g.kind === 'behaviour') {
    const { hit, window } = await daysWith(userId, g.measure, 7);
    return adherence(hit, window, g.direction as Direction);
  }
  const { value, unit } = await latestFor(userId, g.measure);
  return standing(g.baselineValue, g.targetValue, value, g.direction as Direction, unit);
}

export async function tree(userId: string): Promise<GoalNode[]> {
  const rows = await prisma.goal.findMany({
    where: { userId },
    orderBy: [{ createdAt: 'asc' }],
    include: { blockedBy: { include: { blocker: { select: { id: true, title: true, status: true } } } } },
  });

  const standings = new Map<string, Standing>();
  for (const g of rows) standings.set(g.id, await standingFor(userId, g));

  const byParent = new Map<string | null, typeof rows>();
  for (const g of rows) {
    const k = g.parentId;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(g);
  }

  const build = (parentId: string | null): GoalNode[] =>
    (byParent.get(parentId) ?? []).map((g) => {
      const children = build(g.id);
      // A container is judged on its LIVE children only.
      //
      // Deduplicating the leaves marked fourteen duplicates abandoned, and every
      // container above one of them started reporting on rows that are no longer
      // anybody's goal: "0 of 4 finished" where three of the four had been merged
      // into goals somewhere else. One container lost all three of its children
      // and still showed a denominator.
      //
      // The abandoned rows stay in the response, because the record keeps what
      // he tried and stopped. They just stop being counted.
      const live = children.filter((c) => c.status !== 'abandoned');
      // A container is as far along as its parts. Computed after the children
      // so the roll-up sees their real numbers rather than a stored guess.
      const own = standings.get(g.id)!;
      const s: Standing = g.kind === 'container'
        ? {
            fraction: live.length ? rollUp(live.map((c) => c.standing.fraction)) : null,
            current: null,
            reached: live.length > 0 && live.every((c) => c.status === 'achieved'),
            // Both numbers, because one on its own lies. The magnesium branch
            // came back reading "100%" beside "0 of 2 done": the average of its
            // children was 1, and none of them were finished, and each figure
            // was true. Shown together with what they mean, they stop
            // contradicting each other.
            summary: live.length
              ? `${live.filter((c) => c.status === 'achieved').length} of ${live.length} finished, `
                + `${live.filter((c) => c.standing.fraction === null).length} still waiting`
              // Says where they went rather than reading as an empty shell. He
              // opened this branch because something was in it, and something
              // was: it is now counted somewhere else.
              : children.length
                ? `nothing left under it, ${children.length} merged into other goals`
                : 'nothing under it yet',
          }
        : own;
      return {
        id: g.id, title: g.title, why: g.why, kind: g.kind as GoalNode['kind'],
        status: g.status, direction: g.direction as Direction, measure: g.measure,
        baselineValue: g.baselineValue, targetValue: g.targetValue,
        achievedAt: g.achievedAt, intentText: g.intentText, inferred: g.inferred,
        blockedBy: g.blockedBy.map((b) => ({
          id: b.blocker.id, title: b.blocker.title, achieved: b.blocker.status === 'achieved',
        })),
        standing: s,
        children,
      };
    });

  return build(null);
}

/** Move every goal to the status the record says it is in.
 *
 *  Run after anything that could change the answer: a report arriving, a goal
 *  being confirmed, another goal finishing. Deriving status on read would be
 *  cheaper, but then "achieved" has no moment, and a goal that is finished
 *  without a timestamp cannot be counted in "six this month" - which is the
 *  entire point of keeping the pieces small.
 */
export async function refresh(userId: string): Promise<{ achieved: string[] }> {
  const rows = await prisma.goal.findMany({
    where: { userId, status: { notIn: ['abandoned', 'proposed'] } },
    include: { blockedBy: { include: { blocker: { select: { status: true } } } }, children: { select: { status: true } } },
  });

  const justAchieved: string[] = [];

  for (const g of rows) {
    let next = g.status;

    if (g.kind === 'container') {
      // Live children only, for the same reason as `tree`. Before this, one
      // abandoned child made a container permanently unachievable: abandoned is
      // not achieved, so `every` was false forever. The leaf deduplication put
      // fourteen goals into that state in one go.
      const live = g.children.filter((c) => c.status !== 'abandoned');
      next = live.length && live.every((c) => c.status === 'achieved') ? 'achieved' : 'active';
    } else if (g.baselineValue == null && g.baselineText == null) {
      next = 'waiting_baseline';
    } else if (g.blockedBy.some((b) => b.blocker.status !== 'achieved')) {
      next = 'blocked';
    } else {
      const s = await standingFor(userId, g);
      next = s.reached ? 'achieved' : 'active';
    }

    if (next === g.status) continue;
    if (next === 'achieved') justAchieved.push(g.title);
    await prisma.goal.update({
      where: { id: g.id },
      data: {
        status: next as never,
        // Set once. A goal that dips back below target after being reached does
        // not un-happen; it is still the day he got there.
        achievedAt: next === 'achieved' ? (g.achievedAt ?? new Date()) : g.achievedAt,
      },
    });
  }

  return { achieved: justAchieved };
}

/** Confirm a proposed goal, and everything under it.
 *
 *  Nothing is a goal until he says it is. But one sentence decomposes into
 *  forty pieces, and confirming forty things one at a time is a wall nobody
 *  walks through: the decomposition stops being a help and becomes a chore he
 *  abandons halfway, leaving a tree half confirmed and a screen that can report
 *  nothing honestly.
 *
 *  So confirming a container confirms its subtree. He agreed to the thing; the
 *  parts are what the thing is made of. Dropping an individual part afterwards
 *  is one tap and it is reversible, which is the right way round: the cost of a
 *  wrong cascade is a tap, the cost of forty taps is the feature.
 *
 *  Two things never cascade.
 *
 *  An INFERRED goal is one nobody recorded, reasoned to rather than read off.
 *  Agreeing to "get off the statin" is not agreeing that inflammation underlies
 *  everything, and quietly taking the second as part of the first is how an
 *  assumption becomes a fact in a health record.
 *
 *  An ABANDONED goal stays abandoned. He already said no to that one, and a
 *  cascade that revives it overrules him.
 */
export async function confirm(userId: string, id: string, baseline?: { value?: number; text?: string }) {
  const g = await prisma.goal.findFirst({ where: { id, userId } });
  if (!g) throw notFound('No such goal');
  if (g.status !== 'proposed') throw badRequest('That one is already set');

  const all = await prisma.goal.findMany({
    where: { userId }, select: { id: true, parentId: true, status: true, inferred: true },
  });
  const kids = new Map<string, typeof all>();
  for (const row of all) {
    if (!row.parentId) continue;
    const list = kids.get(row.parentId) ?? [];
    list.push(row);
    kids.set(row.parentId, list);
  }

  // Walk down from the one he tapped, stopping at anything inferred.
  const cascade: string[] = [];
  const queue = [...(kids.get(id) ?? [])];
  while (queue.length) {
    const row = queue.shift()!;
    if (row.inferred || row.status !== 'proposed') continue;
    cascade.push(row.id);
    queue.push(...(kids.get(row.id) ?? []));
  }

  await prisma.$transaction([
    prisma.goal.update({
      where: { id },
      data: {
        status: 'active',
        baselineValue: baseline?.value ?? g.baselineValue,
        baselineText: baseline?.text ?? g.baselineText,
        // The baseline he typed belongs to the goal he typed it on. It is not
        // true of its children, and copying it down would invent forty
        // starting numbers out of one.
        baselineAt: baseline && (baseline.value != null || baseline.text) ? new Date() : g.baselineAt,
      },
    }),
    ...(cascade.length
      ? [prisma.goal.updateMany({ where: { id: { in: cascade } }, data: { status: 'active' } })]
      : []),
  ]);

  await refresh(userId);
  const confirmed = await prisma.goal.findUnique({ where: { id } });
  return { goal: confirmed, alsoConfirmed: cascade.length };
}

export async function abandon(userId: string, id: string) {
  const g = await prisma.goal.findFirst({ where: { id, userId } });
  if (!g) throw notFound('No such goal');
  // Abandoned, not deleted. What he tried and stopped is part of the picture,
  // and a goal that vanishes takes the reason it existed with it.
  return prisma.goal.update({ where: { id }, data: { status: 'abandoned' } });
}

/** What he has finished, by month and by year. The reason small goals matter. */
export async function scoreboard(userId: string) {
  // LEAVES ONLY. A container finishing is a consequence of its parts finishing,
  // not a separate thing he did, and counting both means one piece of work
  // scores twice. It gets worse the deeper the tree happens to be: five of his
  // containers now hold exactly one goal, so finishing that one goal would have
  // scored two, and up the nicotine chain it would have scored four.
  //
  // How deep the model nested a branch is its wording, not his effort. "You
  // achieved 28 goals this year" has to be countable by counting what he did.
  const done = await prisma.goal.findMany({
    where: { userId, status: 'achieved', achievedAt: { not: null }, kind: { not: 'container' } },
    orderBy: { achievedAt: 'desc' },
    select: { id: true, title: true, achievedAt: true, why: true },
  });
  const now = new Date();
  const month = done.filter((d) => d.achievedAt! >= new Date(now.getFullYear(), now.getMonth(), 1));
  const year = done.filter((d) => d.achievedAt! >= new Date(now.getFullYear(), 0, 1));
  return { thisMonth: month.length, thisYear: year.length, total: done.length, recent: done.slice(0, 10) };
}
