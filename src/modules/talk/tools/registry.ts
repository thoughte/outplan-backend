import { z } from 'zod';

/** What the chat is allowed to do, and what it can never do.
 *
 *  ONE TABLE. The list sent to the model and the list the dispatcher can run
 *  are the same object, so an operation that is not here cannot be offered and
 *  cannot be dispatched. It is absent or it is reachable; there is no third
 *  state and no prompt rule standing in for one.
 *
 *  THE TIERS
 *
 *  `free`      reading his own record. Nothing to confirm, nothing to undo.
 *  `undoable`  a write. Done at once, named in the reply, reversible in one tap.
 *
 *  There is deliberately no `never` tier. A thing the model must not do is not
 *  listed as forbidden, it is simply absent, and the write is refused again
 *  underneath. Two locks, because a list is something a person can add to by
 *  accident and a deny-list is something they can forget to update.
 *
 *  WHAT IS ABSENT, AND WHY
 *
 *  Measurements, reports, symptoms, interventions and genetic markers have no
 *  write tool. Those are what a document said. A model editing them is editing
 *  history, and they reach the database through `digest.ts` or not at all.
 *
 *  Nothing that touches another person: care links, invites, neighbours.
 *  Consent is given by a person, never arranged on their behalf.
 *
 *  Nothing deletes. Abandon exists; delete does not.
 */

export type Tier = 'free' | 'undoable';

export interface Ctx {
  userId: string;
  /** His local day, already resolved from his own timezone. */
  localDay: string;
  /** The message this came out of, so every write traces back to a sentence. */
  exchangeId: string;
}

/** What comes back from an operation.
 *
 *  `say` is the line shown under the reply. It exists so a write can never be
 *  silent: an operation that cannot describe itself in a sentence he would
 *  recognise has no business being a tool. */
export interface Outcome {
  ok: boolean;
  /** Handed back to the model so it can write its reply knowing what happened. */
  result: unknown;
  /** Shown to him, verbatim. Empty for reads. */
  say?: string;
}

interface Base<S extends z.ZodTypeAny> {
  name: string;
  /** What it is for, in the words the model reads while deciding. */
  description: string;
  /** THE SAME schema the HTTP controller parses with, wherever one exists. One
   *  schema, two callers, or the chat is a door with weaker locks than the
   *  screen. */
  schema: S;
  run: (input: z.infer<S>, ctx: Ctx) => Promise<Outcome>;
}

export type Op<S extends z.ZodTypeAny = z.ZodTypeAny> =
  | (Base<S> & { tier: 'free' })
  /** An `undoable` op with no `undo` does not compile. The guarantee belongs to
   *  the type checker rather than to whoever reviews the next one. */
  | (Base<S> & {
      tier: 'undoable';
      undo: (call: { input: unknown; result: unknown }, ctx: Ctx) => Promise<void>;
    });

export function defineOp<S extends z.ZodTypeAny>(op: Op<S>): Op {
  return op as unknown as Op;
}

/** The JSON Schema the model is sent, derived from the Zod schema so the two
 *  cannot drift. Deliberately narrow: objects of scalars and string arrays,
 *  which is everything these operations take. */
export function toolSchema(op: Op): Record<string, unknown> {
  const shape = (op.schema as unknown as z.ZodObject<z.ZodRawShape>).shape ?? {};
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, field] of Object.entries(shape)) {
    const f = field as z.ZodTypeAny;
    const optional = f instanceof z.ZodOptional;
    const inner = optional ? (f as z.ZodOptional<z.ZodTypeAny>).unwrap() : f;
    const description = (f as { description?: string }).description
      ?? (inner as { description?: string }).description;

    let type = 'string';
    let extra: Record<string, unknown> = {};
    if (inner instanceof z.ZodNumber) type = 'number';
    else if (inner instanceof z.ZodBoolean) type = 'boolean';
    else if (inner instanceof z.ZodArray) { type = 'array'; extra = { items: { type: 'string' } }; }
    else if (inner instanceof z.ZodEnum) extra = { enum: (inner as unknown as { options: string[] }).options };

    properties[key] = { type, ...extra, ...(description ? { description } : {}) };
    if (!optional) required.push(key);
  }

  return {
    name: op.name,
    description: op.description,
    input_schema: { type: 'object', properties, required },
  };
}
