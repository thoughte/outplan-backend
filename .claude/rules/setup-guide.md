# Project Setup Guide

This document describes how to set up a new backend project from scratch. Follow these steps exactly when the project has not been initialized yet.

## Before You Begin

Before starting any setup work, ensure that both `.claude/prd.md` and `.claude/tech-stack.md` exist. These files are created during the PRD step described in `CLAUDE.md`. If they do not exist, go back and follow the PRD creation workflow first.

If the user skips the PRD step and jumps straight to setup, use the `AskUserQuestion` tool to ask the user about their tech stack — including whether they want to persist auth-sessions — and create/update `.claude/tech-stack.md`.

The tech stack file is referenced during setup and by other rules (e.g. `config-and-libs-guide.md`, `middleware-guide.md`) to determine which dependencies to install and which auth pattern to implement.

**Why session persistence matters:**
- **Without sessions** — the auth middleware simply verifies the token with Firebase on every request and extracts the user from the decoded token. Straightforward, no session table needed.
- **With sessions** — the auth middleware stores token hashes in the database to avoid round trips to Firebase on every request. It also uses a refresh token hash to associate refreshed access tokens (which Firebase rotates hourly) with existing sessions. This requires an `AuthSession` model in the database and a full `auth-session` module.

Do NOT proceed with the setup until `.claude/tech-stack.md` exists and reflects the user's choices.

## Core Stack (Always)

Every backend project uses the following:

- **Runtime**: Node.js
- **Framework**: Express
- **Language**: TypeScript
- **Validation**: Zod
- **Environment Variables**: dotenv
- **CORS**: cors
- **Dev Server**: nodemon (with ts-node)

## Conditional Dependencies

These are added based on the project's requirements. Check the `.claude/tech-stack.md` file (if one exists) to determine which of these apply:

- **Database**: Prisma (with the appropriate adapter, e.g. `@prisma/adapter-pg` for PostgreSQL)
- **Authentication**: `firebase-admin` (when using Firebase Auth)

## Step-by-Step Setup

### 1. Initialize the project

```bash
npm init -y
```

### 2. Install core dependencies

```bash
npm install express cors dotenv zod
```

### 3. Install dev dependencies

```bash
npm install -D typescript ts-node nodemon @types/node @types/express @types/cors
```

### 4. Install conditional dependencies

If the project uses a database (check `.claude/tech-stack.md`):

```bash
npm install @prisma/client
npm install -D prisma
```

If using PostgreSQL specifically:

```bash
npm install @prisma/adapter-pg pg
npm install -D @types/pg
```

If the project uses Firebase Auth (check `.claude/tech-stack.md`):

```bash
npm install firebase-admin
```

### 5. Configure TypeScript — `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "es2016",
    "module": "commonjs",
    "rootDir": ".",
    "outDir": "dist",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "skipLibCheck": true,
    "types": ["node"]
  }
}
```

### 6. Configure nodemon — `nodemon.json`

```json
{
  "watch": ["src"],
  "ext": ".ts, .js",
  "ignore": [],
  "exec": "ts-node ./src/index.ts"
}
```

### 7. Configure package.json scripts

```json
{
  "scripts": {
    "dev": "nodemon",
    "build": "tsc",
    "start": "ts-node ./src/index.js"
  }
}
```

If using Prisma, also add:

```json
{
  "prisma": {
    "seed": "ts-node ./prisma/seed.ts"
  }
}
```

### 8. Create the source directory structure

```
src/
├── config/           # Configuration files (env, firebase, prisma, etc.)
├── errors/           # AppError class and error mappers (prisma, zod)
├── lib/              # External library wrappers (e.g. prisma client instance)
├── middleware/       # Express middleware (auth, error handling, validation, ownership checks)
├── modules/          # Feature modules (each with controller, service, repo, types)
├── shared/           # Shared utilities, types, enums, constants, helpers
├── index.ts          # Application entry point
└── routes.setup.ts   # Central route registration
```

### 9. Set up the entry point — `src/index.ts`

The entry point should follow this order:

1. Import dependencies
2. Read config variables
3. Create Express app
4. Apply CORS middleware
5. Apply JSON body parser
6. Register routes (via `routes.setup.ts`)
7. Apply error middleware (must be last)
8. Create HTTP server and listen

### 10. Set up environment config — `src/config/env.config.ts`

- Call `dotenv.config()` at the top
- Export a single `ENV_CONFIG` object with all env vars
- Provide sensible defaults where appropriate (e.g. `PORT` defaults to `4000`)

### 11. Set up shared files

- `src/shared/constants.ts` — API prefix (e.g. `/api/v1`), token prefixes
- `src/shared/routes.ts` — Central `ALL_ROUTES` object containing all route paths
- `src/shared/enums.ts` — `HttpHeader` and `HttpStatusCode` enums
- `src/shared/types.ts` — `ErrorCode`, `HttpCode`, `AuthenticatedRequest`
- `src/shared/helper.ts` — Small, focused utility functions

### 12. Set up error handling

- `src/errors/app.errors.ts` — `AppError` class with factory functions (`badRequest`, `unauthorized`, `forbidden`, `notFound`, `conflict`, `internal`)
- `src/errors/prisma.errors.ts` — Maps Prisma error codes to `AppError` (if using Prisma)
- `src/errors/zod.errors.ts` — Converts `ZodError` to `AppError` (if using Zod validation)
- `src/middleware/error.middleware.ts` — Catches all errors, converts Zod/Prisma errors to `AppError`, returns consistent JSON response

### 13. Set up route registration — `src/routes.setup.ts`

- Export a `setupAppRoutes(app)` function
- Register routes in order: health check → public endpoints → auth middleware → authenticated endpoints → admin middleware → admin endpoints
- All module routes are prefixed with `API_PREFIX`

### 14. Set up Prisma (if applicable)

```bash
npx prisma init
```

- Configure the schema at `prisma/schema.prisma`
- Create the Prisma client instance in `src/lib/prisma.ts`
- Create an empty seed file at `prisma/seed.ts`

## Rules

1. Always use this exact stack. Do not substitute libraries (e.g. no joi instead of zod, no class-validator, no morgan).
2. Every file referenced above must exist before the project is considered "set up".
3. The dev server must start successfully with `npm run dev` before moving on to feature work.
