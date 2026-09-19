# One goal, counted once

Status: **built and applied to his record**, 19 Sep 2026.

## His words

> fix the two duplicate goals. make a system around it

## What actually happened

Four intents were decomposed against his record, each as an independent call.
Two of them produced the same goals:

| Goal | Under | measure | direction | baseline | target |
|---|---|---|---|---|---|
| Bring uric acid down | Stop alcohol | `uric_acid` | down | 7.6 | none |
| Bring uric acid down | The visceral fat picture (Lose inches) | `uric_acid` | down | 7.6 | 6 |
| Bring crp down | Bring down the inflammation... (Stop alcohol) | `crp` | down | 12.35 | none |
| Bring crp down | The inflammation... (Lose inches) | `crp` | down | 12.35 | 5 |

Same variable, same direction, same baseline, because both reads came off the
same record. These are not two goals that resemble each other. They are one
goal, written down twice.

It is not only the leaves. The container above them was re-derived too: "Bring
down the inflammation sitting underneath all of it" and "The inflammation
sitting underneath all of it" are the same idea in two branches. Whole subtrees
duplicate, not just rows.

## Why this matters more than it looks

**It breaks the one number he asked for.** His reason for wanting small goals was
said out loud: *"we can proudly show you achieved 6 goals this month and 28 goals
this year"*. If getting uric acid to 6 counts twice, that number is not a count
of anything, and `goals-view.md` already commits to the opposite: *"Counting
finished goals can be checked by counting."* A figure nobody can verify is the
same failure as a wrong one, discovered later.

Three smaller harms follow. He confirms the same thing twice. A branch's "0 of 8"
counts a goal that another branch also counts. And when the number moves, two
rows celebrate.

## The decision

**One goal, one home.** Two goals are the SAME when they watch the same `measure`
in the same `direction`. That is the honest key: titles are the model's wording
and drift between calls, while `measure` is a variable name out of his own
record.

Rejected: letting a shared goal appear under both parents. It is truer to the
world, uric acid really does serve both the alcohol branch and the waist branch,
and it turns the tree into a graph. Every count would then have to deduplicate by
id, the cascade confirm would have to avoid confirming a node twice by two
routes, and the screen would show the same row in two places with no way to tell
it was one thing. The connection is worth keeping; a second row is not the way to
keep it.

So: the first one wins its place, and the later draft contributes what it knows
rather than a second row.

**Merging, not discarding.** The later copy is not thrown away whole. Where the
existing goal has no target and the new one does, the target is filled in: 6 for
uric acid, 5 for CRP. That is strictly more than was there and nothing is lost.
The reverse never happens, an existing target is never overwritten by a later
call.

**`inferred` cannot be argued away.** CRP arrived once marked inferred and once
not. Merging keeps the CAUTIOUS value: if either call thought it was reasoned to
rather than read off the record, it stays marked. An inference must not be able
to launder itself into a fact by being proposed a second time.

**The second intent is recorded.** A goal that two intents both wanted says so in
its `why`, so "this also came up when you said lose inches" survives without a
second row.

## Three places, because one is not enough

**1. The model is told what already exists.** Its context gains the live goals
with their measures, and an instruction not to re-propose them. This is not the
guard, it is politeness: a model spending one of its eight slots re-deriving a
goal that exists is a slot not spent on something new.

**2. The save deduplicates, and this IS the guard.** Before creating any goal
with a measure, look for a live one on the same measure and direction. If it
exists, merge into it and attach nothing new. Deterministic, because a model can
be talked out of an instruction and cannot be talked out of a lookup. The same
argument the red flags already make.

**3. A repair for what is already there.** The two pairs above exist now, in his
record, and a rule that only applies going forward leaves them.

## What is deliberately not deduplicated

**Containers and behaviours.** They have no measure, and matching them on title
would merge things that merely sound alike. Two containers named similarly are a
wording problem, not a counting problem: they hold the same deduplicated leaves
underneath, so the count stays honest even when the shape is untidy.

**Abandoned goals.** He said no to that one. A later intent re-proposing it is a
new question and he is allowed to answer differently.

## How it gets checked

Against his real account, which is where the problem was found. Specifically:
that the two known pairs become one goal each; that the survivor carries the
target from whichever copy had one; that CRP stays marked inferred; that the
total drops by exactly two; and that `GET /goals` afterwards reports no title
appearing twice.

---

## What the build found that the plan did not

**It was fourteen, not two.** Title matching found two. Keying on `measure` plus
`direction` found seventeen, and the extra ones are exactly the cases title
matching cannot see: "Reduce weight toward target" and "Bring weight down",
"Raise HDL cholesterol" and "Raise HDL", "Keep nafld_fibrosis_score in the
low-risk band" and "Keep NAFLD fibrosis score in the low-risk band". Two of them
were already ACTIVE, both counting, which is the scoreboard failure this was
written to prevent happening in the present tense rather than the future.

**Three of the seventeen were not duplicates at all.** Running it read-only
first, before anything was written, caught this:

- `apo_b` down: "Bring ApoB into optimal range" and "Recheck ApoB on a fixed schedule"
- `homocysteine` down: "Bring homocysteine into normal range" and "Confirm B12 and homocysteine hold on retest"
- `testosterone_total` up: "Raise total testosterone" and "Recheck testosterone_total once alcohol has been out"

A recheck shares a marker and a direction with the goal to move that marker and
is a completely different thing: one is something he does, the other is a number
that has to move. Merging them would have deleted his only reminder to go and
test. The identity is now three parts, not two, and the third is whether the goal
is about moving the number or measuring it again.

The root cause is upstream: a recheck is a BEHAVIOUR and should never have
carried the marker as its `measure`. That is now said in the system prompt and
at all three schema levels. The guard in `keyOf` stays anyway, because a prompt
is advice and this code deletes things.

**Nothing is deleted.** The plan said merge; the implementation marks the
duplicate `abandoned` instead. This codebase already holds that rule for goals,
"a goal that vanishes takes the reason it existed with it", and it applies twice
over when the merge is my judgement about rows in his health record rather than
his. Abandoned goals are excluded from every count and from the duplicate key, so
the numbers are right either way, and if two things were merged that were not the
same, the evidence survives.

## The result, on his record

| | before | after |
|---|---:|---:|
| measured goals | 54 | 32 |
| goals in total | 142 | 120 |
| proposals waiting on him | 62 | 41 |
| duplicated | 14 | 0 |
| rechecks | 4 | 4 |

Branch counts afterwards: Go meds free 47, Sleep on time 30, Stop alcohol 19,
Lose inches 20. The last two shrank because their copies folded into the older
branches, which is the point: one goal, counted once.

---

## Containers: a rule that turned out to be "do not"

He asked for the container names to be fixed too. Three designs were drafted for
merging or collapsing them, and **all three were judged destructive against his
real tree.** The answer is that containers are never merged by code at all.

**Why not.** His three inflammation containers are not one idea written three
times. Under Go meds free it carries the claim that the statins rest on it; under
Stop alcohol, that his drinking drives it; under Lose inches, that his waist
does. Merging them keeps one sentence and deletes two, and one of those is the
only place in the app that connects his drinking to his inflammation. The same
holds for the liver pair and the gut pair. Containers have no `measure` for the
same reason they have no single identity: they are an argument, not a number.

**The real defect was never the names.** Deduplicating the leaves left eight
containers reporting on rows that are nobody's goal any more:

| container | was | now |
|---|---|---|
| The liver that is holding the fat | 0 of 5 finished | 0 of 1 |
| Take weight off the frame | 0 of 4 | 0 of 1 |
| The visceral fat and insulin picture | 0 of 4 | 0 of 1 |
| The inflammation sitting underneath all of it | 0 of 4 | 0 of 1 |
| Bring the liver enzymes down off alcohol load | 0 of 4 | 0 of 1 |
| Clear the things in your record that wake you up | 6 still waiting | 3 still waiting |
| Fix the magnesium wasting | 0 of 2 | 0 of 1 |
| Bring down the inflammation... (Stop alcohol) | 0 of 3 | nothing left under it, 3 merged into other goals |

**Two bugs the leaf merge introduced, found by checking rather than assuming.**

`refresh` tested `children.every(achieved)` over ALL children. Abandoned is not
achieved, so a single merged child made a container permanently unachievable, and
the merge put fourteen goals' parents into that state at once.

`scoreboard` had no `kind` filter, so containers counted as achievements beside
their own leaves. Five containers now hold exactly one goal, so finishing that
one goal would have scored two, and up the nicotine chain four. It counts leaves
only now. A container finishing is a consequence of its parts finishing, not a
separate thing he did, and how deeply the model nested a branch is its wording
rather than his effort.

**What replaces merging.** When two branches hold the same idea, the goal detail
says so: "You have something close to this in Go meds free too. Kept apart
because each branch wants it for a different reason." Matched on the significant
words, because the difference between two of his is "under" and "underneath".
A caption costs nothing and deletes no sentence.

**Zero writes.** Nothing about containers changes in the database. Every fix here
is a read.
