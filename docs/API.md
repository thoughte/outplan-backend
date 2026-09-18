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
  "config": { "database_url": { "present": true, "chars": 122, "fp": "2a399cfe4095" } } }
```

`ok` means "can serve", not "every variable is set" - the Anthropic key is only
required when reasoning is on, and failing the check over an unused key has the
platform restarting a working container.

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
  "talk.max_message_chars": 8000 } }
```

---

## Session

### `POST /api/v1/sessions`
Token only, no session header - this is the call that creates one.
Body: `{ "label"?: string }` → `201 { data: { id, label, lastSeenAt, current } }`

### `GET /api/v1/sessions` · `DELETE /api/v1/sessions/:id` · `DELETE /api/v1/sessions`
List, sign out one device, sign out all. `?keep=current` on the last spares the
device asking.

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
Body: `{ "said": string }` → `201 { data: Exchange }`

- Several messages sent before any answer are answered **together**. The reply
  attaches to the newest, and the earlier ones carry `coveredById` pointing at
  it. They are not left unanswered, and they do not each get their own reply.
- The message is stored before reasoning is attempted, so a model outage never
  costs the message.
- After the reply is sent, the message is read for observations. Not before: it
  would double the wait for an answer.

```jsonc
{ "id": "uuid", "said": "...", "replied": "...",
  "replyParts": { "messages": ["..."], "question": { "text": "...", "options": ["...","..."] } },
  "coveredById": null, "saidAt": "...", "repliedAt": "...", "localDay": "2026-09-18",
  "corrections": [] }
```

`replyParts.messages` is one to three bubbles. A `question` has two to four
options; one option is not a choice and is dropped rather than rendered.

### `GET /api/v1/talk` · `GET /api/v1/talk/:id` · `GET /api/v1/talk/export`
List (`?day=`, `?limit=`, `?cursor=`), one, and everything.

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
