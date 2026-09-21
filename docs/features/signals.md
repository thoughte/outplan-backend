# Signals: the ledger of what the app could not do

Status: **planned, not built.** Plan written 21 Sep 2026; awaiting his agreement.
Builds before knowledge home phase 1, because its code-side capture starts
producing the evidence knowledge home phase 3 needs and costs a day.

## What he asked for

> "before we build phase 1, I want a self improving system if you suggest.
> suggest me how, and if that should be done."

> "it is not just for system prompt improvement..... maybe user is trying to do
> something and our system cant do it? a feature suggestion? a bug a person is
> telling to the chat? something we missed to store in db or something that has
> no home in db?"

## What it grounds in

**The app already refuses, drops and undoes things, and keeps none of it.**

- The extractor throws away any item whose `kind` or `said` it cannot classify
  (`src/modules/record/extract.ts`, the filter around line 186). That is the
  right rule for the record: a guess must not become a fact. But the throw-away
  is the one moment the app knows a person said something it has no place for,
  and it is logged to nowhere.
- An operation the model asks for with an unknown name or invalid arguments is
  refused (`src/modules/talk/tools/run.ts`, lines 25 to 46) with a console line.
  A refusal is the model trying to do something the app cannot, and it vanishes
  at the next deploy.
- Unrecord (`DELETE /talk/:id/record`) and undo (`DELETE /talk/:id/did/:opId`)
  are the person rejecting what the app did. They change the record correctly
  and record nothing about why.
- A safety flag (`promptVersion: safety:<reason>`) and a fallback reply
  (`unavailable:<status>:<type>`) are stamped on the exchange since this
  morning. They are the only failures the app keeps today.
- `POST /talk/:id/correct` and the `corrections` table exist, and the screen
  offers them. In 108 messages since 18 Sep, zero were written. He corrects the
  app the way anyone does, in the next message ("what do you mean by meds both
  days?"), and that goes into the history like any other sentence.
- The platform notes tell the model, for a how-to question nothing covers, to
  "say so plainly rather than inventing a feature". The "no" is spoken to the
  person and lost to the builders.

**What exists elsewhere in this repo that this reuses.** Prompt versions with a
human publish step (`prompt:publish`); the ask-rate measured by hand per
version (v4 50%, v5 63%, v6 32% so far); `didThings` on an exchange, shown
under the reply with an undo, as the pattern for a visible write; the rule that
a person's record is the input and never the documentation.

## The working model

**One ledger, many writers.** A `signals` table, one row per thing the app
could not do, with a closed `kind`, the person's words where there were any,
the app's one-line summary, the exchange it came from, a status, and what
eventually fixed it. Three things write to it:

1. **Code, for free.** The extractor's drop becomes a `no_home` signal carrying
   the dropped words. An operation refusal becomes `refused_operation` with
   the operation name and the validation reason. Unrecord and undo become
   `rejected_action` pointing at what was rejected. A fallback reply becomes
   `infrastructure`. None of these cost a model call, and together they are
   most of the volume.
2. **The model, through one tool.** `note` is a free-tier tool beside `reply`
   and the operations. The model calls it when it says "I cannot do that"
   (`capability_gap`), when the person suggests something (`suggestion`),
   reports the app misbehaving (`bug`), corrects a reply (`correction`), says
   "I told you yesterday" and the record disagrees (`missed_extraction`), or
   says something worth keeping that the model can tell has no home
   (`no_home`). The note is never silent: a line "noted for the builders: ..."
   sits under the reply with an undo, the same pattern as every other thing
   the assistant does.
3. **The person, explicitly.** "Report a problem" on the screen is the same
   tool with the same row.

**Every kind has a destination.** A capability gap or a suggestion is a
candidate for a feature plan. A bug is a fix. A correction is a prompt diff, or
a per-person rule once knowledge home phase 3 exists. A no-home or missed
extraction is the running input to the knowledge-home taxonomy: it is how the
212 kinds get checked against real conversations, not only against one person's
documents. A rejected action is a question about what the app assumed.

**The report is the loop.** `npm run learn` prints, per week and per prompt
version: signals by kind, clustered by summary, each cluster with the proposed
diff or plan slug; and the rates that say whether a version is better: asks,
fallbacks, corrections, undos, per hundred messages. Nothing publishes itself.
A human writes the plan, versions the prompt, or migrates the schema, then
closes the signal with what fixed it.

**The loop closes with the person.** A closed signal that was theirs is
mentioned once, the next time they talk: "the export you asked for on the 21st
is there now." That is both the reward for having said it and the only real
verification that the fix matched the ask.

## Decisions, with what was rejected

| # | Decision | Rejected, and why |
|---|---|---|
| 1 | One `signals` table with a closed `kind` enum | a table per kind: nine tables for one shape (who, what, from which exchange, status, fixed by) |
| 2 | Three writers: code, the model's `note` tool, the person | model only: misses the silent drops, which cost nothing to catch; code only: cannot tell a suggestion from a complaint |
| 3 | The note is visible under the reply, with an undo | a silent note: a write the person cannot see is a write they cannot object to, the same rule as every operation |
| 4 | A signal carries words and a summary, never a value; it is about the product, not the body | letting signals hold health data: a second record with weaker rules |
| 5 | The extractor's drop keeps the dropped words in the signal | dropping silently as today: the only moment the app knows a sentence had no home is the moment it forgets it |
| 6 | Closure names what fixed it (commit, prompt version, plan slug) and the person hears it once | silent closure: the person never learns the ask was heard, and nobody verifies the fix matched |
| 7 | The builders' report shows counts and shapes; words appear only from accounts that released them for this purpose, his own by an explicit flag | words from everyone: a signal is the person's row, under the same consent rule as the rest |
| 8 | Prompt changes stay human-published, with the rates recorded on the version at publish time | auto-publish when a metric improves: a health app must not change its own behaviour without a human reading the diff |
| 9 | A missed extraction is noted, never re-extracted automatically | re-reading an old message on the person's say-so: confirmed, not assumed, applies to the app's own mistakes too |
| 10 | Corrections captured by the model from pushback in the next message, written to the existing `corrections` table as well as the ledger | relying on the correction button: 0 uses in 108 messages says how people actually correct things |

## The constraint that shapes it

The ledger is about the product's failures and never a second record of the
person. A signal points at the exchange, carries words and a one-line summary,
and carries no value; the builders' report carries no words the person has not
released. Get this wrong and the mechanism built to catch gaps becomes the
gap.

## Explicitly not in scope

- Automatic publishing of any prompt, rule or schema change.
- Automatic re-extraction of past messages.
- A public roadmap, voting, or any surface where one person's signal is shown
  to another.
- Analytics across people beyond counts by kind.
- Notifications outside the chat.
- The per-person communication rules learned from corrections: knowledge home
  phase 3, which this feeds.

## How it will be checked

Against his real account, looked at, not tested.

| Step | Ships | What proves it |
|---|---|---|
| A | the table; code writers (drop, refusal, rejected action, infrastructure); `npm run learn` skeleton | say something the extractor cannot classify and see the `no_home` row with the words; ask, through `npm run try`, for an operation with bad arguments and see the refusal row; undo something and see the rejected-action row |
| B | the `note` tool; the line under the reply with undo; "report a problem" on the screen | ask the chat for something the platform notes do not list and see "noted for the builders" and the row; push back on a reply and see a `correction` row and a `corrections` row |
| C | closure and the mention | close one signal with a commit, send a message, see it mentioned once and never again |
| D | rates recorded per prompt version at publish | publish v7 and see v6's asks, fallbacks, corrections and undos per hundred messages frozen beside it |
