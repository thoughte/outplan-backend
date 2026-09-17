# Backend - Claude Instructions

Before writing any code, you MUST:
1. Read `.claude/prd.md` — understand the product context, data models, and feature scope
2. Read `.claude/tech-stack.md` — understand the database, auth, and integration choices
3. Read the relevant rule file(s) for the task at hand (listed below)

If either `prd.md` or `tech-stack.md` does not exist, follow the "First Step" section below to create them before doing anything else.

These rules must produce deterministic, consistent results across all conversations.

## Rule Directory

```
.claude/
├── prd.md                                     # Product Requirements Document (must exist before any code)
├── tech-stack.md                              # Database & auth choices for this project
└── rules/
    ├── planning-guide.md                      # Mandatory planning step + endpoint access policy
    ├── setup-guide.md                         # Project initialization from scratch
    ├── config-and-libs-guide.md               # Config files & library wrappers
    ├── shared-and-core-guide.md               # Shared utilities, routes, enums, extended types, service locator
    ├── module-structure-guide.md              # When & how to create a module
    ├── module-implementation/                 # How to implement each file inside a module
    │   ├── repo.md                            #   Repository layer
    │   ├── types.md                           #   Zod schemas, DTOs, mappers
    │   ├── service.md                         #   Business logic layer
    │   └── controller.md                      #   Route handlers
    ├── middleware-guide.md                     # Auth, validation, role, bypass, ownership middleware
    ├── error-handling-guide.md                # AppError, domain error converters, error middleware
    └── commenting-guide.md                    # Comment conventions for routes/endpoints
```

## First Step — PRD & Tech Stack (Mandatory)

Before writing **any** code — including project setup — a Product Requirements Document (`prd.md`) and a tech stack file (`tech-stack.md`) must exist at `.claude/prd.md` and `.claude/tech-stack.md`.

### If `prd.md` already exists

Read it. Confirm with the user that it is still current. If it is, proceed to the relevant task. If not, update it by asking clarifying questions.

### If `prd.md` does NOT exist

Create it by gathering requirements from the user using the `AskUserQuestion` tool. Ask questions in rounds — do NOT dump all questions at once. Each round should build on the previous answers. Keep going until the requirements are clear enough to write code against.

**Round 1 — Project overview:**
- What is the project? (name, one-line description, domain)
- Who are the target users?
- What are the core features at a high level?

**Round 2 — Feature details (per feature from Round 1):**
- What are the key user stories or workflows?
- What data does each feature operate on?
- Are there any business rules or constraints?

**Round 3 — User roles & access control:**
- What user roles exist? (e.g. customer, admin, vendor)
- Which features/endpoints are restricted to which roles?
- Are there any ownership-based access rules? (e.g. user can only see their own orders)

**Round 4 — Tech stack questions:**
- Does this project need a database? If yes, which one? (e.g. PostgreSQL, MySQL, MongoDB)
- Does this project need authentication? If yes, which provider? (e.g. Firebase Auth, custom JWT)
- If using Firebase Auth: do you want to persist auth-sessions in the database?
- Are there any other external services or APIs this project will integrate with?
- Any specific libraries or tools you want to use?

**Round 5 — Data model & relationships (if database is needed):**
- What are the core entities/models?
- What are the relationships between them?
- Are there any specific fields or constraints the user has in mind?

Continue asking rounds of questions as needed until the picture is complete. Then:

1. Create `.claude/prd.md` with the following structure:

```md
# PRD — <Project Name>

## Overview
<One paragraph describing the project, its purpose, and target users>

## User Roles
<List of roles with descriptions>

## Features
### <Feature Name>
<Description, user stories, business rules>
(Repeat for each feature)

## Data Models
### <Model Name>
<Fields, relationships, constraints>
(Repeat for each model)

## API Endpoints (High-Level)
<Grouped by module — method, path, description, access level>

## Non-Functional Requirements
<Performance, security, scalability, or other constraints>

## Out of Scope
<Anything explicitly excluded from this version>
```

2. Create `.claude/tech-stack.md` based on the tech stack answers:

```md
# Tech Stack

## Database
- <Database choice> (via Prisma)

## Authentication
- <Auth provider> (via <library>)
- Persist auth-sessions: <yes/no>

## External Services
- <Any integrations>
```

**Do NOT proceed to project setup or any coding until both files exist.**

## When to Use Each Rule

**For every task below:** Always read `prd.md` and `tech-stack.md` first, then the task-specific rule file(s). The PRD provides the context needed to make correct implementation decisions (e.g. which fields a model has, which roles can access an endpoint, what business rules apply). Never implement a feature without understanding where it fits in the PRD.

### Setting up a new project

Read `.claude/rules/setup-guide.md`. This covers initializing the project, installing dependencies, creating the directory structure, and all configuration files. The tech stack decisions should already be captured in `.claude/tech-stack.md` (created during the PRD step).

### Adding or configuring a library/package

Read `.claude/rules/config-and-libs-guide.md`. This covers creating config files in `src/config/` and lib wrapper files in `src/lib/`.

### Working with shared files

Read `.claude/rules/shared-and-core-guide.md`. This covers:
- `src/shared/` — constants, enums, types, routes, helpers, extended types
- `src/routes.setup.ts` — route registration and middleware ordering
- `src/modules/service.locator.ts` — service registry

### Planning a new module or feature (MANDATORY)

Read `.claude/rules/planning-guide.md`. Before implementing **any** new module or feature, you must draft an endpoint plan (methods, paths, access levels, request/response shapes) and confirm it with the user. This also defines the endpoint access level policy (what should be public vs protected). **Do NOT skip this step.**

### Creating a new module

Read `.claude/rules/module-structure-guide.md`. This covers when to create a module, the two module types (standard vs non-standard), naming conventions, and the creation checklist.

### Implementing files inside a module

Read the corresponding file in `.claude/rules/module-implementation/`:
- Writing a `repo.ts` → read `repo.md`
- Writing a `types.ts` → read `types.md`
- Writing a `service.ts` → read `service.md`
- Writing a `controller.ts` → read `controller.md`

### Creating or modifying middleware

Read `.claude/rules/middleware-guide.md`. This covers auth, validation, role checks, bypass, and ownership middleware. The auth middleware has two variants — check `.claude/tech-stack.md` to determine whether auth-sessions are persisted (which changes the auth middleware implementation significantly).

### Setting up or extending error handling

Read `.claude/rules/error-handling-guide.md`. This covers the `AppError` class, `Errors` factory, domain-specific error converters (Prisma, Zod), and the error middleware.

### Adding comments to the codebase

Read `.claude/rules/commenting-guide.md`. This covers JSDoc-style comment conventions for routes and endpoints.

## Scope of Writes (Mandatory)

When invoked inside `backend/` (cwd is this directory or anywhere below it), write permissions are scoped tightly:

| Location | Access |
|---|---|
| Anywhere under `backend/**` | Read + write |
| `<root>/.claude/docs/` (monorepo root shared docs) | Read + write — **the docs-sync exception** (see below). Backend OWNS these. |
| `<root>/deployment/.claude/deployment-stack.md` | Read + write — **the deployment-sync exception** (see Deployment Work section below). Updated whenever a deployment-affecting change ships from this repo. |
| `<root>/deployment/CLAUDE.md` and `<root>/deployment/.claude/rules/**` | **Read only** — the deployment rule set itself is authored at parent level |
| `<root>/.claude/` root files (`prd.md`, `plan.md`, `CLAUDE.md`, `memory/`, `plans/`) | **Read only** |
| `<root>/frontend/**` | **Read only** — never write anywhere here, for any reason |

The mental model: this repo's Claude is a backend specialist. Read everything you need for context; write only inside backend code, backend-local docs/memory/plans, and the shared docs folder that this repo owns by design.

### Cross-cutting changes — escalate via TODO

If you discover during backend work that a file outside `backend/**` and outside `<root>/.claude/docs/` needs to change (e.g. master PRD needs a new feature description, a memory should be cross-cutting, the frontend PRD needs to be updated to consume a new endpoint), **do not attempt the edit**. Instead, at end-of-turn surface a:

```
### TODO for parent-level session

- `<root>/.claude/prd.md` — add `…` (because the new endpoint adds a feature)
- `<root>/frontend/.claude/prd.md` — note the new API surface for the dashboard
```

The user will then open a parent-level session at `<root>/` to apply those changes (the coordinator can edit anywhere).

## Memory & Plans (Mandatory)

This repo is part of the monorepo (`<root>/`). Memory and plans are **hierarchical** — shared store at the monorepo root, backend-only store here. Backend has **read-only** access to the shared store (per the scope-of-writes rule above); cross-cutting writes are escalated to parent-level via TODO.

| Location | Scope | This repo's access |
|---|---|---|
| `../.claude/memory/` | Shared with frontend | **Read only** — write via TODO escalation to parent |
| `.claude/memory/` (this repo) | Backend-only | Read + write |
| `../.claude/plan.md` | Active full-product plan | **Read only** |
| `../.claude/plans/` | Cross-cutting plans (span both repos) | **Read only** — write via TODO escalation to parent |
| `.claude/plans/` (this repo) | Backend-only plans | Read + write |

The in-repo memory **replaces** the auto-memory system (`~/.claude/projects/...`) entirely — never write there from this session forward.

**At session start:** load `../.claude/memory/MEMORY.md` AND `.claude/memory/MEMORY.md`. Open individual files when relevant.

**When saving a new memory:** decide scope first.
- Backend-only (workflow, conventions specific to this repo's code)? → write to `.claude/memory/<name>.md` + index it in `.claude/memory/MEMORY.md`.
- Cross-cutting (both repos / product-level)? → **do not write directly**. Surface as a TODO in the end-of-turn block; user runs a parent-level session to save it under `<root>/.claude/memory/`.
- When in doubt, save backend-local. Promotion to shared is cheaper than retraction.

Memory file format (matches the existing convention in `frontend/.claude/memory/`):

```markdown
---
name: <short title>
description: <one-line summary used to decide relevance>
type: <user | feedback | project | reference>
---

<body — for feedback/project, lead with the rule, then **Why:** and **How to apply:** lines>
```

**Plans:** the active full-product plan at `../.claude/plan.md` and cross-cutting plans in `../.claude/plans/` are read-only from here. Backend-only plans (single-module refactor, isolated endpoint family, etc.) go in `.claude/plans/`. Cross-cutting plans get drafted by escalating a TODO.

See `<root>/CLAUDE.md` for the full hierarchy and scope decision tree.

## Documentation Sync (Mandatory)

> This is **the** carve-out from the Scope of Writes rule. `<root>/.claude/docs/` is the only path outside `backend/**` that this repo's Claude may write to.

The product docs live at the **monorepo root**, at `../.claude/docs/` (i.e. one level up from this `backend/` directory). This folder is shared with the frontend repo — the backend **owns** these files (creates and updates them), the frontend reads them but never writes. This single-source setup means there's no manual cross-repo sync.

After **every** code change (new endpoint, modified feature, removed code, schema change, etc.), you MUST scan `../.claude/docs/` and update any affected `.md` files to reflect the change. Files include but are not limited to:

- `api-endpoints.md` — when endpoints are added, modified, or removed
- `entities.md` — when data models / Prisma schema change
- `flows.md` — when business flows change (auth, invitations, scheduled publishing, etc.)
- `authentication.md` — when auth logic changes
- `permissions.md` — when the permission vocabulary or owner-only actions change

If a relevant `.md` file does not exist yet in `../.claude/docs/`, **create it** rather than skipping the update.

**Do NOT wait for the user to ask.** This step is automatic and required on every change. The docs must stay in sync with the codebase at all times — the frontend relies on them as its source of truth for the API surface.

## Deployment Work (Mandatory)

Deployment work for the backend — Dockerfile, `docker-compose.yml`, GitHub Actions workflows, server provisioning, env vars, reverse proxy — is governed by the **dedicated rule set at `<root>/deployment/`**, NOT by this repo's `.claude/rules/`. The deployment rules are a separate `.claude/` ecosystem deliberately kept outside the per-repo rule sets so they can evolve independently.

### When this fires (in this repo)

Any user request that mentions or implies deployment of the backend: "deploy the backend", "set up CI/CD for this", "add a Dockerfile", "wire up GitHub Actions", "ship to prod", "configure nginx for the backend", etc.

### Required reading (in order)

1. `<root>/deployment/CLAUDE.md` — the deployment root rules.
2. `<root>/deployment/.claude/rules/planning-guide.md` — the mandatory `AskUserQuestion` rounds + the `deployment-stack.md` template.
3. The specific rule files in `<root>/deployment/.claude/rules/` relevant to the task (e.g. `tools/docker.md`, `tools/docker-compose.md`, `tools/github-actions.md`, plus `tools/docker-hub.md` OR `tools/ghcr.md` depending on registry choice).
4. `<root>/deployment/.claude/rules/env-vars-guide.md` — env-var enumeration and delivery strategy. Cross-reference with this repo's actual `.env.example` and any `process.env.*` references in `src/`.
5. `<root>/deployment/.claude/rules/server-provisioning-guide.md` — only if the planning answers say the server is not yet provisioned.
6. `<root>/deployment/.claude/rules/reverse-proxy-guide.md` — only if a domain + HTTPS is in scope.

### Workflow (when invoked at backend cwd)

The target is already pinned to backend by the cwd — skip the parent-level "backend/frontend/both" question. Then:

1. Survey this repo for existing deployment artifacts: `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `docker-entrypoint.sh`, `.github/workflows/*`, `.env.example`. Identify gaps.
2. Run the `planning-guide.md` `AskUserQuestion` rounds one round at a time. Lock the answers into `<root>/deployment/.claude/deployment-stack.md` (this repo IS allowed to write that one file, per the deployment-sync exception in the Scope of Writes table above) BEFORE writing any artifact.
3. Present the plan (which files will be created/modified inside `backend/**`, which GitHub secrets the user needs to add) and confirm with `AskUserQuestion` before writing.
4. Produce the artifacts inside `backend/**` per the relevant `tools/*.md` files. Backend artifacts go at the repo root (`Dockerfile`, `docker-compose.yml`, `.dockerignore`, `docker-entrypoint.sh` if Prisma) and `.github/workflows/deploy.yml`.
5. Update `<root>/deployment/.claude/deployment-stack.md` with the final state. **Do NOT wait for the user to ask** — this is automatic, same pattern as the Documentation Sync rule above.

### What you may NOT do from this repo

- **Do NOT edit `<root>/deployment/CLAUDE.md` or `<root>/deployment/.claude/rules/**`.** Those files describe HOW to deploy in general — they're authored at parent level. If you find a deployment rule is wrong or incomplete, surface it as a `### TODO for parent-level session` block instead of editing.
- **Do NOT touch frontend deployment artifacts.** If the deployment plan involves the frontend, escalate via TODO; do not reach into `<root>/frontend/**`.
- **Do NOT SSH into the user's server on their behalf.** Per `server-provisioning-guide.md` and `reverse-proxy-guide.md`, Claude prints commands and walks the user through them.
