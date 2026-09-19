# Goals: the view

Status: **superseded by `grove.md`.** Backend is built and live.

The gamified view planned here is the farm. Kept for the decisions it records -
counting finished goals rather than averaging a percentage, celebrating
achievement only, and the three open questions at the bottom, which are still
open.

## What he asked for

> "we need to make an amazing gamified view of the same. fun, entertaining,
> addictive to use"

And earlier, on why the pieces are small:

> "If each goal has a smaller scope, it is beneficial for both, the user (as he
> can see he is achieving goals even frequently)..... and for us... as we can
> proudly show you achieved 6 goals this month and 28 goals this year... and also
> show how it positively impacted you"

## The working model

A tree of 40 goals is not a screen. Shown as a tree it is a project plan, and a
project plan is the opposite of addictive.

The view has three layers, and you only ever see one at a time.

**The top is a number that moves.** Goals finished this month and this year,
which is the thing he said out loud. Under it, the two or three closest to done,
because what makes something addictive is being nearly finished, not being shown
how much is left.

**The middle is branches, not goals.** Eight cards: the statin branch, the B
vitamins, the vitamin D, and so on. Each shows how many of its parts are done
and how many are still waiting for a first number. A branch you can finish in
three steps reads as achievable; forty items in a list reads as a chore.

**The bottom is one goal.** Where it started, where it is now, where it is going,
and the single thing that would move it. Tapping into it is a decision to look at
one thing, not a navigation step to be endured.

**What is celebrated, and what is not.** An achieved goal gets a moment, because
finishing six small things in a month should feel like six things. Nothing else
gets one. A bar that inches up does not deserve a firework, and a number that
went the wrong way gets shown plainly with no commentary: someone whose uric acid
drifted in a hard week does not need the app to have an opinion about it.

**Impact, when it lands.** He asked to "show how it positively impacted you". A
finished goal names what else moved with it. That is only honest where the record
supports it, so it is a real query over measurements around the achievement date
and it says nothing when there is nothing to say.

## What it grounds in

Already built and live:

- `GET /api/v1/goals` returns the tree with progress computed per node, plus a
  scoreboard of `thisMonth` / `thisYear` / `total`.
- `standing.fraction` is `null` where progress cannot honestly be known, and the
  view must render that as "not started", never as 0%.
- Containers carry both counts: finished, and still waiting.
- `achievedAt` is stamped once and does not un-happen, which is what makes a
  monthly count countable.

Nothing new is needed on the server for the first version.

## Decisions

**Tree collapsed into three layers, not shown as a tree.** Rejected: an
indented expandable tree. It is the honest shape of the data and it is a
project plan. Forty rows with disclosure arrows is not something anyone opens
twice.

**Progress by count of finished goals, not by average percentage.** Rejected:
one big "you are 34% meds free" number. It is unfalsifiable from the screen, it
moves imperceptibly, and it is exactly the kind of figure that drifts from what
the measurements say. Counting finished goals can be checked by counting.

**Celebrate achievement only.** Rejected: streaks and daily points. The day plan
already has adherence; adding a second score invites optimising the score rather
than the health, and a streak punishes the week someone is ill.

## The constraint that shapes it

**A number on this screen must be checkable.** Every figure traces to a
measurement with a date, or to a count of goals whose status anyone can list.
Nothing derived by a formula that cannot be explained in one sentence. This is a
health record: a motivating number that nobody can verify is the same failure as
a wrong one, discovered later.

## Explicitly not in scope

- Editing goals, retargeting, or reordering. Confirm and abandon exist; the rest
  waits.
- Family or household goals. Recorded separately in `PLANNED.md`.
- Notifications or reminders of any kind.
- Charts of a marker over time. That is the Records screen's job and it does not
  exist yet either.

## Decided, 19 Sep 2026

These three sat open across several sessions while other things shipped. Leaving
a question open is not neutral: it blocked the goal tree from being honest, and
asking him again is what he has now told me to stop doing. Each has a default a
careful person would take, each is reversible, and each is recorded here with
its reason so he can overturn any of them in one sentence.

**1. "Meds free" means the six he takes every day.**

This turned out to be a bug, not a preference. `decompose.ts` selected
`stoppedOn: null` and called the result "medicines he is on", which is the same
two-state read that once put two statins and a drug he does not take into his
record. Not-stopped is not the same as taken-daily: it also catches an as-needed
tablet and a row with no start date.

Now three states, sharing the pattern with `brief.ts`. The daily six are what a
meds-free goal is about. As-needed medicines are named to the model with an
explicit instruction not to build a branch about stopping them, because there is
nothing to stop: he already does not take them most days. Fixing the reason one
gets reached for is worth a goal; stopping it is not. Anything undated is named
as unknown and no goal is built on it either way.

Atorvastatin therefore disappears from the tree on its own, without a rule about
Atorvastatin. That is the right shape: the fix is to the reading, not to a list.

**2. Confirming a container confirms its subtree.**

Forty confirmations one at a time is a wall he walks away from halfway, leaving a
tree that is half confirmed and a screen that can report nothing honestly. He
agreed to the thing; the parts are what the thing is made of. Dropping a part
afterwards is one tap and it is reversible, which is the right way round: a wrong
cascade costs a tap, forty taps costs the feature.

Two exceptions. An inferred goal never cascades, for the reason below. An
abandoned goal never revives, because he already said no to that one and a
cascade that overrules him is worse than a wall.

A baseline typed on the container stays on the container. Copying it down would
invent forty starting numbers out of one.

**3. The inflammation branch stands, marked as inferred.**

Deleting it would be wrong: it may well be right, and "silent watch" says his
theory is never stupid, which cuts both ways. Letting it stand beside the
grounded branches would also be wrong: nothing in any medicine's reason says
hs-CRP, CRP, uric acid and BMI belong to one cause, and a record that cannot
tell a reading from a reasoning is not a record.

So `Goal.inferred` now carries it. The model declares it when it reasons rather
than reads, the tree returns it, and confirming a parent never confirms it. The
flag is never cleared on confirm: it is provenance, and provenance does not stop
being true once somebody agrees with it.

## How it will be checked

Driven in the browser against his real 40-goal tree before he sees it, per the
standing rule. Specifically: that a goal with no baseline reads "not started"
and not 0%; that the month and year counts match a direct count of `achieved`
rows; that a branch whose children are all waiting does not show a confident
percentage; and that the screen is usable at 375px with one hand.
