# Repository Layer Rules

This document defines the strict rules for implementing a repository file (`repo.ts`) inside a module.

## Purpose

The repo layer is the **only** layer that talks to the database. It contains pure CRUD operations — no validations, no business logic, no DTO mapping.

## File Structure

Every repo file must follow this exact three-section layout:

```ts
import { Prisma, <Model> } from "../../../generated/prisma/client";
import { prisma } from "../../lib/prisma";
import { Extended<Model> } from "../../shared/extended-types/<model>.extended";

/**
 * <Model> Repository
 * This file is the repository layer for <model>.
 * It only contains pure CRUD methods; no validations, business logic, or mapping.
 *
 */

/////////////////
// INTERFACE
////////////////

export interface I<Model>Repo {
  // method signatures
}

/////////////////
// IMPL
////////////////

// individual async function implementations

/////////////////
// EXPORTS
////////////////

export const <Model>Repo: I<Model>Repo = {
  // method references
};
```

## Interface

- Named `I<Model>Repo` (e.g. `IUserRepo`, `IAuthSessionRepo`)
- Every method that will be implemented must be declared here first
- Full type annotations on all parameters and return types
- Exported so the service layer can reference the interface

## Methods

### Standard Methods

Every repo starts with these base methods. Only include the ones the module actually needs:

#### `create`

```ts
create(
  data: Prisma.<Model>UncheckedCreateInput,
  tx?: Prisma.TransactionClient,
): Promise<<Model>>;
```

- Input: `Prisma.<Model>UncheckedCreateInput` — always use `Unchecked` variant to allow passing foreign keys directly
- Output: raw Prisma model type (no relations)
- Transaction support via optional `tx`

#### `findById`

```ts
findById(
  id: string,
  args?: {
    with<Relation>?: boolean;
    // one entry per relation
  },
  tx?: Prisma.TransactionClient,
): Promise<Extended<Model> | null>;
```

- Output: `Extended<Model> | null` — always return the extended type so services can access relations
- Uses Prisma `findUnique` with conditional `include`

#### `findFirst`

```ts
findFirst(
  {
    where,
    orderBy,
  }: {
    where: Prisma.<Model>WhereInput;
    orderBy?: Prisma.<Model>OrderByWithRelationInput;
  },
  args?: {
    with<Relation>?: boolean;
  },
  tx?: Prisma.TransactionClient,
): Promise<Extended<Model> | null>;
```

- First parameter is always a destructured object with `where` (required) and `orderBy` (optional)
- Output: `Extended<Model> | null`

#### `findMany`

```ts
findMany(
  {
    where,
    orderBy,
    skip,
    take,
  }: {
    where: Prisma.<Model>WhereInput;
    orderBy?: Prisma.<Model>OrderByWithRelationInput;
    skip?: number;
    take?: number;
  },
  args?: {
    with<Relation>?: boolean;
  },
  tx?: Prisma.TransactionClient,
): Promise<Extended<Model>[]>;
```

- Supports pagination via `skip` and `take`
- Output: array of `Extended<Model>`

#### `count`

```ts
count(
  {
    where,
  }: {
    where?: Prisma.<Model>WhereInput;
  },
  tx?: Prisma.TransactionClient,
): Promise<{ count: number }>;
```

- Returns `{ count: number }` — wraps `prisma.<model>.count()` result in an object
- `where` is optional — if omitted, counts all records
- Add this method when the module has a paginated list endpoint (needed for total count in pagination)

**Implementation:**
```ts
async function count(
  { where }: { where?: Prisma.<Model>WhereInput },
  tx?: Prisma.TransactionClient,
): Promise<{ count: number }> {
  const db = tx ?? prisma;
  return { count: await db.<model>.count({ where }) };
}
```

#### `update`

```ts
update(
  id: string,
  data: Prisma.<Model>UncheckedUpdateInput,
  tx?: Prisma.TransactionClient,
): Promise<<Model>>;
```

- Input: `Prisma.<Model>UncheckedUpdateInput`
- Output: raw Prisma model type (no relations)

#### `updateMany`

```ts
updateMany(
  where: Prisma.<Model>WhereInput,
  data: Prisma.<Model>UncheckedUpdateManyInput,
  tx?: Prisma.TransactionClient,
): Promise<{ count: number }>;
```

- Only add this method when the module needs bulk updates
- Output: `{ count: number }`

## Implementation Rules

### Transaction Support

Every method must accept an optional `tx` parameter and use this exact pattern:

```ts
const db = tx ?? prisma;
```

Then use `db` for all database calls within that method. Never use `prisma` directly after this line.

### Relation Inclusion

For `findById`, `findFirst`, and `findMany`, use the `args` parameter to conditionally include relations:

```ts
include: {
  authSessions: args?.withAuthSessions === true,
  wallet: args?.withWallet === true,
}
```

Always compare with `=== true` explicitly.

### Return Types

- **`create`, `update`**: return the raw Prisma model type — no relations loaded
- **`findById`, `findFirst`, `findMany`**: return the `Extended<Model>` type — relations may or may not be present depending on args
- **`count`, `updateMany`**: return `{ count: number }`

### Error Handling

Repos do **not** handle errors. Let errors propagate to the service layer. Do not wrap methods in try/catch blocks that just rethrow.

### What Does NOT Belong in a Repo

- Business logic or validation
- DTO mapping or response formatting
- Calls to other repos or services
- Direct use of `Errors` factory (that's the service layer's job)
- Hardcoded where clauses — always accept them as parameters

## Extended Types

Before creating a repo, ensure the model's extended type exists at `src/shared/extended-types/<model>.extended.ts`:

```ts
import { Prisma } from "../../../generated/prisma/client";

export const extended<Model> = {
  include: {
    <relation1>: true,
    <relation2>: true,
  },
} satisfies Prisma.<Model>DefaultArgs;

export type Extended<Model> = Prisma.<Model>GetPayload<typeof extended<Model>>;
```

The extended type must list **all** possible relations for the model. The repo controls which ones are actually loaded at query time via the `args` parameter.
