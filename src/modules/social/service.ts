import { randomBytes } from 'node:crypto';
import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../errors/app.errors';
import { farmFor } from '../farm/service';
import { requireFarm } from '../farm/identity';

/** Neighbours, invitations, and what one farm may know about another.
 *
 *  THE RULE THIS FILE EXISTS TO ENFORCE: the farm may be seen, the health data
 *  may not. A neighbour sees earned rewards and nothing else - no problem
 *  states, no quests, no records, no conversation, no counts, no notes.
 *
 *  And the half that is easy to miss: ABSENCE MUST NOT SIGNAL. What a neighbour
 *  receives is a list of rewards that ARE there. It never says which are
 *  missing, because "no fireflies" is a statement about someone's sleep, and a
 *  list of unearned rewards is that statement written down.
 */

/** A code that says nothing.
 *
 *  Not derived from the user id, their name or anything else: a stranger who
 *  guesses one must learn nothing about who sent it. 16 bytes, so guessing is
 *  not a threat model.
 */
export async function createInvite(userId: string) {
  await requireFarm(userId);
  return prisma.invite.create({
    data: { userId, code: randomBytes(16).toString('base64url') },
    select: { code: true, createdAt: true },
  });
}

/** What a visitor arriving on an invite link sees BEFORE signing up.
 *
 *  The PRD wants them to see the farm and the plot saved for them. So this is
 *  reachable without authentication, and it is therefore the most exposed
 *  surface in the product: it returns the tree, its name, and the rewards
 *  earned. No health data, no counts, no problem states, and no indication of
 *  what is missing.
 */
export async function previewInvite(code: string) {
  const invite = await prisma.invite.findUnique({
    where: { code },
    select: { id: true, acceptedAt: true, user: { select: { id: true, name: true, farm: { select: { tree: true, treeName: true } } } } },
  });
  if (!invite?.user.farm) throw notFound('That invitation is not valid');

  const farm = await farmFor(invite.user.id);
  return {
    // A first name only. The full name is the string their medical reports are
    // matched against and has no business on a public page.
    from: invite.user.name?.split(/\s+/)[0] ?? 'A friend',
    tree: invite.user.farm.tree,
    treeName: invite.user.farm.treeName,
    // Earned only. Never the unearned ones, never a count, never a total: "3 of
    // 6" tells a stranger about three habits this person is not keeping.
    rewards: farm.visitors.filter((v) => v.earned).map((v) => ({ name: v.name, earnedFor: v.earnedFor })),
    alreadyAccepted: invite.acceptedAt !== null,
  };
}

/** Accept an invitation: the two farms become neighbours.
 *
 *  No reward is granted here. The free month lands only when the invited
 *  friend's first payment clears - rewarding a signup invites self-referral and
 *  trial-cancel loops, and a discount that can be farmed is not a discount.
 */
export async function acceptInvite(userId: string, code: string) {
  const invite = await prisma.invite.findUnique({ where: { code }, select: { id: true, userId: true, acceptedAt: true } });
  if (!invite) throw notFound('That invitation is not valid');
  if (invite.userId === userId) throw badRequest('That is your own invitation');
  if (invite.acceptedAt) throw badRequest('That invitation has already been used');

  const mine = await requireFarm(userId);
  const theirs = await prisma.farm.findUnique({ where: { userId: invite.userId }, select: { id: true } });
  if (!theirs) throw notFound('That farm no longer exists');

  await prisma.$transaction([
    prisma.invite.update({ where: { id: invite.id }, data: { acceptedById: userId, acceptedAt: new Date() } }),
    // Both directions, written once. A neighbour relationship read from one side
    // only is one that disagrees with itself the moment a row is missed.
    prisma.neighbour.createMany({
      data: [{ fromId: mine.id, toId: theirs.id }, { fromId: theirs.id, toId: mine.id }],
      skipDuplicates: true,
    }),
  ]);
  return { neighbours: true };
}

/** The neighbours' row: every farm beside this one, as they are allowed to be seen. */
export async function neighboursOf(userId: string) {
  const mine = await requireFarm(userId);
  const links = await prisma.neighbour.findMany({
    where: { fromId: mine.id },
    select: { to: { select: { treeName: true, tree: true, user: { select: { id: true, name: true } } } } },
  });

  return Promise.all(links.map(async (l) => {
    const farm = await farmFor(l.to.user.id);
    return {
      name: l.to.user.name?.split(/\s+/)[0] ?? 'A neighbour',
      tree: l.to.tree,
      treeName: l.to.treeName,
      // Earned rewards only, and no hint of the rest. Tapping one explains how
      // it is earned, which is the entire point: a reward you can see the shape
      // of is a reward you can decide to go after.
      rewards: farm.visitors.filter((v) => v.earned).map((v) => ({ key: v.key, name: v.name, earnedFor: v.earnedFor })),
    };
  }));
}
