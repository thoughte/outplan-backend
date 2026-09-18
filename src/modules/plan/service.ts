import { prisma } from '../../lib/prisma';
import { notFound } from '../../errors/app.errors';
import { slotFor } from './schedule';

/** The day's plan: what to do, and whether it was done.
 *
 *  Built from the record, never maintained beside it. His five breakfast
 *  tablets and his 20:00 magnesium are already in `interventions` with their
 *  schedules; a second list typed in by hand is a list that will eventually
 *  disagree with the first, and then neither can be trusted.
 */

/** Build or refresh a day without disturbing what has been done.
 *
 *  Idempotent: the key is stable per source per day, so regenerating adds what
 *  is new and leaves the rest alone. A plan that forgot what you had ticked
 *  every time it refreshed would be worse than no plan.
 */
export async function planFor(userId: string, localDay: string) {
  const live = await prisma.intervention.findMany({
    where: { userId, stoppedOn: null },
    select: { id: true, name: true, dose: true, schedule: true, kind: true },
  });

  const wanted = live
    .map((i) => ({ i, slot: slotFor(i.schedule) }))
    .filter((x): x is { i: typeof live[number]; slot: NonNullable<ReturnType<typeof slotFor>> } => x.slot !== null);

  if (wanted.length) {
    await prisma.planItem.createMany({
      data: wanted.map(({ i, slot }) => ({
        userId, localDay,
        key: `intervention:${i.id}`,
        title: i.name,
        detail: [i.dose, i.schedule].filter(Boolean).join(' · ') || null,
        atLocal: slot.atLocal,
        sortOrder: slot.sortOrder,
        source: 'intervention' as const,
        interventionId: i.id,
      })),
      // Already there means already there, possibly already ticked.
      skipDuplicates: true,
    });
  }

  return prisma.planItem.findMany({
    where: { userId, localDay },
    orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    select: {
      id: true, key: true, title: true, detail: true, atLocal: true, sortOrder: true,
      source: true, status: true, doneAt: true, doneVia: true, localDay: true,
    },
  });
}

/** Tick or untick, by hand. */
export async function setDone(userId: string, id: string, done: boolean) {
  const item = await prisma.planItem.findFirst({ where: { id, userId } });
  if (!item) throw notFound('No such thing on your plan');

  return prisma.planItem.update({
    where: { id },
    data: done
      ? { status: 'done', doneAt: new Date(), doneVia: 'tap' }
      // Unticking clears how it was marked too. Leaving doneVia behind would
      // have the record claiming it was matched from something he said, for an
      // item that is no longer done at all.
      : { status: 'pending', doneAt: null, doneVia: null, observationId: null },
    select: {
      id: true, key: true, title: true, detail: true, atLocal: true, sortOrder: true,
      source: true, status: true, doneAt: true, doneVia: true, localDay: true,
    },
  });
}

/** How he refers to a group of them: "took my morning meds".
 *
 *  This is the half he asked for. Ticking boxes is fine, but the thing he
 *  actually does is say what he did, and his own words are already in the
 *  record: "morning meds", "night meds", "both doses taken".
 */
const MORNING = /\bmorning\b|\bbreakfast\b|\bsubah\b/i;
const EVENING = /\bnight\b|\bevening\b|\bbedtime\b|\braat\b/i;
const ALL_OF_THEM = /\ball\b|\bboth\b|\beverything\b|\bdoses\b|\bstack\b/i;

/** Words that are too small or too common to match a medicine on. Matching
 *  "D" or "5" against a name would tick the wrong tablet, and ticking the wrong
 *  tablet is worse than ticking none. */
const tooVague = (w: string) => w.length < 4 || /^\d+$/.test(w);

/** Which of today's open items does this observation plausibly mean?
 *
 *  Deliberately conservative. An unticked box he has to tap is a small
 *  annoyance; a box ticked for a tablet he never took is his record saying he
 *  is adherent when he is not, and that is the number the whole plan turns on.
 */
export function matchItems<T extends { id: string; title: string; sortOrder: number }>(
  said: string, items: T[],
): T[] {
  const text = said.toLowerCase();

  const morning = items.filter((i) => i.sortOrder < 12 * 60);
  const evening = items.filter((i) => i.sortOrder >= 16 * 60);

  if (MORNING.test(text) && morning.length) return morning;
  if (EVENING.test(text) && evening.length) return evening;
  if (ALL_OF_THEM.test(text) && /med|tablet|supplement|dose/i.test(text)) return items;

  // Otherwise by name: every distinctive word of the title must appear.
  return items.filter((i) => {
    const words = i.title.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => !tooVague(w));
    if (!words.length) return false;
    return words.some((w) => text.includes(w));
  });
}

/** Mark whatever he just said he did.
 *
 *  Called after an observation is written, never instead of writing it: what he
 *  said is the record, and the plan is a view of it. If the matching is wrong,
 *  the observation is still right.
 */
export async function markFromObservation(
  userId: string, localDay: string, observationId: string, kind: string, value: string,
): Promise<number> {
  if (kind !== 'medication' && kind !== 'supplement') return 0;

  const open = await prisma.planItem.findMany({
    where: { userId, localDay, status: 'pending' },
    select: { id: true, title: true, sortOrder: true },
  });
  if (!open.length) return 0;

  const hit = matchItems(value, open);
  if (!hit.length) return 0;

  const done = await prisma.planItem.updateMany({
    where: { id: { in: hit.map((h) => h.id) }, status: 'pending' },
    data: { status: 'done', doneAt: new Date(), doneVia: 'said', observationId },
  });
  return done.count;
}
