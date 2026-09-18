# Goals: the view

Status: **planned, not started.** Backend is built and live.

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

## Open, and his to decide

1. **Scope of "meds free".** The decomposition built branches for Sompraz-L,
   sildenafil and Atorvastatin. He is not on Atorvastatin; the other two are
   as-needed. Six daily medicines, or everything he might reach for?
2. **Confirming forty proposals one at a time is too many.** Confirming a
   container should probably confirm its subtree, with individual drops after.
3. **The inflammation branch was inferred, not recorded.** hs-CRP, CRP, uric acid
   and BMI were grouped as "the inflammation sitting underneath all of it",
   which is not in any medicine's reason. It may well be right. It should be
   his call whether an inferred branch stands beside the grounded ones.

## How it will be checked

Driven in the browser against his real 40-goal tree before he sees it, per the
standing rule. Specifically: that a goal with no baseline reads "not started"
and not 0%; that the month and year counts match a direct count of `achieved`
rows; that a branch whose children are all waiting does not show a confident
percentage; and that the screen is usable at 375px with one hand.
