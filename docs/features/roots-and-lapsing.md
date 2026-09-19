# Roots, and coming back after a while away

Status: building, 19 Sep 2026.

In the app: Roots, on the farm: how much is known about them. Markers measured, symptoms, medicines, how far back it reaches. Never any values.

Two of the three Grove pieces left on the list. The third, seasons, is at the
bottom with the reason it is not being built.

## Roots

`grove-screens.md` explicitly decided NOT to build this, and said why:

> **Roots as its own surface.** The farm already shows the count. A browsable
> root system is a records screen with soil on it, and the records screen works.

That reasoning was right about the thing it was describing and wrong about what
roots are for. A list of files IS the records screen. But the roots are not the
files. They are **what the record is made of**, and nothing in the app shows him
that.

He has 732 measurements, 573 genetic markers, 22 symptom write-ups and a set of
medicines, all extracted out of documents he uploaded. The Records screen shows
the documents. The farm shows a count of documents. Nowhere does it say: here is
how much is actually known about you, and where it came from.

**What roots show: depth, and where it came from.** Each root is a kind of thing
in the record, not a file:

- how many distinct markers have ever been measured, and how many have more than
  one reading, because a second reading is what makes a number mean something
- symptoms, medicines, genetic markers, observations logged from conversation
- the span: the oldest dated thing in the record and the newest

**Completeness, never results.** This is the rule the farm already holds and it
matters more here. A marker sitting at a terrible value grows exactly the same
root as a good one. Nothing on this surface is coloured by whether a number is
bad, nothing is ranked by concern, and no value appears at all. That is what
makes uploading safe, and it is why roots can be shown to someone who is
frightened of what their results say.

**Traceable.** Tapping a root says how many came from uploaded documents and how
many from conversation. That distinction already exists in the data
(`sourceFileId` on measurements, `exchangeId` on observations) and it is the
honest answer to "where did you get that".

## Coming back after a while away

The PRD calls this the misty lapsed state. The farm currently has no idea whether
somebody has been gone a day or a month, and the danger is entirely in the
second case: a farm that has been unattended for six weeks must not greet him
with six weeks of failure.

**The rule: absence is never a score.** Going quiet is not a lapse to be
reported, and there is no streak to have broken, because there are no streaks.
`farm/rules.ts` already holds the version of this that matters, that a mechanic
nobody has ever logged looks identical to one that has gone quiet.

So coming back adds exactly one thing: **the farm says how long it has been, and
asks for nothing.**

- under a week: nothing at all, this is a normal gap
- a week to a month: "It has been eleven days." One line, no verb.
- over a month: the same line, plus the explicit statement that nothing is
  expected today

**What must NOT happen.** No catch-up list. No "you missed 23 days of water". No
withered anything, no dead anything, nothing recoverable-by-effort. The farm is
already built so nothing dies, and lapsing is exactly the case that rule exists
for. The mist is atmosphere, not punishment: the scene reads quieter, and that
is the whole of it.

**Winter already covers illness.** This is different: winter is a deliberate rest
season triggered by symptoms, and it says "nothing is being asked of you today".
Lapsing is not being here at all. They must not be confused, and a lapsed farm is
not put into winter, which would be the app deciding he was ill because he was
busy.

## Seasons: not built, and why

Seasons need a year of data to look like anything. He has three days of app data
and a record that starts in 2022 but arrived last week. A season that cannot
change is a label, and a label pretending to be a season is the kind of
motivating decoration this app is supposed not to have.

It goes back on the list with that condition attached: build it when there are
twelve months of his own days in the app, not before.

## How it gets checked

Roots against his real record, because the counts are the whole feature and only
his record has real ones. Lapsing by moving the clock rather than waiting: the
three bands, checked for the thing that matters, which is that none of them
produces a number he could read as a failure.
