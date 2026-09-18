# Feature plans

Kunal, 19 Sep 2026: **every feature gets a plan file before it is built.**

One file per feature, `docs/features/<slug>.md`, written and agreed before any
code. A feature that spans backend and frontend still gets one file: it is one
feature, and splitting the plan is how the two halves end up describing
different things.

## Why, concretely

Everything expensive in this codebase has been a decision made silently while
typing. Not a hard bug, a quiet assumption:

- A brief that read "currently taking" from a null end date, so the record told
  the model he was on two statins and a drug his own plan bans.
- A day plan generated from every intervention, which would have put "as needed"
  medicines on a daily to-do list.
- Goals with no baseline reporting 0% instead of "not started", which is the
  difference between failing and not having begun.
- An upload endpoint whose optional field arrived as the literal string
  "undefined", rejecting every file.

None of those were caught by review. They were caught by him, after they
shipped, or by running the thing against his real record. A plan written first
is where that thinking is supposed to happen, while it is still cheap.

## What a plan file contains

Not a spec. Enough that the decisions are visible and the wrong ones are
catchable before they cost anything.

**What he asked for.** His words, quoted. Not a paraphrase: the paraphrase is
already an interpretation, and that is the thing most worth checking.

**The working model.** Two or three paragraphs, in plain language, of how it
would actually work. This is the part he reads and corrects. "Go meds free is
not one goal" arrived at exactly this point and changed the whole design.

**What it grounds in.** What already exists in the record or the code that this
must use rather than reinvent. Every medicine already carried the reason it was
started; the goal decomposition was sitting in a column nobody had read.

**Decisions, with what was rejected.** Each real fork, the choice, and the
alternative. A decision with no visible alternative reads as the only option,
and nobody argues with it.

**The constraint that shapes it.** The one thing that, if got wrong, is
expensive to undo. Usually privacy or provenance. For family goals it is that a
shared plan must never share a record; for uploads it was that the path on disk
must never come from the filename.

**Explicitly not in scope.** What this feature is NOT doing, so "we should also"
has somewhere to go that is not the current branch.

**How it will be checked.** What would prove it works, against real data. Not
"tests" - he has asked for none for now - but the specific thing to run and look
at. The goal maths was checked against his actual ApoB before any screen existed.

## The rule

Write the file. Get it agreed. Then build.

If something is discovered mid-build that contradicts the plan, the plan is
wrong and gets updated in the same commit. A plan file that disagrees with the
code is worse than none, for the same reason a stale API doc is.
