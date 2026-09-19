import { prisma } from '../../lib/prisma';
import { badRequest, forbidden, notFound } from '../../errors/app.errors';
import { localDay } from '../../shared/helper';
import { farmFor } from '../farm/service';

/** Care circle: letting a chosen person see more than a neighbour does.
 *
 *  The person being seen controls everything. The person watching controls
 *  nothing: they can ask, and that is all. Only the owner creates a link, only
 *  the owner chooses what is in it, and only the owner ends it.
 *
 *  Every category starts OFF. A default that shares is a default nobody chose,
 *  and this is somebody's medication history.
 *
 *  What is never shareable at all, at any setting: records, measurements and
 *  conversation. Those are not a toggle that was left off, they are simply not
 *  in this file, so no future switch can turn them on by accident.
 */

export async function invite(ownerId: string, viewerEmail: string) {
  const viewer = await prisma.user.findUnique({ where: { email: viewerEmail.toLowerCase() }, select: { id: true } });
  if (!viewer) throw notFound('Nobody with that address is using outplan yet');
  if (viewer.id === ownerId) throw badRequest('That is you');

  return prisma.careLink.upsert({
    where: { ownerId_viewerId: { ownerId, viewerId: viewer.id } },
    create: { ownerId, viewerId: viewer.id },
    // Re-inviting someone does not silently restore what they could see before.
    // It unpauses the link and nothing more; the toggles stay where the owner
    // last left them.
    update: { pausedAt: null },
    select: { id: true, createdAt: true },
  });
}

export interface Sharing {
  seeCheckIn?: boolean;
  seeDoses?: boolean;
  seeProblems?: boolean;
  seeQuietDays?: boolean;
  quietAfterDays?: number;
}

/** Only the owner may change what is shared. Not the viewer, not on request. */
export async function setSharing(ownerId: string, linkId: string, s: Sharing) {
  const link = await prisma.careLink.findFirst({ where: { id: linkId, ownerId } });
  if (!link) throw notFound('No such person in your circle');
  const days = s.quietAfterDays;
  if (days !== undefined && (days < 1 || days > 30)) throw badRequest('Choose between 1 and 30 days');

  return prisma.careLink.update({
    where: { id: linkId },
    data: {
      seeCheckIn: s.seeCheckIn ?? link.seeCheckIn,
      seeDoses: s.seeDoses ?? link.seeDoses,
      seeProblems: s.seeProblems ?? link.seeProblems,
      seeQuietDays: s.seeQuietDays ?? link.seeQuietDays,
      quietAfterDays: days ?? link.quietAfterDays,
    },
  });
}

/** Pause, never delete. The viewer is told sharing has paused and nothing else:
 *  not why, not for how long. A reason would be a disclosure of its own. */
export async function pause(ownerId: string, linkId: string, paused: boolean) {
  const link = await prisma.careLink.findFirst({ where: { id: linkId, ownerId } });
  if (!link) throw notFound('No such person in your circle');
  return prisma.careLink.update({
    where: { id: linkId }, data: { pausedAt: paused ? new Date() : null },
  });
}

/** What the owner sees: who is in the circle and exactly what each can see.
 *  One screen, in the words they chose, because "you can revoke this" is only
 *  true if they can see what it is. */
export async function circleOf(ownerId: string) {
  const links = await prisma.careLink.findMany({
    where: { ownerId },
    select: {
      id: true, seeCheckIn: true, seeDoses: true, seeProblems: true, seeQuietDays: true,
      quietAfterDays: true, pausedAt: true,
      viewer: { select: { name: true, email: true } },
    },
  });
  return links.map((l) => ({
    id: l.id,
    who: l.viewer.name ?? l.viewer.email,
    paused: l.pausedAt !== null,
    quietAfterDays: l.quietAfterDays,
    sees: [
      l.seeCheckIn && 'whether you checked in',
      l.seeDoses && 'whether you took your medicines',
      l.seeProblems && 'when your farm needs attention',
      l.seeQuietDays && 'if you go quiet for a few days',
    ].filter(Boolean) as string[],
  }));
}

/** What a VIEWER is allowed to see of someone else.
 *
 *  Assembled from the toggles, one at a time. Nothing is fetched and then
 *  filtered: a field that is off is never read, so a rendering bug cannot leak
 *  what a query never returned.
 */
export async function viewOf(viewerId: string, ownerId: string) {
  const link = await prisma.careLink.findUnique({
    where: { ownerId_viewerId: { ownerId, viewerId } },
  });
  if (!link) throw forbidden('You are not in their circle');
  if (link.pausedAt) return { paused: true as const };

  const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { name: true, timezone: true } });
  const tz = owner?.timezone ?? 'Asia/Kolkata';
  const today = localDay(new Date(), tz);

  const out: Record<string, unknown> = { who: owner?.name?.split(/\s+/)[0] ?? 'They', paused: false };

  if (link.seeCheckIn) {
    const said = await prisma.exchange.count({ where: { userId: ownerId, localDay: today } });
    out.checkedInToday = said > 0;
  }

  if (link.seeDoses) {
    const [total, done] = await Promise.all([
      prisma.planItem.count({ where: { userId: ownerId, localDay: today } }),
      prisma.planItem.count({ where: { userId: ownerId, localDay: today, status: 'done' } }),
    ]);
    // A count, never which ones. Knowing he missed "Rosuvas 5" tells you he
    // takes a statin, and that is a diagnosis by another route.
    out.doses = { done, total };
  }

  if (link.seeProblems) {
    const farm = await farmFor(ownerId);
    out.needsAttention = farm.mechanics.filter((m) => m.health === 'needs_attention').map((m) => m.scene);
  }

  if (link.seeQuietDays) {
    const last = await prisma.exchange.findFirst({
      where: { userId: ownerId }, orderBy: { saidAt: 'desc' }, select: { saidAt: true },
    });
    const quietDays = last ? Math.floor((Date.now() - last.saidAt.getTime()) / 86_400_000) : null;
    // A prompt to call, never a report of failure. Tone is a requirement here,
    // not decoration: a carer who is told someone is "failing" phones to
    // scold, and the person being watched starts logging dishonestly.
    out.quiet = quietDays !== null && quietDays >= link.quietAfterDays
      ? { days: quietDays, say: 'Might be worth a call' }
      : null;
  }

  return out;
}
