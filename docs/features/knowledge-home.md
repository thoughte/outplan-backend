# Knowledge home: where what the app knows about a person lives

Status: **planned, not built.** Designed and reviewed 21 Sep 2026 from a full
read of the owner's analysis. Awaiting his agreement on the decisions below.
Nothing here is code yet; the Prisma text for the tables lives with the design
outside this repository and enters `schema.prisma` in build phase 1.

## What he asked for

> "no md files generated ever belongs to a user. You should have digested it
> internally, stored systematically in database. or if required, files. But why
> the hell you hand off md files to user which you generated yourself to keep
> the conversation going? are you shutting down the platform?"

> "mine was the special case where we migrated. no other user will ever be
> migrated."

> "this data is not meant to be shown to the user. it belongs to the user but
> meant to be used technically by app only to serve customer. not to be shown to
> customer."

> "check my all md files, bit by bit. and think, for a new user, where does such
> data stay on outplan... DB? md files generated on the go? which table? what
> structure?"

> "we need to see if we even have a provision to store such data. if not, we
> need to provision, structure, optimize. note that each bit is critically
> important. it is not just a matter of numbers, it is much more deep."

## What it grounds in

**What the app holds today.** Numbers, and almost nothing else. There is a table
for a report, a measurement, a genetic marker, a symptom (name, status, and a
free-text `detail`), an intervention (name, dose, schedule, free-text `reason`
and `notes`), an observation from chat, a goal and its tree, a day plan item, a
discovery, an exchange, a correction, a stored file. The brief the chat is given
on every turn (`src/modules/record/brief.ts`) is the latest value per marker,
the medicines split three ways, symptom names with status, and the last five
days. It says nothing about why a marker matters, what causes what, what must
happen before what, what a value must not be trusted for, what would change a
conclusion, or what to do the day a number crosses a line.

**What was written once, outside the app.** The owner's analysis exists as
markdown and JSON from Claude Code sessions: three hundred adversarially
verified findings across thirteen lenses, each with evidence rows pointing at
dated measurements, a mechanism, links to symptoms, lifestyle and genetics, a
confidence, what would confirm it, and actions with timing; ten refuted findings
kept with their reasons; a root-cause map; sequencing rules; a retest schedule
whose targets carry decision rules; red flags in tiers; a letter for a
clinician; and an appendix of the plan's own corrections. Nine of those
documents were stored on his account as files of kind `plan` and listed on the
Records screen beside his blood tests. Nothing in the backend ever read them:
zero rows came out of them. They are now marked `internal` and hidden
(`20260920130000_stored_file_internal`); they remain as provenance for a
one-time import and for nothing else.

**What the read found.** Thirty-one readers catalogued every kind of knowledge
in those documents: 1,186 reader-level kinds, merged to 253, of which 212 are
knowledge about a person and the rest are process artefacts. Fitted against the
live schema: **one** has an exact home today (the stored file itself), 90 could
be forced into a text column and lose their structure, and 121 have no home at
all. Consolidated, they need 25 tables: 9 live tables extended, 16 new, two of
them shipped libraries with no person id. Two independent reviews then judged
the structure sound and listed the column-level fixes adopted below.

**What already applies, inherited without exception.** A person's record is the
input to the product, never its fixture or documentation. Values and units only,
never reference ranges. A suggestion is never done until the person says so. A
theory that was ruled out is kept and watched, not deleted. Every number points
at the page it was printed on. A source is digested once. And his rule of 20 Sep
2026: a generated document is not a record.

## The working model

**The record grows a second layer.** Today it holds values. It will also hold
what the app asserts about the person: a finding, a hypothesis, a cause, a rule
that blocks something, a target with a bound, a red flag waiting, a gap in what
is known, a judgement that a value cannot be used for a purpose, a change to any
of those. Every such row carries the same spine: where it came from, typed and
followable to the exact message or page; who asserted it; when it was true of
the person, with a precision so a vague statement never becomes an exact date;
a confidence with its basis stated; a verification bound to the version judged,
so an edit reads as unverified again; a confirmation state that **defaults to
not confirmed** and advances only on the person's own statement or an arriving
objective result; a supersession chain, append-only; a retired state with a
machine-evaluable reopen condition, so a ruled-out theory keeps being watched
without being nagged about; an expiry that fires as an event; an audience and a
consent scope that default to internal and none; a plain-words expansion. Two
library tables carry none of the person-specific columns: they are identical for
everyone.

**Rules are rows that code evaluates, not sentences it reads.** Four tables
hold evaluable things and one predicate form serves all of them: `rules`
(a predicate and what it blocks), `decision_rules` (an input, a statistic, a
comparator, a bound, a consequence), `watches` (an armed thing with an anchor
and a next-due), `targets` (what we aim at, measure change from, compare
against). The predicate selects rows by canonical key **and by role** (which
occasion in a series, which method family, which event kind), states how much
of a window must be covered before it may answer, anchors clocks to a selector
that resolves to the latest matching row so a repeated exposure restarts the
clock, and says what to do when an input is absent, defaulting to refuse. One
evaluator reads it. One safety gate, called by every writer and every reply
path before anything is emitted, loads the armed rules over the subject,
applies precedence (safety rule, then the person about their own body, then
clinician, then engine, then vendor) and returns allow, allow with required
wording, or block with the reason. Every run is an `evaluations` row: ran,
inert, vacuous or undercovered, never silently passed.

**For a new person there are two inputs: what they type and what they upload.**
Nothing requires a clinician, a device or a test to exist. The digest fills the
values, the conditions they were collected under, and the gaps it noticed. The
extractor fills observations in their own words, and the facts, symptoms and
interventions those words carry. A synthesis pass writes claims with evidence
edges after every digest and nightly. A binder instantiates rules and watches
from shipped templates the moment their subject exists. A needs engine turns
everything a rule, target or claim wanted and did not find into open needs
ordered by what they block, and asks at most one thing per turn. A plan builder
turns claims, targets and rules into standing actions, charged against a
capacity budget. Every row lands in a state, and the state is not confirmed.

**What the person sees changes in five places.** The brief becomes a query with
a line budget over rows whose audience includes chat: open claims by rank,
armed watches by tier, rules the next reply could breach, the top needs by what
they block, and values with their trust annotation inline. The chat gains reads
(claims, needs, rules, watches) and writes (correct, confirm, decline, release),
every write through the gate. The day plan reads plan actions and refuses to
place an item whose gate has not lifted. The goal tree keeps intent in `goals`
and moves the bound to `targets`, joined by an edge. The Records screen keeps
listing what the person uploaded and gains a view over the record itself: any
row, its provenance walked back to the page or the message, its confidence and
basis, what it waits on, what would change it. The doctor summary is generated
on demand from released rows and recorded only as what was shown; never a file.

**The owner's documents are imported once**, each row naming the internal file
it came from, and the run is idempotent: a second run duplicates nothing and
supersedes only what differed. No other account is ever migrated.

### The tables

| Group | Tables |
|---|---|
| Live, extended (9) | users, source_documents (stored_files), measurements, genetic_markers, observations, interventions, symptoms, plan_items, variable_catalog |
| Assertions (4) | claims, edges, revisions, evaluations |
| Evaluable (4) | rules, decision_rules, watches, targets |
| Plan (3) | plan_actions, plan_builds, person_facts |
| Trust and gaps (4) | trust_annotations, open_needs, collection_events, care_roles |
| Libraries, no person id (2) | knowledge_library, variable_catalog |
| Surfaces (1) | renderings |

### The engines

Seven exist: digest, extractor, goal decomposer, day plan, discovery finder
(folds into synthesis), compaction, chat tools. Nine are new, each one job:
value normaliser, trust pass, synthesis pass, binder, evaluator (with the gate),
needs engine, plan builder, renderer, propagator. Plus the one-time import.

## Decisions, with what was rejected

| # | Decision | Rejected, and why |
|---|---|---|
| 1 | One `open_needs` queue; a gap with nobody to ask is a first-class row (`addressee` nullable, route may be `none_known`) | two tables: every consumer joins both anyway to order by consequence |
| 2 | Three evaluable tables plus targets, split by comparator and armed state, never by department | one rules table with a class column: the evaluator becomes a switch over nullable columns, where a rule silently passes |
| 3 | A closed enum of body systems shipped now; additions are migrations; names describe the body, never a product feature | free text: an invented department routes nowhere and coverage becomes uncountable |
| 4 | The free text already in `symptoms.detail` and `interventions.reason` is frozen, left readable, with one repair task per row | migrating it in the import: claims with engine provenance for reasoning a person wrote |
| 5 | The library is a seeded table with `libraryVersion` pinned on every instantiated rule | templates in code: a rule cannot cite the version it was bound under |
| 6 | Every row defaults to consent scope none and audience internal; release is an explicit act on named rows; genetic, sexual, mood and psychosocial rows carry `restricted` and are never in a bulk release | a sensitive list with the rest open: wrong the first time something private arrives inside an ordinary message |
| 7 | Three retention classes: deletable (their words, uploads, renderings), redactable (derived rows lose content, keep the shell), structural-only (evaluations, revisions, the write log) | delete everything on request: removes the evidence a safety rule fired and the person was told |
| 8 | The audit chain head is written daily to infrastructure he controls, mirrored to a public log; a failed write is reported when it happens | inside our own database: a head the operator can rewrite proves nothing |
| 9 | Goals keep intent and the tree; targets hold the bound, baseline and anchor; a `serves` edge joins them | merging: a goal rewritten every time a measure changes; one goal has several measures |
| 10 | A day's verdict is an `evaluations` row (ran, inert, vacuous, undercovered) | a tri-state on `plan_items`: a day with no offer would have no verdict |
| 11 | Every reference column is a typed pair (kind, id) with integrity, provenance included | string or JSON refs: the evaluator cannot resolve them, and the one column carrying provenance was the only one without integrity |
| 12 | One explicit predicate form: operator, a `left` with a where-clause over a closed set of qualifiers, a coverage spec, an anchor selector resolved at evaluation time, a comparator, a `right`, and `failsOnAbsentInput` on every evaluable table; rules carry a re-arm predicate, watches an arm predicate | a thin predicate with free-string offsets, recurrences and lags: nothing could be computed from it, and absent-input refusal existed only on the table least likely to need it |
| 13 | Durations, offsets and lags are typed intervals (value, unit) everywhere, including the library | strings: a retest schedule resting on unparseable text |
| 14 | The spine is trimmed by table class: no confirmation or confidence on rules, evaluations, renderings, plan builds or trust annotations; no supersession on write-once tables; no stale flag on observations; every non-null spine column has a default so a populated live table migrates | one spine on everything: a ban graded by evidence class, a rendering waiting for confirmation, and a phase 1 migration that fails on live rows |
| 15 | `trueOfPersonAt` carries a precision sibling on every table | exact instants for vague statements, the fabrication the design exists to prevent |
| 16 | A composition library (product to ingredients with strength, ingredient to class); interventions carry resolved components; ceilings and class-level bans bind to ingredients and classes | bans on named agents only: a class-level prohibition could not be decided from what was actually taken |
| 17 | `mustNotJustify` on measurements and claims: a list of consequences a row may never license, read by the binder and the gate as a veto | prose caveats: an unacted marker becomes a restriction the moment an engine reads it |
| 18 | Care roles (the people a plan needs, crisis line included) are a standing table that never closes | rows in open_needs: a filled role is a fact, not a need, and a crisis contact has no closure |
| 19 | The carried safety asset lives in plan actions with its fill-in fields and in-place confirmation; renderings hold only the rendered copy | in renderings: the person's own entries destroyed on the next regeneration |
| 20 | Confounders live in trust annotations, with effect, magnitude band and reading rule | in rules: forced enforcement and tier values on something that blocks nothing |
| 21 | Measurements allow a derived or instrument row with no report and no collection date; observations allow a life event with no local day but a precision; person facts hold text, time and JSON values with an origin class; the vocabulary is keyed by variable, locale and word class; log fields, calibration bridges and authority labels are targets with kind-conditional nullability guarded in code | forcing each into the live shape: fabricated dates, unwritable rows, or one locale's token overwriting another's |
| 22 | Audiences `laboratory` and `dispensary` with a matching narrow consent scope, releasing only the rows a requisition needs; deliveries typed against the same enum | clinician-only release: protected wording never reaches the counter where a test is refused or substituted |
| 23 | Trust annotations gain `joint_inconsistency` over a set with a per-member role, and a bridge reference so a cross-method comparison can be admitted when an offset row covers both | binary contradiction edges only: a panel whose values jointly violate an identity has no home |

## The constraint that shapes it

Every row carries a typed, followable pointer to the exact message or page it
came from. This record is the person's input to the product and never the
product's documentation of itself, and a row that cannot say where it came from
is not knowledge about them but a claim the app made about them.

## Explicitly not in scope

- Clinician accounts, the paid review and anything a clinician writes directly.
  `clinician` is reserved as an author and a consent scope; no surface is built.
- Household and family sharing. No design here lets one record read another.
- Device, wearable and pharmacy feeds. Only chat and uploads.
- Any statistic across people, any aggregate use of a record, and any reuse of
  a person's rows as an example, a fixture or seed data.
- Translation. Locale and script are stored; nothing translates.
- Ranking by a learned model. Ordering is derived from stored severity,
  confidence, what a row blocks and the person's own stated goal.
- A public API over the record.
- The erasure flow. Retention classes are designed; deletion is not built here.
- Populating the shipped library beyond what the first build phases need.

## How it will be checked

Each phase ships alone, against his real record, and is looked at, not tested.
The order below is the reviewed one: the two tables everything else writes to
early, `open_needs` and `evaluations`, ship in the first phases; the release act
has a phase; the matcher sits in the write path from the phase the extractor is
rewritten in, not two phases later.

| Phase | Ships | What proves it |
|---|---|---|
| 1 | The spine with defaults and a backfill on the nine live tables; the write log; typed refs and a resolver | Migrate a copy of the live database; every existing writer still writes. Follow one measurement's provenance through the resolver to the file and page. Every write appears in the log with a version |
| 2 | collection_events, trust_annotations, open_needs, evaluations; value normaliser, trust pass | Chart one marker measured by two methods and see the break and the named exclusions instead of a smooth line; every refused comparison is an evaluation row |
| 3 | person_facts, new columns on observations, symptoms, interventions; extractor rewrite with the matcher in its path; care_roles | Type three things in one message and get three rows, each with verbatim text, tense and a date precision rather than an invented date |
| 4 | claims, edges, revisions; synthesis pass; propagator; the Records row view; correct as a chat write | Correct a value in chat and watch the claims citing it go stale, recompute, and keep the superseded version visible with its revision |
| 5 | knowledge_library, rules, decision_rules; binder; evaluator with the gate on every reply and write path | Ask for something a shipped ban covers and see the block with its reason and its evaluation row; remove an input and see it refuse rather than pass |
| 6 | watches; arming inside the write path | Mention, mid-message, what an armed flag watches for and see it fire before the reply is composed; a flag armed by a course disarms when the course ends |
| 7 | targets; the goal tree reads targets through the edge | Every target names its anchor and its bound; a bound that depends on another marker's band reports which condition selected it |
| 8 | plan_actions, plan_builds, plan_items changes; plan builder; day plan rewrite | Every item on a day names its action and the claim behind it; a gated item is absent with a build record saying why |
| 9 | renderings, release, consent enforcement; renderer; the doctor summary on demand | Generate a summary: it holds only released rows, no file is created, and the rendering lists exactly which row ids left |
| 10 | The owner's import | Run it twice: nothing duplicated, only what differed superseded, the frozen free text still readable with its repair tasks open |

Cost of the design so far, for the record: about 2.5M tokens across five phases
on 21 Sep 2026, after a first attempt of 5.0M that produced no design.
