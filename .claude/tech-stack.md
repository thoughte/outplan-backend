# Backend tech stack

| | |
|---|---|
| Runtime | Node.js |
| Language | TypeScript |
| Framework | Express |
| Validation | Zod |
| ORM | Prisma, with `@prisma/adapter-pg` |
| Database | PostgreSQL 16 |
| Env | dotenv |
| Dev | nodemon + ts-node |
| Auth sessions | **UNDECIDED — ask the owner during setup** |
| AI | Anthropic API, reasoning path only |

## Postgres extensions

| Extension | Required? | Used for |
|---|---|---|
| `ltree` | **required** | the knowledge tree; inheritance and `path <@ prefix` |
| `pgcrypto` | **required** | `gen_random_uuid()` |
| `pg_trgm` | optional | fuzzy search fallback; degrade quietly if absent |
| `pgvector` | optional | semantic search. **Not installed in production.** Every reference must sit inside a conditional block |

## DECIDED 17 Sep 2026

**Prisma boundary: CONFIRMED** as described below — Prisma for relational models, raw SQL
migrations for extension-dependent objects, repository layer for tree traversal.

**The API contract is an OpenAPI spec this repo owns and publishes.** The frontend is a pure
HTTP consumer and shares no code with the backend. Clients generate their types from the spec:
TypeScript for web today, Swift or Kotlin for mobile when Keshav joins. The owner's reasoning,
which decided it: *"I want frontend to call backend just through API... we anyway need to build
API for later to build the app. So why not now?"*

Consequence: backend and frontend stay separate repos. A monorepo was considered and rejected —
its only real advantage was importing types across the boundary, and a published spec serves web
and mobile equally where a shared TypeScript folder serves neither of the mobile targets.

Consequence: **the spec is a deliverable, not documentation.** It is generated from the route
definitions rather than hand-written, so it cannot drift from the implementation.

## Prisma boundary — the decision this project turns on

Prisma does not model ltree, generated tsvector columns, or vector. The boundary:

- **Prisma owns** ordinary relational models: users, sessions, plans, plan_items, occurrences,
  entries, reviews, charges, audit_log, meals, hypotheses.
- **Raw SQL migrations own** every extension-dependent object: `k_nodes.path ltree`,
  `k_nodes.tsv` generated, GIN/HNSW indexes, the conditional pgvector block.
- **A repository layer owns** tree traversal and search, in raw SQL. Prisma types these columns
  as `Unsupported()` and never touches them.

Rejected: replacing ltree with adjacency lists to satisfy Prisma. It loses attribute inheritance
and prefix queries, which is most of the knowledge engine.

## Language

The product must work in any language and any script. Text folding uses `\p{L}\p{N}\p{M}` with
NFKC — **marks included**, because Devanagari matras and the Tamil pulli are category Mark and
stripping them destroys the word while leaving every letter.

Numerals, separators and unit words are **data, not code** — a lexicon table seeded per locale.
Full-text search config is per-node language with `simple` as the fallback, never a hardcoded
`'english'`.

CJK and Thai need segmentation, not a regex. Until then they must escalate loudly and never
total as zero.
