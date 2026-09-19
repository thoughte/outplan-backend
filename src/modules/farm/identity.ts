import { prisma } from '../../lib/prisma';
import { badRequest, notFound } from '../../errors/app.errors';
import { treeFor, TREES, type TreeKind } from './trees';

/** Choosing and naming a tree.
 *
 *  The quiz suggests; the person decides. Both are kept, because the whole bet
 *  is that people care for what they CHOSE, and a rejected suggestion is worth
 *  knowing when the quiz is tuned later.
 */
export async function chooseTree(
  userId: string, answers: Record<string, number>, picked: TreeKind | undefined, name: string,
) {
  const suggested = treeFor(answers);
  const tree = picked ?? suggested;
  if (!TREES.some((t) => t.key === tree)) throw badRequest('That is not one of the trees');
  const treeName = name.trim().slice(0, 40);
  if (treeName.length < 1) throw badRequest('Give your tree a name');

  return prisma.farm.upsert({
    where: { userId },
    create: { userId, tree, suggested, treeName },
    // Re-taking the quiz renames and re-picks rather than starting a second
    // farm. Nothing earned is attached to the tree's species, so changing your
    // mind costs nothing and should not.
    update: { tree, suggested, treeName },
    select: { id: true, tree: true, suggested: true, treeName: true, createdAt: true },
  });
}

export async function myFarmIdentity(userId: string) {
  return prisma.farm.findUnique({
    where: { userId },
    select: { id: true, tree: true, treeName: true, createdAt: true },
  });
}

export async function requireFarm(userId: string) {
  const f = await myFarmIdentity(userId);
  if (!f) throw notFound('You have not planted a tree yet');
  return f;
}
