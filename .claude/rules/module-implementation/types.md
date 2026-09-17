# Types Layer Rules

This document defines the strict rules for implementing a types file (`types.ts`) inside a module.

## Purpose

The types file is the single source of truth for a module's input validation, DTOs, response shapes, and mapper functions. Everything related to data shape lives here.

## File Structure

```ts
import { <Model>, <RelatedModel>, ... } from "../../../generated/prisma/client";
import z from "zod";
import { PaginatedRequestDTO } from "../../shared/pagintation.types";
// import related module response DTOs and mappers as needed

// --- Zod Schemas (input validation) ---

export const Create<Model>Schema = z.object({ ... });
export type Create<Model>DTO = z.infer<typeof Create<Model>Schema>;

export const Update<Model>Schema = z.object({ ... });
export type Update<Model>DTO = z.infer<typeof Update<Model>Schema>;

// --- Order Keys (for list endpoints) ---

export const <MODEL>_ORDER_KEYS = ["field1", "field2", ...];
export type <Model>OrderKey = (typeof <MODEL>_ORDER_KEYS)[number];

// --- List Schemas (for list/search endpoints) ---

export const List<Model>QuerySchema = z.object({ ... });
export type List<Model>Query = z.infer<typeof List<Model>QuerySchema>;

export const List<Model>BodySchema = z.object({ ... });
export type List<Model>Body = z.infer<typeof List<Model>BodySchema>;

export type List<Model>DTO = List<Model>Query & List<Model>Body & PaginatedRequestDTO<<Model>OrderKey>;

// --- Response DTO (plain TypeScript) ---

export type <Model>ResponseDTO = { ... };

// --- Mapper Function ---

export function map<Model>ResponseDTO( ... ): <Model>ResponseDTO { ... }
```

## Zod Schemas (Input Validation)

### When to Create a Schema

- **`Create<Model>Schema`** — always create this. Defines the shape of data required to create the entity.
- **`Update<Model>Schema`** — always create this. Defines the shape of data that can be updated. Most fields should be `.optional()` since updates are partial.
- **Additional schemas** — create when the module has custom request bodies (e.g. `AuthRequestSchema` for login).

### Schema Rules

1. Use `z.object({})` — always a flat object schema
2. Use `z.string().min(1)` for required strings — never allow empty strings
3. Use `.optional()` for fields that are not required
4. Use `z.email()` for email fields
5. Use `z.coerce.date()` for date fields that may arrive as strings
6. Use `z.json()` for unstructured JSON fields
7. Every schema must be exported and named in PascalCase: `Create<Model>Schema`, `Update<Model>Schema`

### DTO Inference

Every Zod schema must have a corresponding inferred type directly below it:

```ts
export const Create<Model>Schema = z.object({ ... });
export type Create<Model>DTO = z.infer<typeof Create<Model>Schema>;
```

Never manually define a type that duplicates a Zod schema — always use `z.infer`.

## Order Keys and List Types (for list/search endpoints)

When a module has a list endpoint, it needs order keys, a query schema, a body schema, and a combined DTO.

### Order Keys

Define the allowed sort fields as a constant array, then derive the type from it:

```ts
export const USER_ORDER_KEYS = [
  "email",
  "phone",
  "displayName",
  "role",
  "status",
  "createdAt",
];
export type UserOrderKey = (typeof USER_ORDER_KEYS)[number];
```

**Rules:**
1. Named `<MODEL>_ORDER_KEYS` in `UPPER_SNAKE_CASE` (e.g. `USER_ORDER_KEYS`, `AUTH_SESSION_ORDER_KEYS`)
2. The type is named `<Model>OrderKey` in PascalCase
3. Only include fields that are meaningful to sort by — not every model field
4. The type is derived using `(typeof <MODEL>_ORDER_KEYS)[number]` — never manually define it

### List Query Schema (pagination params)

Validates pagination params that come from the URL query string:

```ts
export const ListUserQuerySchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().optional(),
    order: z.enum(["asc", "desc"]).optional(),
    orderBy: z.enum(USER_ORDER_KEYS).optional(),
  })
  .refine((v) => (v.order ? !!v.orderBy : true), {
    message: "order requires orderBy",
    path: ["order"],
  });
export type ListUserQuery = z.infer<typeof ListUserQuerySchema>;
```

**Rules:**
1. Named `List<Model>QuerySchema` / `List<Model>Query`
2. Always includes `page`, `pageSize`, `order`, `orderBy` — all optional
3. Uses `z.coerce.number()` for page/pageSize since query params arrive as strings
4. Uses `z.enum(<ORDER_KEYS>)` for `orderBy` to restrict to valid sort fields
5. Uses `.refine()` to enforce that `order` requires `orderBy`

### List Body Schema (filter/search criteria)

Validates the request body filters:

```ts
export const ListUserBodySchema = z.object({
  id: z.string().optional(),
  role: z.enum(UserRole).optional(),
  status: z.enum(UserStatus).optional(),
  search: z.string().optional(),
});
export type ListUserBody = z.infer<typeof ListUserBodySchema>;
```

**Rules:**
1. Named `List<Model>BodySchema` / `List<Model>Body`
2. All fields are `.optional()` — filters are never required
3. Use `z.enum(PrismaEnum)` for Prisma enum fields (e.g. `z.enum(UserRole)`)
4. Include a `search` field when the endpoint supports text search

### Combined List DTO

Combine the query, body, and pagination types into a single DTO used by the service:

```ts
export type ListUserDTO = ListUserQuery &
  ListUserBody &
  PaginatedRequestDTO<UserOrderKey>;
```

**Rules:**
1. Named `List<Model>DTO`
2. Intersection of `List<Model>Query & List<Model>Body & PaginatedRequestDTO<<Model>OrderKey>`
3. Import `PaginatedRequestDTO` from `../../shared/pagintation.types`

## Response DTO (Plain TypeScript)

Response DTOs define what the API returns to the client. These are **not** Zod schemas — they are plain TypeScript types.

### Rules

1. Named `<Model>ResponseDTO` (e.g. `UserResponseDTO`, `AuthSessionResponseDTO`)
2. All properties must be `readonly`
3. Base model fields are always included (id, timestamps, core fields)
4. Related entity fields are **optional** — they are only present when explicitly loaded:

```ts
export type UserResponseDTO = {
  readonly id: string;
  readonly email?: string | null;
  readonly role: UserRole;
  readonly createdAt: Date;

  // Relations — optional, only present when loaded
  readonly authSessions?: AuthSessionResponseDTO[];
  readonly wallet?: WalletResponseDTO;
};
```

5. Use the related module's `ResponseDTO` type for relations — never use raw Prisma types in response DTOs
6. Nullable database fields should be typed as `type | null` (e.g. `string | null`)
7. Never expose sensitive fields (raw tokens, password hashes, internal IDs that shouldn't be public)

## Mapper Functions

### Purpose

Mapper functions convert raw Prisma entities (from the repo) into response DTOs. They are the **only** place where this conversion happens.

### Signature

The standard pattern uses an optional `args` parameter:

```ts
export function map<Model>ResponseDTO(
  <model>: <Model>,
  args?: {
    <relation1>?: <RelatedModel>[];
    <relation2>?: <RelatedModel> | null;
  },
): <Model>ResponseDTO
```

For modules with few relations, a destructured default parameter is also acceptable:

```ts
export function map<Model>ResponseDTO(
  <model>: <Model>,
  { <relation> }: { <relation>?: <RelatedModel> } = {},
): <Model>ResponseDTO
```

- First parameter: the raw Prisma model entity
- Second parameter: optional object containing related entities (either `args?` or destructured with `= {}` default)
- Return type: the module's `ResponseDTO`

### Rules

1. **One mapper per module** — named `map<Model>ResponseDTO`
2. **Map base fields directly** — copy fields from entity to DTO by name
3. **Map relations using their mappers** — never manually construct a related DTO:

```ts
authSessions: args?.authSessions
  ? args.authSessions.map((s) => mapAuthSessionResponseDTO(s))
  : [],
```

4. **Default to empty array for collection relations** — if the relation is not provided, return `[]`
5. **Default to undefined for single relations** — if the relation is not provided, return `undefined`
6. **Import related mappers from their modules** — e.g. `import { mapAuthSessionResponseDTO } from "../auth-session/types"`

### Example

```ts
export function mapUserResponseDTO(
  user: User,
  args?: {
    authSessions?: AuthSession[];
    wallet?: Wallet | null;
  },
): UserResponseDTO {
  const mapped: UserResponseDTO = {
    id: user.id,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    authSessions: args?.authSessions
      ? args.authSessions.map((s) => mapAuthSessionResponseDTO(s))
      : [],
    wallet: args?.wallet ? mapWalletResponseDTO(args.wallet) : undefined,
  };

  return mapped;
}
```

## What Does NOT Belong in Types

- Business logic or validation beyond schema parsing
- Database queries or repo calls
- Service logic or orchestration
- Error handling (no try/catch, no `Errors` usage)