# Confirming what was read from a message

Status: building, 19 Sep 2026.

In the app: Anything read out of a message shows under it in the chat as one grey line, with "not right" beside it to remove it. Removing it also unticks whatever it ticked on the day plan.

## Where this came from

The PRD asks for a confirmation step before anything extracted from a
conversation is written to the record. The build does the opposite: `recordFrom`
writes observations and ticks the day plan as soon as the reply has been sent,
with nothing asked and nothing shown.

It is also the oldest thing on the pending list, and it is next in `grove.md`'s
own build order: *quests from behaviour goals, then the record confirmation step,
then roots*.

## His rule, which this is a straight application of

> "Confirmed, not assumed" — a suggestion is never done until Kunal says so; log
> only what he reports, default to not-done.

And the harder one, from the day the record claimed he was on two statins:

> "are you hallucinating on my health records"

An observation written from a misread sentence is that failure in miniature, one
message at a time. "I'll have the magnesium later" becoming a dose taken is not a
small error: it is the app telling him he did something he did not do, in the
record his plan is built from.

## What is actually wrong today

**Nothing is shown.** `recordFrom` runs after the reply, writes rows, and returns
a count nobody sees. He has no idea the app heard "two rotis" as a meal until it
turns up somewhere else.

**Nothing can be undone.** There is no endpoint to remove an observation. A wrong
one is permanent unless somebody goes into the database.

**The plan is ticked from it.** `markFromObservation` marks day-plan items done
off the back of an extraction that was never confirmed, so one misread sentence
moves two things.

**The `planned` flag is the only guard.** It stops "I will take it at 8" counting
as taken, which was a real bug and a real fix, but it only catches the future
tense. It does nothing for a misheard quantity, a wrong meal, or a symptom
attributed to the wrong day.

## The decision

**Write it, then show it, and let him take it back.** Not: ask first.

Rejected, and this is the important fork: holding the extraction until he
confirms. Three reasons. His words are already stored the instant he sends them,
and that is the thing that must never be lost; an observation derived from them
can always be rebuilt. A question before every logged meal is the question chain
he has already told me to stop. And the common case by far is that the extraction
is right, so a confirm step taxes every correct reading to catch the rare wrong
one.

So: it is written, it is **visible on the message that produced it**, and one tap
removes it. Undo, not approval.

**Where it shows.** Under the reply, on the exchange it came from, as a short
line naming what was recorded: "logged: two rotis, dal". Not a form, not a card,
not a modal. If nothing was read, nothing appears, and that is already the
common case.

**What removing it does.** Deletes the observation rows for that exchange, and
un-ticks anything the plan ticked from them. The message itself is never touched.
`parsed` is set to `[]` rather than null, because "read, and nothing in it" and
"not looked at" are different facts and the codebase already keeps them apart.

**It cannot be re-run.** Removing an extraction is him saying it was wrong. A
button that re-reads the same sentence to get the same answer is not a feature.

## Constraints this must not break

- **Never block the reply.** Extraction already runs after the reply is sent and
  that stays. Showing it must not add a round trip before he can read the answer.
- **Never invent a number.** The line names what was recorded, in his words where
  there are any, and shows an amount only where one was actually extracted.
- **Do not narrate.** No "I've logged that for you!". A quiet line that can be
  undone, not an announcement.
- **Plan ticks follow the observation.** Undo has to reach them, or the record
  and the plan disagree and the plan wins on screen.

## The endpoint

`DELETE /api/v1/talk/:id/record` — remove everything read from that exchange.
Authenticated, his own exchanges only, and it returns the updated exchange so the
screen does not have to guess.

## How it gets checked

Driven in the harness with a seeded exchange that has `parsed` rows, then against
his real conversation. Specifically: that an exchange with no extraction shows
nothing at all; that one with extraction shows what was recorded and nothing
more; that undo removes the rows and the tick together; and that undoing twice is
harmless.
