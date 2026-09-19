/** Find goals written down twice, and optionally merge them.
 *
 *  Two goals are the SAME when they watch the same `measure` in the same
 *  `direction` AND are both about moving the number rather than measuring it
 *  again. The save path stops new ones being created; this is for the pairs
 *  that already exist, and afterwards for noticing if any ever get through.
 *
 *  That last clause is not theoretical. Run over his record without it, this
 *  would have merged "Recheck ApoB on a fixed schedule" into "Bring ApoB into
 *  optimal range" and deleted the reminder to go and test.
 *
 *    npx tsx scripts/goal-dupes.ts <email>          list them
 *    npx tsx scripts/goal-dupes.ts <email> --fix    merge them
 *
 *  READ-ONLY unless --fix is passed. The merge keeps the OLDEST row, because it
 *  is the one he has already seen and may already have confirmed, and folds the
 *  others into it: a missing target is filled in, `inferred` takes the cautious
 *  value, and every child is re-parented so no subtree goes down with its
 *  parent.
 *
 *  NOTHING IS DELETED. The duplicate is marked abandoned, which is the rule this
 *  codebase already follows for goals: "what he tried and stopped is part of the
 *  picture, and a goal that vanishes takes the reason it existed with it". It
 *  applies twice over here, because these are rows in a person's health record
 *  and the merge is my judgement about them, not his. Abandoned goals are
 *  already excluded from every count and from the duplicate key, so the number
 *  is right either way, and if I have merged two things that were not the same
 *  the evidence is still there.
 */
import { prisma } from '../src/lib/prisma';
import { keyOf } from '../src/modules/goal/decompose';

async function main() {
  const email = process.argv[2];
  const fix = process.argv.includes('--fix');
  if (!email) {
    console.error('usage: goal-dupes.ts <email> [--fix]');
    process.exit(1);
  }

  try {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });
    if (!user) { console.error(`no account for ${email}`); process.exit(1); }

    const rows = await prisma.goal.findMany({
      where: { userId: user.id, measure: { not: null }, status: { not: 'abandoned' } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, title: true, measure: true, direction: true, targetValue: true,
        why: true, inferred: true, status: true, createdAt: true, parentId: true,
      },
    });

    // The SAME key the save path uses, imported rather than rewritten. Two
    // copies of an identity rule drift, and this one deletes rows.
    const groups = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = keyOf(r.measure, r.direction, r.title);
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    const dupes = [...groups.entries()].filter(([, g]) => g.length > 1);

    if (!dupes.length) { console.log(`${user.email}: no duplicates among ${rows.length} measured goals`); return; }

    console.log(`${user.email}: ${dupes.length} duplicated goal(s) among ${rows.length} measured\n`);
    for (const [key, group] of dupes) {
      const [keep, ...rest] = group;
      console.log(`${key}`);
      console.log(`  KEEP  ${keep!.title}  target=${keep!.targetValue ?? '-'} inferred=${keep!.inferred} ${keep!.status}`);
      for (const r of rest) {
        console.log(`  MERGE ${r.title}  target=${r.targetValue ?? '-'} inferred=${r.inferred} ${r.status}`);
      }

      if (!fix) continue;

      const target = keep!.targetValue ?? rest.find((r) => r.targetValue != null)?.targetValue ?? null;
      const inferred = group.some((r) => r.inferred);
      const why = keep!.why;

      await prisma.$transaction(async (tx) => {
        await tx.goal.update({
          where: { id: keep!.id },
          data: { targetValue: target, inferred, why },
        });
        for (const r of rest) {
          // Children first. A duplicate with a subtree must not take it down.
          await tx.goal.updateMany({ where: { parentId: r.id }, data: { parentId: keep!.id } });
          // Anything waiting on the duplicate now waits on the survivor.
          await tx.goalBlock.updateMany({ where: { blockerId: r.id }, data: { blockerId: keep!.id } });
          await tx.goal.update({
            where: { id: r.id },
            data: {
              status: 'abandoned',
              why: `${r.why ? `${r.why} ` : ''}Merged into "${keep!.title}", which watches the same number the same way.`.slice(0, 300),
            },
          });
        }
      });
      console.log(`  merged ${rest.length} (marked abandoned, not deleted), target=${target ?? '-'} inferred=${inferred}`);
    }

    if (!fix) console.log('\nnothing changed. pass --fix to merge.');
  } finally {
    // Always. A throwaway script that throws will otherwise hold a production
    // connection open until somebody notices, which has happened here before.
    await prisma.$disconnect();
  }
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
