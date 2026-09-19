import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import { buildBrief } from '../../record/brief';
import { confirm as confirmGoal, abandon as abandonGoal, tree, scoreboard } from '../../goal/service';
import { planFor, setDone } from '../../plan/service';
import { rootsFor } from '../../farm/roots';
import { SAID, type Said } from '../../record/extract';
import { defineOp, type Op } from './registry';

/** The operations the chat can perform.
 *
 *  Each one calls the SAME service function the HTTP controller calls, and
 *  validates with the SAME Zod schema where one exists. Not the same HTTP: the
 *  controllers hold no rules, ownership is re-checked inside every service on
 *  every mutation, and a call over the network would cost a second credential,
 *  a hop that can fail alone, and a call that cannot join the transaction
 *  around it.
 */

// ---- free: reading his own record ---------------------------------------

const readRecord = defineOp({
  tier: 'free',
  name: 'read_record',
  description:
    'What is already known about this person: their markers and recent direction, '
    + 'open symptoms, and what they take daily versus only when needed. Read this '
    + 'before answering anything about their health rather than guessing.',
  schema: z.object({}),
  run: async (_input, ctx) => {
    const brief = await buildBrief(ctx.userId);
    return { ok: true, result: brief ?? 'Nothing in the record yet.' };
  },
});

const readPlan = defineOp({
  tier: 'free',
  name: 'read_today',
  description:
    "Today's plan: what they are meant to do, what is already ticked off, and the "
    + 'id of each item. Read this before marking anything done, because marking '
    + 'needs the id and guessing at one is how the wrong thing gets ticked.',
  schema: z.object({}),
  run: async (_input, ctx) => {
    const day = await planFor(ctx.userId, ctx.localDay);
    return { ok: true, result: day };
  },
});

const readGoals = defineOp({
  tier: 'free',
  name: 'read_goals',
  description:
    'Their goals as a tree, with how each one stands and how many are finished '
    + 'this month and this year. Read it before talking about progress or before '
    + 'confirming or dropping anything, because both need an id.',
  schema: z.object({}),
  run: async (_input, ctx) => {
    const [goals, score] = await Promise.all([tree(ctx.userId), scoreboard(ctx.userId)]);
    return { ok: true, result: { goals, scoreboard: score } };
  },
});

const readRoots = defineOp({
  tier: 'free',
  name: 'read_roots',
  description:
    'How much is known about them: markers ever measured, how many have more than '
    + 'one reading, symptoms, medicines, and how far back the record reaches. '
    + 'Completeness only, no values.',
  schema: z.object({}),
  run: async (_input, ctx) => ({ ok: true, result: await rootsFor(ctx.userId) }),
});

// ---- undoable: writes, named in the reply, reversible --------------------

const logSchema = z.object({
  kind: z.string().min(1).max(40).describe(
    'One of: meal, drink, water, alcohol, nicotine, symptom, sleep, medication, '
    + 'supplement, activity, stool, mood, weight.'),
  value: z.string().min(1).max(200).describe('In their own words. Never your paraphrase.'),
  said: z.enum(['did', 'will', 'did-not', 'used-to', 'considering', 'asking-about']).describe(
    'What they CLAIMED. Only "did" enters the record as something that happened. '
    + 'If none of these fits what they said, do not call this tool at all.'),
  amount: z.number().optional().describe('Only a number THEY said. Never one you worked out.'),
  unit: z.string().max(20).optional().describe('The unit they used. Only alongside an amount.'),
});

const logIt = defineOp({
  tier: 'undoable',
  name: 'log',
  description:
    'Write down something they told you about their own day: a meal, water, a dose '
    + 'taken, how they slept, a symptom. Only what THEY said. Never what you '
    + 'concluded, and never a number they did not give.',
  schema: logSchema,
  run: async (input, ctx) => {
    const row = await prisma.observation.create({
      data: {
        userId: ctx.userId,
        localDay: ctx.localDay,
        exchangeId: ctx.exchangeId,
        variable: input.kind,
        value: input.value,
        said: input.said as Said,
        // Kept in step while anything still reads the old column.
        planned: input.said === 'will',
        amount: input.amount ?? null,
        unit: input.unit ?? null,
      },
      select: { id: true },
    });
    const amount = input.amount != null ? ` (${input.amount}${input.unit ?? ''})` : '';
    return {
      ok: true,
      result: { id: row.id },
      say: input.said === 'did' ? `logged: ${input.value}${amount}` : `noted: ${input.value}${amount}`,
    };
  },
  undo: async (call) => {
    const id = (call.result as { id?: string })?.id;
    if (id) await prisma.observation.deleteMany({ where: { id } });
  },
});

const markDone = defineOp({
  tier: 'undoable',
  name: 'mark_plan_item',
  description:
    'Tick something off today\'s plan, or untick it. Needs the item id from '
    + 'read_today. Only call this when they said they did it, not when they said '
    + 'they will.',
  schema: z.object({
    id: z.string().uuid().describe('The plan item id, from read_today.'),
    done: z.boolean().describe('True when they did it. False to undo a tick.'),
  }),
  run: async (input, ctx) => {
    const item = await setDone(ctx.userId, input.id, input.done);
    return {
      ok: true,
      result: { id: input.id, wasDone: !input.done },
      say: `${input.done ? 'ticked off' : 'put back'}: ${item?.title ?? 'a plan item'}`,
    };
  },
  undo: async (call, ctx) => {
    const r = call.result as { id?: string; wasDone?: boolean };
    if (r?.id) await setDone(ctx.userId, r.id, r.wasDone === true);
  },
});

const setGoal = defineOp({
  tier: 'undoable',
  name: 'confirm_goal',
  description:
    'Turn a proposed goal into a real one. Needs the id from read_goals. Confirming '
    + 'a container confirms everything under it, except anything marked as worked '
    + 'out rather than read off their record.',
  schema: z.object({ id: z.string().uuid().describe('The goal id, from read_goals.') }),
  run: async (input, ctx) => {
    const out = await confirmGoal(ctx.userId, input.id);
    const also = out.alsoConfirmed;
    return {
      ok: true,
      result: { id: input.id, alsoConfirmed: also },
      say: also
        ? `set as a goal, along with the ${also} ${also === 1 ? 'piece' : 'pieces'} under it`
        : 'set as a goal',
    };
  },
  undo: async (call) => {
    const id = (call.input as { id?: string })?.id;
    // Back to proposed, and the subtree with it. achievedAt is never touched:
    // a goal that was reached did not un-happen because a tap was undone.
    if (id) {
      await prisma.goal.updateMany({ where: { id }, data: { status: 'proposed' } });
      await prisma.goal.updateMany({ where: { parentId: id, status: 'active' }, data: { status: 'proposed' } });
    }
  },
});

const dropGoal = defineOp({
  tier: 'undoable',
  name: 'drop_goal',
  description:
    'Give up on a goal. It is marked abandoned, never deleted: what they tried and '
    + 'stopped is part of the picture. Needs the id from read_goals.',
  schema: z.object({ id: z.string().uuid().describe('The goal id, from read_goals.') }),
  run: async (input, ctx) => {
    const before = await prisma.goal.findFirst({
      where: { id: input.id, userId: ctx.userId }, select: { status: true, title: true },
    });
    if (!before) return { ok: false, result: { error: 'no such goal' } };
    await abandonGoal(ctx.userId, input.id);
    return {
      ok: true,
      result: { id: input.id, was: before.status },
      say: `dropped: ${before.title}`,
    };
  },
  undo: async (call, ctx) => {
    const r = call.result as { id?: string; was?: string };
    if (r?.id && r.was) {
      await prisma.goal.updateMany({ where: { id: r.id, userId: ctx.userId }, data: { status: r.was as never } });
    }
  },
});

/** The table. Absent means unreachable. */
export const OPS: Op[] = [
  readRecord, readPlan, readGoals, readRoots,
  logIt, markDone, setGoal, dropGoal,
];

export const BY_NAME = new Map(OPS.map((o) => [o.name, o]));

/** Sanity, checked at import rather than in a test nobody runs: every value the
 *  log tool accepts for `said` is one extraction recognises. Two lists of the
 *  same six words drift. */
const declared = (logSchema.shape.said as unknown as { options: string[] }).options;
if (declared.length !== SAID.length || declared.some((v) => !(SAID as readonly string[]).includes(v))) {
  throw new Error('log tool `said` values have drifted from extract.ts SAID');
}
