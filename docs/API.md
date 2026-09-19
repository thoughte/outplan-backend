# outplan API

Base: `https://api.outplan.org`  ·  Prefix: `/api/v1`  ·  Spec: [openapi.yaml](./openapi.yaml)

**This file and `openapi.yaml` are part of the change, not a write-up afterwards.**
A pull request that adds, removes or alters an endpoint, a field, a status code
or an error, and does not touch these, is incomplete. The cost of skipping it is
not tidiness: it is the next person calling something that no longer behaves the
way the only description of it says.

---

## Authenticating

Every request below the auth boundary carries **two** credentials:

| Header | What |
|---|---|
| `authorization: Bearer <token>` | A Firebase ID token, **or** an agent key beginning `oak_` |
| `x-session-id: <uuid>` | The device session. Not required for an agent key. |

Two credentials rather than one is what makes "sign out that phone" possible.
Firebase cannot enumerate or revoke a single device, so the session row is the
thing that can be killed. It also means a stolen token alone is not enough.

**Agent keys** are issued by the person in Settings, scoped to records, and
cannot reach `/talk` at all. They are the session, so they send no
`x-session-id`.

### Shape of every response

```jsonc
{ "ok": true,  "data": ... }
{ "ok": false, "error": { "code": "BAD_REQUEST", "message": "...", "detail": { } } }
```

`message` is written to be shown to a person. `detail.fields` carries which
field failed validation, and the client shows it: "some of that did not look
right" on its own, ten times, tells nobody anything.

---

## Public

### `GET /health`
No auth. Returns whether this process can do its job.

```jsonc
{ "ok": true,
  "db":    { "up": true, "migrated": true, "pending": 0, "applied": 17, "latest": "..." },
  "files": { "path": "/data/files", "mounted": true, "writable": true,
             "ephemeral": false, "freeMb": 1523276,
             "firstSeen": "2026-09-18T05:59:42Z", "boots": 19 },
  "config": { "database_url": { "present": true, "chars": 122, "fp": "2a399cfe4095" } },
  "brain":  { "ok": false, "at": "2026-09-19T18:40:11Z", "failures": 3,
              "status": 500, "type": "api_error", "needsNewCredential": true } }
```

`ok` means "can serve", not "every variable is set" - the Anthropic key is only
required when reasoning is on, and failing the check over an unused key has the
platform restarting a working container.

`brain` is whether the reasoning service has actually been ANSWERING, which is a
different claim from a key being set. It is recorded from real calls rather than
probed, so `ok: null` means nothing has asked it yet on this boot.

It exists because this endpoint answered `ok: true` right through a total
reasoning outage. The production credential is an OAuth session, it expired, and
every call came back `Failed to authenticate: OAuth session expired and could
not be refreshed`. Chat replies, record extraction, conversation compaction and
goal decomposition all stopped at once. The check was that `ANTHROPIC_API_KEY`
was present, and it was, the entire time.

`needsNewCredential` separates the two cases that need opposite responses: a 429
or a 529 wants waiting, an expired credential wants a person to go and renew it.

`brain` deliberately does NOT gate `ok`. Restarting cannot renew an expired
credential, so failing the healthcheck would crash-loop the container while
reporting the wrong problem - the same reasoning as the files volume below.

`files.ephemeral: true` means writes succeed and vanish at the next deploy: the
directory exists in the image and no volume is mounted over it. `boots` climbing
while `firstSeen` stays put is the proof that storage survives a deploy.

Secrets appear as fingerprints, never values: a truncated secret is exactly what
this endpoint is for, and printing it to diagnose it defeats the purpose.

### `GET /api/v1/config`
No auth - the sign-in screen needs it before anyone has signed in. An allowlist
of client-safe settings; the same table holds CORS origins and the model name.

```jsonc
{ "ok": true, "data": {
  "talk.status_labels": [ { "at": 0, "label": "thinking" },
                          { "at": 3000, "label": "reading your record" } ],
  "talk.placeholder": "What’s going on?",
  "talk.max_message_chars": 8000 } }
```

---

## Account

### `GET /api/v1/me`
`needsSetup` is true until name and date of birth are both present. City is a column that exists and is not yet asked for: it was briefly a free-text box, which cannot be grouped or validated, and the timezone comes from the device anyway. Derived
from the fields, never stored as a flag, because a flag outlives someone clearing
a field and then the app is certain about something that stopped being true.

The app routes to setup when it is true. It is **not** enforced in the API: a bug
in the setup screen must not be able to lock someone out of their own record.

`name` is a **safety field**. Every uploaded report is identity-checked against it
before a single number is read. Where it is missing, files are stored and not
read, which is the safe direction: an unread file is recoverable, another
person's blood test written into a health record is not.

`age` is worked out from the date on every read. A stored age rots.

### `PATCH /api/v1/me`
Writes only the fields sent. A blanket update would blank what the caller left
out, so saving a city would quietly erase the name the report check depends on.

Legacy timezone aliases are normalised by an explicit table, not by `Intl`. A
browser in Kanpur reports `Asia/Calcutta`, and `Intl.resolvedOptions()` is
runtime-dependent: on this Node it resolves `Asia/Kolkata` **to**
`Asia/Calcutta`, the opposite direction. A zone that cannot be formatted is
dropped rather than stored, because it would then throw on every later use.

---

## Session

### `POST /api/v1/sessions`
Token only, no session header - this is the call that creates one.
Body: `{ "label"?: string }` → `201 { data: { id, label, lastSeenAt, current } }`

### `GET /api/v1/sessions` · `DELETE /api/v1/sessions/:id` · `DELETE /api/v1/sessions`
List, sign out one device, sign out all. `?keep=current` on the last spares the
device asking.

---

## Farm

### `GET /api/v1/farm`
Computed on every read, never stored. Two stores for one fact drift, and the one
people look at would be the wrong one.

Six mechanics, each reading rows that already exist: water and drinks, plan items
ticked, activity, sleep, meals, mood. Roots read stored files. Nothing reads a
lab value, because growth must track what someone did rather than what their
blood says.

`away` is how long since he last logged anything, and null under a week. It is
one flat sentence with nothing asked, never a count of what was missed and never
a streak, because this farm has none and nothing on it dies. Over a month it also
silences the nudge: arriving after a month to be told what is weakest is being
handed a chore on the doorstep. It is deliberately NOT `winter`, which is a rest
season entered because he is unwell. Being away is not being ill.

`health` is `unknown` when nothing of that kind has ever been logged, which is a
different fact from `dormant`. An empty week is not a failing farm.

Medication counts **per dose**, not per perfect day. All-or-nothing was the first
rule and it was cruel arithmetic: five of six tablets taken reported as "0 of 7",
which reads as having taken nothing.

`winter` needs words meaning ill *today*. Any-symptom would put someone with a
standing complaint in permanent winter, and a season that never ends says
nothing.

---

## Goals

### `GET /api/v1/goals`
The tree, with progress computed from the record every time. Nothing about
progress is stored: a saved percentage drifts away from the measurements it
claims to summarise, and then the app describes someone's health with a figure
nothing supports.

A container's progress is the plain **mean** of its children, not weighted, so a
number on screen can always be checked by counting. Children with no reading yet
are excluded rather than counted as zero, because a parent should not look like
it is failing on account of a child that has not started.

`standing.fraction` is `null` when progress cannot honestly be known, and that is
shown as "waiting", never as 0%. Clamped at both ends: past the target is 100%,
and going backwards is 0% rather than negative.

### `POST /api/v1/goals/propose`
Body `{ "intent": string, "exchangeId"?: uuid }`

Breaks what he wants into pieces small enough to finish, **recursively**, until
each leaf is one number to move or one thing to do.

"Go meds free" is a container holding one goal per medicine, and each of those is
the reason that medicine exists, which is already sitting in the intervention's
`reason` column: ApoB down for the statin, B12 up for the Macfolate, thiamine
repleted for the Benalgis. Six tablets, six goals, four trackable today.

Everything comes back **proposed**. A model suggesting a goal is not the same as
him wanting one.

It never writes a goal that says to stop or reduce a prescribed medicine. That is
not the app's to say, and it is not what is being asked for anyway: he is asking
to fix the thing that made the medicine necessary.

### `POST /api/v1/goals/:id/confirm`
Body `{ "baselineValue"?: number, "baselineText"?: string }`

Without a baseline an outcome goal becomes `waiting_baseline` and reports no
progress, rather than pretending. "Lose inches" with no starting waist is a wish.

### `DELETE /api/v1/goals/:id`
Abandoned, never deleted. What he tried and stopped is part of the picture.

---

## Plan

### `GET /api/v1/plan?day=YYYY-MM-DD`
Today's list, built from the record rather than kept beside it.

Generated from open interventions whose schedule is actually daily. As-needed,
SOS, irregular and uncertain ones are left off, because a list containing things
you are not meant to do every day is a list you stop reading.

Idempotent. Asking again adds what is new and never clears what has been ticked.

`atLocal` is null for "with breakfast": that is a time of day, not a time, and
inventing 08:00 puts a deadline on something that never had one.

### `POST /api/v1/plan/:id/done`
Body `{ "done": true | false }`.

**Items are also ticked by saying so.** "took my morning meds" in `/talk` marks
every morning item; "magnesium liya" marks that one; "had 2 rotis" marks nothing.
Those arrive with `doneVia: "said"` and carry the observation that proved it.
Unticking clears both, so nothing is left claiming to have been matched.

Matching is deliberately conservative. An unticked box is a tap; a box ticked for
a tablet never taken is the record saying he is adherent when he is not, and that
is the number everything else turns on.

---

## Talk

**Agent keys are refused here** (`403`). Records are data he asked to be kept;
the conversation is him.

### `POST /api/v1/talk`
Body: `{ "said": string, "answering"?: uuid }` → `201 { data: Exchange }`

- Several messages sent before any answer are answered **together**. The reply
  attaches to the newest, and the earlier ones carry `coveredById` pointing at
  it. They are not left unanswered, and they do not each get their own reply.
- The message is stored before reasoning is attempted, so a model outage never
  costs the message.
- After the reply is sent, the message is read for observations. Not before: it
  would double the wait for an answer.
- Every observation carries `said`: one of `did`, `will`, `did-not`, `used-to`,
  `considering`, `asking-about`. **Only `did` is a thing that happened, and only
  `did` ticks anything off the day plan.** An item whose modality the model
  cannot classify is DROPPED, never defaulted. It replaces `planned`, a boolean
  over a space with six values whose fallback was "they did it", so "I should
  stop the magnesium" and "I used to take that" both entered the record as a
  dose taken today.
- **If the reasoning service cannot be reached, a plain reply says so** rather
  than leaving the message with nothing under it. `model` is `unavailable` and
  `promptVersion` is `unavailable:<status>`, so nothing reading back a prompt
  version to judge a reply will find one. This is not cosmetic: during a
  reasoning outage every message looked exactly like being ignored.
- `answering` is the exchange whose reply asked the question this answers. Send
  it only when he **tapped** an offered option, never when he typed. A tapped
  answer is sent as the option label alone, and "Boiled" on its own is half a
  message: to the model it reads as a change of subject and to the extractor as
  nothing at all. With the link, the question goes back in front of it for both.
  It is checked against his own exchanges and ignored if it does not point at
  one.

```jsonc
{ "id": "uuid", "said": "...", "replied": "...",
  "replyParts": { "messages": ["..."], "question": { "text": "...", "options": ["...","..."] } },
  "coveredById": null, "saidAt": "...", "repliedAt": "...", "localDay": "2026-09-18",
  "corrections": [] }
```

`replyParts.messages` is one to three bubbles. A `question` has two to four
options; one option is not a choice and is dropped rather than rendered.

**No option may contain a digit.** An option label is the assistant's words, not
his. Tapping one is consent to somebody else's sentence, so it may let him choose
among things he said and must never supply a figure he did not: "400mg" offered
as a chip and tapped arrives as his message, goes through extraction, and becomes
an amount in a medical record he never uttered. Options with digits are stripped;
if fewer than two survive the question is dropped.

**Most replies have no question.** The prompt used to say "use it often" while
the reply tool said "only when the answer would change what you say next", and
the prompt won, so nearly every reply ended in one. It now says the opposite, and
the rule is enforced here as well as asked for: if two of the last four replies
already carried a question, the question is stripped and only the messages ship.
Same argument as the red flags being a regex. A model can be talked out of a
prompt rule and cannot be talked out of a check.

### `GET /api/v1/talk` · `GET /api/v1/talk/:id` · `GET /api/v1/talk/export`
List (`?day=`, `?limit=`, `?cursor=`), one, and everything.

### `POST /api/v1/talk/attach` (multipart)
Body: `file`, optional `said` → `201 { data: Exchange, file, duplicate }`

Say something with a file attached. The file goes through the **same** store and
digest as the Records screen: identity check, collection date, duplicate check.
Chat is not a second door with weaker locks.

The model is told the file exists and its name. It never reads numbers out of it.

### `DELETE /api/v1/talk/:id/did/:opId`
→ `200 { data: Exchange }`

Undo one thing the assistant did on that message. Each operation carries its own
undo, required by the type system when it was written. The entry is marked
undone, not removed. Safe to call twice.

**What the assistant can do**, and nothing else:

| tier | operations |
|---|---|
| read | `read_record`, `read_today`, `read_goals`, `read_roots` |
| write, undoable | `log`, `mark_plan_item`, `propose_goal`, `confirm_goal`, `drop_goal` |

Absent by design, and therefore unreachable: anything writing a measurement,
report, symptom, medicine or genetic marker (those come from `digest.ts`);
anything touching another person (care links, invites, neighbours); anything that
deletes rather than abandons.

### `DELETE /api/v1/talk/:id/record`
→ `200 { data: Exchange }`

Removes every observation read from that message, and un-ticks any day-plan item
marked done from one of them. The message is never touched.

**Undo, not approval.** Extraction writes as soon as the reply is sent, because
his words are already stored and anything inferred from them can be rebuilt.
Asking first would tax every correct reading to catch the rare wrong one. So what
was recorded is shown on the message that produced it, and one tap removes it.

The plan tick goes with it because `PlanItem.observationId` records which
observation ticked it. Without that the record and the plan would disagree, and
the plan is the one he looks at.

Safe to call twice. `parsed` becomes `[]`, never null.

### `POST /api/v1/talk/:id/correct`
Body: `{ "wasWrong": string, "isRight"?: string, "domain"?: string }`
A correction is not an edit. Both versions stay, and the correction is replayed
into later context so the same mistake is not made twice.

---

## Files

### `POST /api/v1/files`
`multipart/form-data`. Do **not** set `content-type` yourself; the browser writes
the boundary. Fields: `file`, `kind`, `status`, `contentDate?` (YYYY-MM-DD).

- `201` stored · `200 { duplicate: true }` the same bytes were already here.
  Nothing was created, and a report is digested exactly once.
- Ceiling 25 MB, enforced by the parser rather than trusted from a header.
- The path on disk comes from the SHA-256, never from the filename.
- Omit optional fields; do not send them empty. `FormData.append(k, undefined)`
  sends the literal string `"undefined"`, which failed a date check and rejected
  every file whose name had no date in it.

### `GET /api/v1/files` · `GET /api/v1/files/:id/content` · `POST /api/v1/files/read-pending`

`/content` returns the bytes and **requires the headers**, so a plain `<a href>`
cannot reach it. Fetch it and hand the blob to the viewer.

`read-pending` reads anything uploaded but not yet read, and answers with what
happened per file: `read`, `same-report-already-here`, `wrong-person`,
`scanned-no-text`, `failed`.

---

## Agent keys

### `GET /api/v1/agent-keys` · `POST /api/v1/agent-keys` · `DELETE /api/v1/agent-keys/:id`

`POST` body `{ "label": string, "days"?: 1-365 }` returns `data.secret` **once**.
It is stored as a SHA-256 hash and cannot be retrieved again; lose it and issue
another. A system that can show you a key twice is keeping it somewhere.

Creating and revoking both refuse an agent-key caller (`403`). A key that can
mint keys makes revoking one meaningless.

---

## Status codes

| Code | Means |
|---|---|
| `200` | Fine. On upload: the file was already here. |
| `201` | Something was created. |
| `400` | Validation. `error.detail.fields` says which field. |
| `401` | No credential, or the session is dead. Drop the session id and sign in. |
| `403` | Authenticated, not allowed. Unverified email, or an agent key on `/talk`. |
| `404` | No such thing, for this person. |
| `503` | `/health` only. This process cannot serve. |
