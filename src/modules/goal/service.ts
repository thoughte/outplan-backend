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
      // A container is as far along as its parts. Computed after the children
      // so the roll-up sees their real numbers rather than a stored guess.
      const own = standings.get(g.id)!;
      const s: Standing = g.kind === 'container'
        ? {
            fraction: rollUp(children.map((c) => c.standing.fraction)),
            current: null,
            reached: children.length > 0 && children.every((c) => c.status === 'achieved'),
            summary: children.length
              ? `${children.filter((c) => c.status === 'achieved').length} of ${children.length} done`
              : 'nothing under it yet',
          }
        : own;
      return {
        id: g.id, title: g.title, why: g.why, kind: g.kind as GoalNode['kind'],
        status: g.status, direction: g.direction as Direction, measure: g.measure,
        baselineValue: g.baselineValue, targetValue: g.targetValue,
        achievedAt: g.achievedAt, intentText: g.intentText,
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
      next = g.children.length && g.children.every((c) => c.status === 'achieved') ? 'achieved' : 'active';
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

/** Confirm a proposed goal. Nothing is a goal until he says it is. */
export async function confirm(userId: string, id: string, baseline?: { value?: number; text?: string }) {
  const g = await prisma.goal.findFirst({ where: { id, userId } });
  if (!g) throw notFound('No such goal');
  if (g.status !== 'proposed') throw badRequest('That one is already set');

  await prisma.goal.update({
    where: { id },
    data: {
      status: 'active',
      baselineValue: baseline?.value ?? g.baselineValue,
      baselineText: baseline?.text ?? g.baselineText,
      baselineAt: baseline && (baseline.value != null || baseline.text) ? new Date() : g.baselineAt,
    },
  });
  await refresh(userId);
  return prisma.goal.findUnique({ where: { id } });
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
  const done = await prisma.goal.findMany({
    where: { userId, status: 'achieved', achievedAt: { not: null } },
    orderBy: { achievedAt: 'desc' },
    select: { id: true, title: true, achievedAt: true, why: true },
  });
  const now = new Date();
  const month = done.filter((d) => d.achievedAt! >= new Date(now.getFullYear(), now.getMonth(), 1));
  const year = done.filter((d) => d.achievedAt! >= new Date(now.getFullYear(), 0, 1));
  return { thisMonth: month.length, thisYear: year.length, total: done.length, recent: done.slice(0, 10) };
}
