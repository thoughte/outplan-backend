# The chat as the way in

Status: planning, 19 Sep 2026.

In the app: The chat can read their record and do things for them: log what they did, tick the day plan, confirm or drop a goal, take a file. Anything it writes shows in the reply and can be undone.

## His words

> 1. we should be able to attach images or files in chat.
> 2. chat should know about the entire platform (how to use which feature, not
>    the code), so that if a person asks something, it can answer precisely.
> 3. chat have access to do any operation, read, write, modify anything a user
>    says. a user can use chat to upload a medical record, set or remove a goal,
>    mark that yes i have taken medicine or anything else.

Three asks, and they are one feature. Doing things needs knowing what exists;
both are half-blind without being able to see a file.

## The working model

**The chat stops being a place to talk about the app and becomes the app.**
Today it can only say words. Every other surface, the day plan, the goals, the
records, the farm, is something he has to go and find. Under this, the sentence
IS the operation: "took my morning meds" ticks them, "here's my blood test" reads
it, "drop the nicotine goal" drops it.

Thirty-nine endpoints already exist and are already scoped to one person. Nothing
new has to be invented for the chat to drive; it needs a way to call them, a
description of what each is for, and rules about which ones it may reach.

## Does it go through the same API the frontend uses?

His question, and the answer is **the same service layer and the same validation,
not the same HTTP.**

Checked rather than assumed. The controllers are thin: they parse the body with a
Zod schema, check `req.user`, and delegate. Across goal, plan and talk there is
not one business rule in a controller and not one database call. The only
exception is `file/controller.ts`, which reads the account holder's name for the
identity check, and that has to be carried over.

Ownership lives one layer down, in the services, and it is re-checked on every
mutation rather than assumed from the caller. `goalService.confirm` opens with
`findFirst({ where: { id, userId } })`. `careService.share` and `careService.pause`
both open with `findFirst({ where: { id: linkId, ownerId } })`. A service called
directly cannot reach another person's row, because the row is fetched by owner
before it is touched.

So self-HTTP would buy nothing and cost real things: a second credential to hold,
a network hop that can fail on its own, and a call that cannot join the
transaction around it.

**What MUST be shared is the validation.** The controllers parse with Zod. A tool
that took the model's arguments straight into a service would have weaker
checking than the same action from the frontend, which is exactly the kind of
second door with weaker locks this plan refuses elsewhere. So each tool names the
SAME schema object the controller uses. One schema, two callers.

**The risk this creates, and the guard.** If anybody later puts a rule in a
controller, the chat silently skips it. The convention is that controllers stay
thin, and `npm run tools:check` asserts it: every mutating route's service call
either has a tool entry or is explicitly listed as out of reach, and any
controller that grows a database call or a conditional fails the check. The same
shape as `docs:check`, and for the same reason: two things that must agree will
not, unless something says so out loud.

## 1. Files and images

**They go through the pipeline that already exists.** A photo of a report
uploaded in chat is the same object as one uploaded on the Records screen:
`StoredFile`, then `digest.ts`. That matters more than convenience, because the
record rules live in that pipeline and are not negotiable:

- the name on the document must match his, and one name part is not a match
- a report with no verified collection date is NOT ingested
- a duplicate is recognised and not read twice

A file arriving through conversation must not be a second door with weaker
locks. It is the same door.

**Images go to the model as images.** A photo of a prescription is not text and
should not be OCR'd into a guess before anyone looks at it. The reply tool call
gets the image alongside the message.

**What it does NOT do:** read numbers out of a photo into the record directly.
Measurements come from digest, which is deterministic and traceable to a file. A
model reading "ApoB 121" off a blurry photo and writing it as a measurement is
the hallucinated-record failure with a camera attached.

## 2. Knowing the platform

A written description of what the app can do, in the same voice as the rest of
the prompt, appended to the system message. Not the code, not the endpoints:
what each surface is FOR, when to send someone there, and what it will not do.

It has to be generated from something that cannot drift. The candidate is the
feature plans in `docs/features/`, which already say what each thing is for and
why, in plain words. A hand-written second description of the product is a
document that will be wrong within a week.

## 3. Doing things

**Tools, not a second prompt.** The model already answers by calling `reply`.
Operations are more tools beside it, and `tool_choice` stops being forced.

**Three tiers, and the tier decides the ceremony.**

**Free.** Reading anything of his, and logging what he says he did. Already how
it works: extraction writes observations and the day plan ticks from them. No
change, and no confirmation, because this is him telling the app a fact about
his own day.

**Undoable.** Confirming a goal, dropping a goal, uploading a file, marking a
plan item done. Done immediately, said plainly in the reply, and removable in one
tap. This is the pattern already set by the record line: undo beats approval,
because approval taxes every correct action to catch the rare wrong one.

**Never.** Things a model must not do on his behalf at all:
- change or delete a measurement, symptom or medicine that came off a document.
  Those are what a report said. A model editing them is editing history.
- start, stop or change a prescribed medicine. Already in the prompt and it stays.
- anything for another person: care circle links, invites, neighbours. Consent
  is given by a person, not arranged by a model.
- delete anything. Abandon exists; delete does not.

**The rule that governs all three:** the model may write what HE said, and may
never write what it concluded. "I took my magnesium" is his. "Your uric acid
looks high, I'll add a goal for it" is not, and that is a suggestion he confirms.

## What this puts at risk, stated plainly

Every write the chat can do is a write a misunderstanding can do. The record
already has one scar from this: a brief that read "no end date" as "currently
taking" and told him he was on two statins. That was a read. This is writes.

So the mitigations are structural, not tonal:
- the Never tier is enforced in code, not asked for in the prompt
- every Undoable action names itself in the reply and is reversible
- nothing bypasses `digest.ts` for anything that came off a document
- the model gets no endpoint that can act on another person

## Open, and settled before building

Whether `tool_choice` can be relaxed without the reply degrading. The forced
call is what fixed "I'll use the reply tool" arriving as an entire message. This
needs checking rather than assuming.

## How it gets checked

Each tier separately, against his real account, with the Never tier tested by
asking the chat to do those things and confirming it cannot.
