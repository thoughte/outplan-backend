# outplan backend — PRD

Derived from `../../.claude/prd.md`. Read that first; it holds the eight non-negotiables.

## Scope

The whole product, minus the UI. Database, five engines, system prompts, the reasoning path,
and the public API. No rendering — the current app's server-rendered HTML is not being ported.

## Order of work

1. **Schema, complete, before anything else.** The owner's instruction: a strong DB first.
2. Engines ported from `../../outplan/lib/`, modular and configurable.
3. Prompts stored and versioned in the database, not in source.
4. The exchange log — every health exchange, and every correction the person makes to it.
5. Live Anthropic API on the reasoning path only.
6. Public API.

## What to port, and from where

| From | What it is | Why it matters |
|---|---|---|
| `lib/rules/engine.js` | tri-state evaluation | unknown is never false; the semantics are subtle and tested |
| `lib/rules/catalog.js` | 28 clinical rules | each carries a source |
| `lib/rules/principles.js` | 7 design principles | each declares `needs[]` and reports INERT when it cannot run |
| `lib/knowledge.js` | ltree tree, inheritance, search | deepest node wins, then confidence, then recency |
| `lib/parse-meal.js` + `lib/foods.js` | deterministic parser, 62 foods | Unicode-safe folding, Hinglish numerals |
| `db/001–008` | the schema that works | including the traps: see below |
| `test/` | **127 passing tests** | port these FIRST and make them pass |

**Port the tests before the code.** They encode four of the owner's own corrections and at least
six bugs that were invisible to review and only found by running.

## Traps already paid for — do not rediscover

- A generated `tsvector` column needs `to_tsvector('english'::regconfig, …)`. Unqualified, the
  parser can pick the one-argument form, which reads a session setting and is only STABLE.
- `array_to_string` is STABLE, not immutable. A generated column using it is rejected. Wrap it
  for the one concrete type where immutability genuinely holds.
- Anything referencing an optional column (pgvector's `embedding`) must sit **inside** the
  conditional block. Postgres validates a whole statement before running it, so a runtime guard
  cannot rescue a parse-time reference. This broke production for days.
- `due_at::date` is not IMMUTABLE on timestamptz. Store `due_on date`.
- `CREATE OR REPLACE VIEW` cannot insert a column mid-list. Drop and recreate.
- Health checks must fail when the schema is half-applied. A reachable database answers
  `SELECT 1` perfectly while every page 500s.
- Seed reference data at boot, like a migration. Nobody runs a seed script against production.

## Prisma, and where it will not reach — DECIDE BEFORE SETUP

The rules mandate Prisma. The schema uses **ltree**, **generated tsvector columns**, and
optionally **pgvector**, none of which Prisma models natively.

Recommendation: Prisma owns the ordinary relational models; `ltree`/`tsvector`/`vector` columns
are declared `Unsupported()` and created by raw SQL migrations; tree traversal and search go
through raw queries in a repository layer. The alternative — dropping ltree for adjacency lists —
loses inheritance and the `path <@ prefix` queries the whole knowledge engine depends on.

Do not start setup until this is settled and written into `tech-stack.md`.

## Definition of done for phase 1

The 127 tests pass against the new backend, `/health` reports 503 on a half-applied schema, and
the knowledge tree seeds itself at boot.
