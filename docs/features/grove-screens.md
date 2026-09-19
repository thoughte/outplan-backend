# Grove: the screens

Status: building, 19 Sep 2026.

In the app: The farm has a tree quiz on first open and a Neighbours link inside it, where a neighbour sees only earned rewards. The care circle, for letting someone see how they are doing, is in Settings under Sharing.

The backend for this shipped in `120a6fa`. This is the half a person can see.

## His words

> build groove completely

and, from the rule that governs every screen in this app:

> before showing it to me, use UI yourself and score, always

## What gets built

Five surfaces, in the order a new person meets them.

### 1. The quiz, and planting

Five questions, one screen each, no health content in any of them. The backend
already refuses to serve a sixth or a health-flavoured one. At the end the tree
is revealed with its line, and the person names it.

The fork worth naming: **whether the quiz can be skipped.** It can. A person who
taps past it gets a banyan, which is the tree the backend falls back to. A quiz
that blocks the app is a quiz that makes people close the app.

The second fork: **whether the result can be overridden.** It can, from the
reveal screen. The five questions are a mirror, not a verdict, and someone who
reads "you are a neem" and thinks no is right about themselves and wrong about
the quiz.

### 2. The farm, with an identity

The existing farm screen grows a name at the top: the tree's kind and the name
its owner gave it. Everything below it is unchanged, because everything below it
is already computed from the record.

### 3. Discoveries

Cards, on the farm screen, under the mechanics. Each one is a pattern the engine
found across at least fourteen days with at least four days on each side and a
thirty point gap. Behaviour against behaviour only, never behaviour against a
diagnosis, which the backend enforces and the screen does not get to override.

They read as observations, not instructions. "On days you drank water early you
logged sleep more often" is a sentence about him. "Drink water early" is a
sentence at him, and he has been clear which one he will keep opening.

### 4. Neighbours, and the invite

A list of farms belonging to people who accepted an invite. Each shows a first
name, a tree, and the rewards that farm has **earned**. There is no total and no
list of what is missing, because "3 of 6" is a sentence about three habits your
neighbour is failing to keep, and that sentence does not belong on anyone's
phone.

The invite is a code and a share sheet. Tapping it copies a link.

### 5. The care circle

The screen where someone gives a specific person a specific view. Four toggles,
each labelled with exactly what it discloses, in the first person:

- Whether I checked in today
- Whether I took my medicines today
- When my farm needs attention
- If I go quiet for a few days

Not one of them is called "health". A toggle labelled "health" is a toggle
nobody can give informed consent to, and this screen exists to be consented to.

Doses appear to a carer as a count and never as a name. Anything else turns a
mother into a person who knows her son is on a statin.

Every link can be paused, from this screen, without a conversation. The pause is
the reason the whole feature is safe to turn on.

## What is deliberately not here

- **Roots as its own surface.** The farm already shows the count. A browsable
  root system is a records screen with soil on it, and the records screen works.
- **Seasons and surprises.** Both need a year of data to look like anything.
- **Billing.** Needs a payment provider account and keys that are his.

## Scoring

Every screen driven in the browser through the dev-only harness at
`/preview` before it is shown to him, per the standing rule. What is being
scored: reachable in one thumb, readable at arm's length, and nothing on screen
that a person glancing over a shoulder could read as a diagnosis.
