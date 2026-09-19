# Goals: the view

Status: **backend live since 17 Sep. Screen being built 19 Sep 2026.**

In the app: Goals, from the Goals card on the home screen: what they want to change, broken into small finishable pieces. Proposals sit at the top under "Waiting on you" until confirmed. Shows how many were finished this month and this year.

Marked superseded once, wrongly. The farm took over the *daily* gamified surface
and that was right, but the farm shows habits this week and it cannot show a goal
finishing. "You achieved 6 goals this month and 28 this year" is the thing he
asked for out loud, and nothing rendered it: four endpoints and a scoreboard sat
live with no `goals` entry in the frontend at all.

**Correction, 19 Sep 2026.** This file, and I, repeatedly said he had a 40-goal
tree waiting on the server. He does not. `GET /goals` on his account returns
`{ goals: [], scoreboard: { thisMonth: 0, thisYear: 0, total: 0 } }`. The same
key returns his farm, his day plan with his real medicines and his files, so the
account is populated and it is goals specifically that is empty: the
decomposition has never been run against it, or ran and never persisted.

Where "40" came from is not established. It is repeated in the Decisions section
below, which was written before anything was saved, and it should be read as the
size the decomposition was *expected* to produce rather than a count of anything
that exists. The three decisions themselves stand; only the number is unfounded.

So this plan stands, unchanged in its decisions. What follows the decisions
section is what has changed underneath it since.

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

---

## What changed under this plan, 19 Sep 2026

The three questions at the bottom of this file were closed, and two of them
change what the screen has to render.

**Confirming cascades.** `POST /goals/:id/confirm` now confirms the subtree and
returns `{ goal, alsoConfirmed }`, a count. The screen must say what just
happened: confirming one card can quietly activate eleven goals, and a number
that changed without being announced is the thing this whole app is against.

**`inferred` is on every node.** A goal reasoned to rather than read off the
record is marked, and confirming its parent deliberately does NOT confirm it. On
screen that is two things: a visible mark saying where it came from, and its own
confirm control even when its parent is already active. It is never styled as a
lesser goal, because it may well be right.

**`ASNEEDED` medicines no longer generate branches.** So whenever the
decomposition is next run, it produces fewer branches than this file assumed,
and none for a tablet he takes twice a month.

## What the screen renders, given the API

`GET /goals` returns `{ goals: GoalNode[], scoreboard }`. Per node: `title`,
`why`, `kind`, `status`, `inferred`, `baselineValue`, `targetValue`,
`blockedBy[]`, `standing { fraction, current, reached, summary }`, `children[]`.

Three layers, one on screen at a time, exactly as decided above.

**Top.** `scoreboard.thisMonth` and `thisYear`, then the two or three closest to
done. Closest means highest `standing.fraction`, and a node with `fraction: null`
is never "closest to done", it has not started.

**Middle.** Top-level branches as cards. Each shows finished over total and how
many are still waiting for a first number. Never an averaged percentage across
children: the decision above says count, and a roll-up of a tree where half the
leaves are `null` is a number nothing supports.

**Bottom.** One goal: `standing.summary` as the headline because it is already
written for a screen, then baseline, current and target, then what blocks it.

**Proposed goals are not in the tree view.** They are a separate stack at the
top, because a proposal is a question waiting on him and the tree is a record of
what he decided. Mixing them makes the count meaningless.

## What the screen must never do

- Render `fraction: null` as 0%. It is "not started". This is the single most
  likely bug and it is the one that would misreport his health.
- Average anything. Every number traces to a count or to `standing`.
- Celebrate a bar moving. Achievement only, per the decision above.
- Show an inferred goal as though the record said it.

## How it gets checked

Driven in the preview harness before he sees it, per the standing rule, with
seeded data shaped like the awkward cases rather than the tidy one: a branch
whose children are all `waiting_baseline`, a goal with `fraction: null`, an
inferred child under a confirmed parent, a blocked goal, and an achieved one.
