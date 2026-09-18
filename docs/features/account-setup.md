# Account setup: name, date of birth, city

Status: **planned, not started.** Supersedes the timezone half of
`knowing-the-time.md`, which assumed the browser would be the source.

## What he asked for

> "when a user signs up, we need to know their name, date of birth, and city
> (for time zone). for existing accounts, if it is not set, it will be thrown to
> setup screen on next refresh."

## Why this is not onboarding polish

Three things in the codebase are currently held together by the fact that there
is exactly one real user.

**The identity check on reports only works for him.** A report is matched to a
person by name before a single number is read from it, which is his own first
rule about reports. The name it checks against is a string literal:

    src/index.ts:61            u.email === 'ekunalkhanna@gmail.com' ? 'Kunal Khanna' : null
    src/modules/file/controller.ts:38   { 'ekunalkhanna@gmail.com': 'Kunal Khanna' }

Anyone else who uploads a report gets no identity check at all, because the code
has no name to check against and skips digestion entirely. A household sharing a
laptop and a lab is exactly the case that rule exists for.

**Age is missing.** Every account is `timezone: Asia/Kolkata` from a column
default and has no date of birth. Reference ranges, and most of what a marker
means, depend on age and it is nowhere in the app.

**The clock is wrong.** Covered in `knowing-the-time.md`: at 04:53 the app said
it was the 18th and guessed "10 to 11". The zone is the fix and the city is
where it comes from.

## The working model

**Three fields, asked once.** Full name, date of birth, city. Nothing else. An
onboarding form that asks for ten things is one people abandon, and everything
else about them is already arriving through conversation.

**The name is asked for as it appears on medical reports.** Not a display name
and not a nickname. It is the string every uploaded report is checked against
before anything is read from it, and "Kunal" will not match a report that says
"Mr KUNAL KHANNA". The field says so on the screen, because someone who types a
nickname has quietly broken the check that protects their record from someone
else's blood test.

**City gives the zone; both are kept.** The browser's detected zone seeds the
suggestion, so the common case is confirming a prefilled answer rather than
searching. What is stored is the IANA zone for the arithmetic and the city in
his own words for anything shown back to him. "Kanpur" is what he understands;
`Asia/Kolkata` is what `local_day` needs.

**Existing accounts are routed to setup on next open.** The server decides:
`GET /me` reports whether the profile is complete, and the app sends people to
the setup screen when it is not. Completeness is derived from the fields being
present rather than stored as its own flag, because a flag and the fields it
describes will eventually disagree.

**Nothing is blocked server-side.** The API keeps working for an incomplete
profile. A gate in the router would mean a bug in the setup screen locks someone
out of their own health record, and the screen is a routing decision, not a
security boundary.

## What it grounds in

- `User.timezone` exists and `localDay()` already uses it correctly.
- `GET /api/v1/me` already exists and is already called on app open.
- `PATCH /api/v1/me` already exists for changing the timezone.
- The digest already performs an identity check; it needs a name from data
  rather than from a literal.

Schema additions: `name`, `dateOfBirth`, `city`. Nothing else.

## Decisions

**City, not browser detection alone.** Rejected: taking the browser zone
silently, which was the previous plan. A phone reports where it is, not where
someone lives, and a week abroad would quietly move every day boundary in the
record. The browser still seeds the suggestion; the person confirms it.

**Derive completeness, do not store a flag.** Rejected: `profileCompletedAt`. A
flag set once will outlive someone clearing a field, and then the app is certain
about something that is no longer true.

**Route to setup, do not enforce it in the API.** Rejected: 403 until complete.
A broken setup screen would then lock someone out of their own record, and the
failure would look like an authentication problem.

**Date of birth, not age.** Rejected: storing age. Age is a number that silently
rots; a birth date is a fact that stays true.

## The constraint that shapes it

**The name is a safety field, not a courtesy.** It is the only thing standing
between a household member's blood test and someone else's permanent record. It
must be asked for in the form that appears on a lab report, it must never be
guessed from an email address, and where it is missing the identity check must
refuse rather than pass. Refusing to ingest is recoverable; silently writing
another person's numbers into a health record is not.

## Explicitly not in scope

- Avatars, display names, pronouns, units, or any other preference.
- Changing the city later. `PATCH /me` exists; a proper travel story does not.
- Backfilling age-adjusted reference ranges onto the 732 measurements already
  recorded.
- Email verification or anything else about sign-in, which Firebase owns.

## How it will be checked

Against his own account, which is currently incomplete and will therefore be
routed to setup. Then: that a report naming someone else is refused by name
rather than skipped for want of one; that a message sent after local midnight
lands on the correct `local_day`; and that asking the app the time gives the
same answer as the phone. The two hardcoded "Kunal Khanna" literals must be gone
when this lands, and their absence is the real test that it works for anyone but
him.
