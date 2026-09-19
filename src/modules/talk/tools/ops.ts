import { z } from 'zod';
import { prisma } from '../../../lib/prisma';
import { buildBrief } from '../../record/brief';
import { confirm as confirmGoal, abandon as abandonGoal, tree, scoreboard } from '../../goal/service';
import { draft, save } from '../../goal/decompose';
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

    // FLATTENED AND TRIMMED. The full tree came back at 80,541 bytes on his
    // account, every `why` and every nested standing, and all of it went into
    // the model's context on any question about goals. It crowded out the
    // conversation and it was paid for twice, once in and once out.
    //
    // What a decision actually needs: the id, what it is, where it sits, and
    // how it stands in one line. `why` is left out; if it matters for one goal
    // it can be asked for, and it never matters for forty.
    const flat: Array<Record<string, unknown>> = [];
    const walk = (nodes: typeof goals, under: string | null) => {
      for (const g of nodes) {
        if (g.status !== 'abandoned') {
          flat.push({
            id: g.id,
            title: g.title,
            status: g.status,
            under,
            ...(g.inferred ? { inferred: true } : {}),
            ...(g.kind === 'container' ? {} : { standing: g.standing.summary }),
          });
        }
        walk(g.children, g.title);
      }
    };
    walk(goals, null);

    return { ok: true, result: { goals: flat, scoreboard: { thisMonth: score.thisMonth, thisYear: score.thisYear, total: score.total } } };
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

const proposeGoal = defineOp({
  tier: 'undoable',
  name: 'propose_goal',
  description:
    'Create a new goal from something they want to change. Say it in THEIR words: '
    + '"do a workout at least 15 minutes a day", "stop alcohol". It is broken into '
    + 'pieces small enough to finish, grounded in what is already in their record, '
    + 'and everything it makes is a PROPOSAL they confirm. Nothing goes live here. '
    + 'This takes a few seconds, so say what you are doing before calling it.',
  schema: z.object({
    intent: z.string().min(3).max(500).describe(
      'What they want to change, in their own words. Not your rephrasing of it: '
      + 'it is stored and shown back to them as the reason these goals exist.'),
  }),
  run: async (input, ctx) => {
    const drafted = await draft(ctx.userId, input.intent);
    if (!drafted.goals.length) {
      return { ok: false, result: { error: drafted.failure ?? 'could not break that down just now' } };
    }
    const before = await prisma.goal.findMany({
      where: { userId: ctx.userId }, select: { id: true },
    });
    const n = await save(ctx.userId, input.intent, ctx.exchangeId, drafted.goals);
    const after = await prisma.goal.findMany({
      where: { userId: ctx.userId }, select: { id: true },
    });
    const seen = new Set(before.map((g) => g.id));
    const created = after.map((g) => g.id).filter((id) => !seen.has(id));

    return {
      ok: true,
      result: { created: n, ids: created },
      say: `added ${n} ${n === 1 ? 'goal' : 'goals'} to look at: "${input.intent}"`,
    };
  },
  undo: async (call, ctx) => {
    // Abandoned, never deleted, the same rule the rest of the goal code holds.
    const ids = (call.result as { ids?: string[] })?.ids ?? [];
    if (ids.length) {
      await prisma.goal.updateMany({
        where: { id: { in: ids }, userId: ctx.userId }, data: { status: 'abandoned' },
      });
    }
  },
});

/** The table. Absent means unreachable. */
export const OPS: Op[] = [
  readRecord, readPlan, readGoals, readRoots,
  logIt, markDone, proposeGoal, setGoal, dropGoal,
];

export const BY_NAME = new Map(OPS.map((o) => [o.name, o]));

/** Sanity, checked at import rather than in a test nobody runs: every value the
 *  log tool accepts for `said` is one extraction recognises. Two lists of the
 *  same six words drift. */
const declared = (logSchema.shape.said as unknown as { options: string[] }).options;
if (declared.length !== SAID.length || declared.some((v) => !(SAID as readonly string[]).includes(v))) {
  throw new Error('log tool `said` values have drifted from extract.ts SAID');
}
