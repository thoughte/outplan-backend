# Knowing what time it is

Status: **built and live**, 19 Sep 2026. The local date, time and weekday go
into every message, and where the zone is unknown the model is told to say so
rather than guess. The timezone half was superseded by `account-setup.md`.

## What he asked for

> "i was chatting in outplan. It doesnt even know in which time zone I am in.
> How will it record if I say 'just had breakfast'?"

## What happens today

At 04:53 IST on 19 September he asked the app what time it was where he is. It
answered:

> "Honestly, no. I can't see a clock, just the date, 18th September."
> "...somewhere in the 10 to 11 range."

Wrong date, and about six hours out on the time, which it had inferred from his
dinner and his cigarette rather than from a clock.

The damage is not the wrong answer to that question. Earlier the same day it
told him "that's the third night this week where food landed close to bedtime".
It had no way to know that. For someone whose reflux is a function of the gap
between eating and lying down, an app confidently reasoning about timing while
blind to the clock is producing advice out of nothing.

What is actually true underneath:

- `exchanges.said_at` is a real timestamp, so WHEN he typed is recorded.
- `local_day` is computed with `user.timezone` and is correct.
- `user.timezone` is `Asia/Kolkata` on every account, from a column default.
  Nobody has ever been asked and no browser has ever reported it.
- The chat model is never told the time, the date, or the timezone.
- The extractor is never told them either, so "just had breakfast" becomes a
  meal with no hour attached, and the hour is the health-relevant part.

## The working model

**The browser already knows.** `Intl.DateTimeFormat().resolvedOptions().timeZone`
returns an IANA zone with no permission prompt and no asking. It is sent when a
device registers a session, and again if it changes. Asking someone their
timezone is a question a computer should not need to ask.

**The model is told the time on every message**, in his zone, as one line near
the top of the system prompt: the local date, the local time, and the day of the
week. Not buried in the record section, because it is not a fact about his
health, it is the context the whole conversation happens in.

**The extractor is told it too.** "Just had breakfast" at 15:10 is a meal at
15:10, and that is a different fact from breakfast at 08:00. The observation
already links to the exchange, so the timestamp is recoverable, but the
extraction should be able to say so in the value rather than leaving it implied.

**A device that disagrees updates the record.** If he registers a session from a
zone different to the one stored, that becomes his zone. Someone in Dubai for a
week is in Dubai, and their day rolls over there.

## What it grounds in

- `User.timezone` exists and is already used by `localDay()`.
- `POST /api/v1/sessions` already runs on every app open and already accepts a
  body, so it is the natural place to carry the zone.
- `shared/helper.localDay()` already does zone-correct day arithmetic.

Nothing new is needed in the schema.

## Decisions

**Take it from the browser, do not ask.** Rejected: asking during onboarding.
It is a question with a correct answer the device already holds, and the answer
someone types is the answer they think is right rather than the one their phone
is set to.

**Store on the user, not the session.** Rejected: per-device zones. Two devices
in different zones would give one person two different "todays", and `local_day`
has to mean one thing or trends across days stop being comparable. Most recent
device wins.

**Say the time plainly, do not compute "it is late".** Rejected: injecting
derived judgements like "this is close to his bedtime". The model can work that
out from the clock and his record; pre-chewing it puts my assumption about what
counts as late into every conversation.

## The constraint that shapes it

**Never guess the time and never state it as fact.** What shipped was an app
inferring the hour from what he had eaten and saying it with confidence. If the
zone is somehow unknown, the prompt must say the time is unknown rather than
offer a default dressed as knowledge. A health app that is confidently wrong
about when something happened is worse than one that admits it does not know,
because everything downstream of timing inherits the error silently.

## Explicitly not in scope

- Reminders, or anything that fires at a time.
- Travel or jet lag handling beyond the zone following the device.
- Back-filling the hour onto observations recorded before this exists. The
  exchange timestamps are there and correct; reinterpreting old rows against a
  zone nobody confirmed would be inventing precision.

## How it will be checked

Ask it, in the app, what time it is, and compare with the phone. Then check that
a message sent after midnight local lands on the correct `local_day`, since that
is where a zone error shows up as a day of data in the wrong bucket. And confirm
an extracted meal carries the hour it was actually reported at.
