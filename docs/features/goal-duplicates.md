# One goal, counted once

Status: building, 19 Sep 2026.

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
