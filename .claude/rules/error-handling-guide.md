# Error Handling Guide

This document defines how error handling is structured across the codebase.

## Overview

All errors in the application flow through a single pipeline:

```
Raw error (Prisma, Zod, runtime, etc.)
  → Service layer catches and converts to AppError
  → Controller passes to next(e)
  → Error middleware converts any remaining raw errors and sends response
```

The client always receives a consistent JSON error shape. No raw library errors ever reach the client.

## Directory Structure

```
src/errors/
├── app.errors.ts       # AppError class + Errors factory object (always exists)
├── prisma.errors.ts    # Prisma error → AppError converter (if using Prisma)
└── zod.errors.ts       # Zod error → AppError converter (if using Zod)
```

## `app.errors.ts` — The Core

This file defines two things:

### 1. `AppError` Class

The single error type used throughout the application. Extends `Error` with structured fields:

```ts
export class AppError extends Error {
  readonly code: ErrorCode;      // e.g. "BAD_REQUEST", "NOT_FOUND"
  readonly status: number;       // HTTP status code
  readonly details?: unknown;    // optional extra context
  readonly expose: boolean;      // whether to show message to client
}
```

- `code` — maps to the `ErrorCode` type defined in `src/shared/types.ts`
- `status` — maps to `HttpStatusCode` enum values from `src/shared/enums.ts`
- `expose` — defaults to `true`. Set to `false` for internal errors where the message should not reach the client

### 2. `Errors` Factory Object

A set of factory functions for creating `AppError` instances. These are the **only** way to create errors throughout the codebase — never instantiate `AppError` directly outside this file.

```ts
export const Errors = {
  badRequest: (message: string, details?: unknown) => ...,
  unauthorized: (message = "Unauthorized") => ...,
  forbidden: (message = "Forbidden") => ...,
  notFound: (message = "Not found") => ...,
  conflict: (message: string, details?: unknown) => ...,
  internal: (message = "Internal server error", details?: unknown) => ...,
};
```

**Rules for the factory:**
- Each factory maps to one `ErrorCode` and one `HttpStatusCode`
- `badRequest` and `conflict` accept optional `details` for extra context
- `internal` sets `expose: false` — the client gets the message but no details about internals
- All others default `expose: true`
- Default messages are provided where it makes sense (unauthorized, forbidden, notFound, internal)

**When to add a new factory:** If a new `ErrorCode` is added to `src/shared/types.ts` and a new `HttpStatusCode` is added to `src/shared/enums.ts`, add a corresponding factory here. The three files must stay in sync.

## Domain-Specific Error Files

For each library that can throw its own error types, create a converter file that maps those errors to `AppError`. These files:

1. Accept the raw library error
2. Check its type/code
3. Return the appropriate `AppError` using the `Errors` factory, or `null` if unrecognized

### `prisma.errors.ts`

Maps Prisma's known error codes to application errors:

```ts
import { Prisma } from "../../generated/prisma/client";
import { Errors } from "./app.errors";

export function prismaToAppError(err: unknown) {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002")
      return Errors.conflict("Duplicate value", err.meta);
    if (err.code === "P2025")
      return Errors.notFound("Resource not found");
  }
  return null;
}
```

**Rules:**
- Only handle `PrismaClientKnownRequestError` — let unknown Prisma errors fall through
- Return `null` for unrecognized error codes — the error middleware will handle them as generic internal errors
- Add new code mappings as the application encounters them (e.g. `P2003` for foreign key violations)

### `zod.errors.ts`

Converts Zod validation errors to application errors:

```ts
import z, { ZodError } from "zod";
import { Errors } from "./app.errors";

export function zodToAppError(err: ZodError) {
  return Errors.badRequest("Invalid request", z.treeifyError(err));
}
```

**Rules:**
- Always maps to `badRequest`
- Uses `z.treeifyError()` to provide structured validation error details
- The details object gives the client a tree of field-level errors

### When to Create a New Domain Error File

When a new library is added that can throw its own error types (e.g. a payment provider, an external API client), create a `<library>.errors.ts` file following the same pattern:

1. Import the library's error types
2. Create a `<library>ToAppError(err)` function
3. Map known error codes/types to `Errors` factory calls
4. Return `null` for unrecognized errors
5. Wire it into the error middleware

## Error Middleware

The error middleware (`src/middleware/error.middleware.ts`) is the final stop for all errors. It:

1. Checks if the error is a `ZodError` → converts via `zodToAppError`
2. Checks if the error is a Prisma error → converts via `prismaToAppError`
3. If the error is now an `AppError` → sends structured JSON response
4. If the error is still unrecognized → sends a generic internal server error

```ts
export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof ZodError) err = zodToAppError(err);

  const prismaErr = prismaToAppError(err);
  if (prismaErr) err = prismaErr;

  if (err instanceof AppError) {
    return res.status(err.status).json({
      code: err.code,
      message: err.message,
      details: err.details,
    });
  }

  const fallback = Errors.internal();
  return res.status(fallback.status).json({
    code: fallback.code,
    message: fallback.message,
  });
}
```

**Rules:**
- Must be registered **last** in `src/index.ts` (after all routes): `app.use(errorMiddleware)`
- When adding a new domain error file, add its conversion check here following the same pattern
- The fallback always returns a generic internal error — never expose raw error details to the client
- The response shape is always `{ code, message, details? }`

## Adding Error Handling for a New Library

When a new library is introduced that can throw errors:

1. Create `src/errors/<library>.errors.ts` with a `<library>ToAppError(err)` function
2. Map known error types/codes to `Errors` factory calls
3. Return `null` for unrecognized errors
4. Add the conversion check in `src/middleware/error.middleware.ts` before the `AppError` check
