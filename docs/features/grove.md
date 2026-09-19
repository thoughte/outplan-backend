# Grove: the farm, on top of outplan

Status: **first slice built and live**, 19 Sep 2026: the farm as a view over the
record, plus the observation amounts it needed underneath. Everything else in
this plan is still ahead - quests from behaviour goals, the record confirmation
step, roots as their own surface, the quiz, neighbours, care circle, billing.

In the app: The farm, from the Farm card on the home screen: a tree reflecting what they logged this week. Water, movement, meals, sleep, doses. It never shows results from a report and nothing on it dies.

## What he asked for

A PRD (rev 15, "Gamified Health Companion, working title: Grove") and four
answers that settle how it lands here:

- **Grove is outplan's direction.** The farm, quiz, friends and care circle are
  layers on what exists. The record, goals, day plan and chat stay and become
  the substrate the farm reads from. Nothing is rebuilt.
- **No reference ranges.** The PRD says trend charts show the lab's printed
  range. His standing rule wins: values and units only.
- **Quests are the daily face of goals.** Not a second system. A quest is a day
  plan item generated from a behaviour goal.
- **One plan, then build.**

## The working model

**Almost nothing here is new data. The farm is a VIEW.**

Everything the PRD wants the farm to react to is already recorded, and the
mapping is close to one to one:

| PRD farm mechanic | Reads from, today |
|---|---|
| Hydration, leaf freshness | `observations` where variable = water |
| Medication, pests kept away | `plan_items` done, and how they were ticked |
| Activity, sunlight and branches | `observations` where variable = activity |
| Sleep, night scene | `observations` where variable = sleep |
| Nutrition, soil richness | `observations` where variable = meal |
| Mood, weather | `observations` where variable = mood |
| Records, roots | `stored_files` by kind, and `reports` |
| Discoveries | `measurements`, correlated |

So the farm state engine is a rules service over existing rows, and the only
genuinely new storage is cosmetic and social: which tree, its name, which
visitors have been earned, the neighbour graph, care circle permissions,
referral attribution.

**Quests are plan items.** `PlanItem.source` is already `intervention | manual`;
quests add `goal`. A behaviour goal produces a daily line, the battery check-in
sizes how many, and negotiation edits the day rather than the goal. Ticking is
what already exists, including ticking by saying so.

**Two voices is a prompt and a render rule**, not an architecture. The tree
speaks in the talk prompt; the neutral voice is anything quoting the record, and
it must be visually distinct. Where the two disagree, the neutral one is right.

**One thing genuinely contradicts what is built.** The PRD requires the user to
confirm or correct extracted record data before anything is saved. Outplan saves
extraction immediately and shows it afterwards. The PRD is right for a product
with users who did not write the extractor, and it is a real change to the
digest, not a screen.

## Decisions

**Build the farm as a projection, never as a second source of truth.** Rejected:
farm state as its own stored model updated by events. Two stores for one fact
drift, and the one people look at would be the one that is wrong. Cosmetics are
stored; everything behavioural is computed.

**Quests extend the plan, they do not replace it.** Rejected: a separate quest
table. His medicines are already plan items and a user with both would have two
lists to tick.

**No reference ranges anywhere, for anyone.** Rejected: showing them to general
users who lack context. His reasoning holds for everyone: a printed range is the
lab's population, not this person's baseline, and it makes a number look fine
while their own trend says otherwise. Charts show the person's own history,
which is the context that is actually theirs.

**Confirmation before saving extracted records.** Adopted from the PRD against
what is built. A wrong value in a medical record is the one error this product
cannot recover from by itself.

**No streaks.** The PRD already says weekly targets rather than unbroken
streaks; it matches his own instruction that a bad week is not a failure.

## The constraint that shapes it

**The farm may be seen. The health data may not.** Every social surface passes
that test before it ships, and the subtle half is the one that bites: **absence
must not signal.** A farm without fireflies must look identical whether the
person sleeps badly or simply has not unlocked them. Rewards-only visibility is
not enough on its own, because a missing reward is itself information.

This is the same constraint already written down for family goals, and the two
should be built as one permission model rather than two.

Second, from his own rules and the PRD together: **nothing in the game may push
a health behaviour.** Pests clear on an explained skip, extra doses earn
nothing, food quests reward regularity and never restriction, and rewards cap at
the target so more is not better. A game that can be won by drinking more water
than a person should is a game that will be.

## Explicitly not in scope for the first slice

Billing, referral rewards, the misty lapsed state. Care circle. Villages,
festivals, shared structures, visiting spirits. Seasons. The tree quiz and
persona. Native apps, wearables, web push.

Those are all real, and none of them is the thing that proves the idea.

## What gets built first, and why

**The farm as a view over what he already has.** He has 732 measurements, a
working day plan, observations flowing from conversation, and 40 goals waiting.
That is enough to render a farm today, for one real user, with no quiz, no
friends and no billing.

If the farm is not worth opening twice a day for someone whose data is already
there, no amount of quiz or referral fixes it. Everything else in the PRD
assumes that loop works.

Order after that, by what the previous step teaches: quests from behaviour
goals, then the record confirmation step, then roots, then the quiz, then
neighbours.

## How it will be checked

Against his own account, driven in the browser before he sees it. Specifically:
that a farm with no fireflies is indistinguishable from one whose owner has not
unlocked them, checked by looking rather than by reading the code; that nothing
on the farm moves in response to a measurement value rather than a behaviour;
that the full daily loop is completable through chat alone; and that the farm
view is interactive within 3 seconds on a mid-range phone, which the PRD sets
and which a 2D scene can fail quietly.
