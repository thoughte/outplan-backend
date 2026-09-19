import { BY_NAME } from './ops';
import type { Ctx, Outcome } from './registry';

/** Run one operation the model asked for.
 *
 *  THIS IS THE GATE. An operation absent from the registry cannot be run here,
 *  whatever the model calls it, and the same registry is what was offered in
 *  the first place, so there is nothing to keep in step.
 *
 *  Input is validated with the operation's own Zod schema, which is the same
 *  schema the HTTP controller parses with. A tool that took the model's
 *  arguments straight through would have weaker checking than the same action
 *  from the screen, and that is the one thing this design refuses everywhere.
 *
 *  It never throws. A failed operation comes back as a result the model can
 *  read and mention, because the alternative is a conversation that dies
 *  because somebody's goal id was stale.
 */
export async function runOp(
  ask: { id: string; name: string; input: unknown },
  ctx: Ctx,
): Promise<Outcome> {
  const op = BY_NAME.get(ask.name);
  if (!op) {
    console.warn(`[tools] refused unknown operation "${ask.name}"`);
    return { ok: false, result: { error: 'no such operation' } };
  }

  const parsed = op.schema.safeParse(ask.input ?? {});
  if (!parsed.success) {
    const why = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    console.warn(`[tools] ${op.name} rejected: ${why}`);
    return { ok: false, result: { error: `those arguments are not valid: ${why}` } };
  }

  try {
    const out = await op.run(parsed.data, ctx);
    if (out.ok && op.tier === 'undoable') {
      console.log(`[tools] ${op.name}: ${out.say ?? '(no description)'}`);
    }
    return out;
  } catch (e) {
    // A service throwing is usually ownership or a stale id, both of which the
    // model should hear about rather than have hidden.
    console.error(`[tools] ${op.name} threw:`, (e as Error).message);
    return { ok: false, result: { error: (e as Error).message.slice(0, 200) } };
  }
}
