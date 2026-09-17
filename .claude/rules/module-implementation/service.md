# Service Layer Rules

This document defines the strict rules for implementing a service file (`service.ts`) inside a module.

## Purpose

The service layer contains all business logic. It sits between the controller and the repo — it consumes repo methods, applies business rules, and returns mapped DTOs.

## File Structure

Every service file must follow this exact three-section layout:

```ts
import { AppError, Errors } from "../../errors/app.errors";
import { <Model>Repo } from "./repo";
import {
  Create<Model>DTO,
  Update<Model>DTO,
  map<Model>ResponseDTO,
  <Model>ResponseDTO,
} from "./types";

/////////////////
// INTERFACE
////////////////

export interface I<Model>Service {
  // method signatures
}

/////////////////
// IMPL
////////////////

// individual async function implementations

/////////////////
// EXPORTS
////////////////

export const <Model>Service: I<Model>Service = {
  // method references
};
```

## Interface

- Named `I<Model>Service` (e.g. `IUserService`, `IAuthSessionService`)
- Every method must be declared here with full type annotations
- Input types use DTOs from `types.ts` or primitive types
- Output types use `<Model>ResponseDTO` from `types.ts` — never raw Prisma types
- Exported so the service locator can reference the interface

## Methods

### Starting Methods

When creating a new module, start with only the basic methods that are immediately needed. Add more as the application requires them. The standard starting set is:

#### `create`

```ts
async function create(dto: Create<Model>DTO): Promise<<Model>ResponseDTO> {
  try {
    const created = await <Model>Repo.create(dto);
    return map<Model>ResponseDTO(created);
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw Errors.badRequest("Error creating <model>");
  }
}
```

- Input: `Create<Model>DTO` from types
- Calls repo `create`
- Maps result with mapper function
- Returns `<Model>ResponseDTO`

#### `findById`

```ts
async function findById(
  id: string,
  args?: {
    with<Relation>?: boolean;
  },
): Promise<<Model>ResponseDTO | null> {
  try {
    const <model> = await <Model>Repo.findById(id, {
      with<Relation>: args?.with<Relation>,
    });
    if (!<model>) return null;

    return map<Model>ResponseDTO(<model>, {
      <relation>: <model>.<relation>,
    });
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw Errors.badRequest(`Error fetching <model> by id: ${id}`);
  }
}
```

- Returns `null` if not found — does NOT throw
- Passes relation args through to the repo
- Passes loaded relations from the result into the mapper

#### `getById`

```ts
async function getById(
  id: string,
  args?: {
    with<Relation>?: boolean;
  },
): Promise<<Model>ResponseDTO> {
  try {
    const <model> = await <Model>Repo.findById(id, {
      with<Relation>: args?.with<Relation>,
    });
    if (!<model>) throw Errors.notFound(`Cannot find <model> with id: ${id}`);

    return map<Model>ResponseDTO(<model>, {
      <relation>: <model>.<relation>,
    });
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw Errors.badRequest(`Error fetching <model> by id: ${id}`);
  }
}
```

- Throws `Errors.notFound(...)` if not found — guaranteed to return a result
- Used when the resource **must** exist (e.g. controller needs to return data)

### `findById` vs `getById`

This is a critical distinction:

| Method | Returns | When not found | Use when |
|--------|---------|----------------|----------|
| `findById` | `ResponseDTO \| null` | Returns `null` | Absence is acceptable (e.g. checking if user exists before creating) |
| `getById` | `ResponseDTO` | Throws `Errors.notFound` | Resource must exist (e.g. fetching authenticated user's profile) |

Both methods should exist for any module where this distinction matters.

### Paginated List Methods

When a module has a list endpoint, the service needs a paginated list method. This method constructs the where clause, normalizes pagination, fetches data + count atomically, and returns a `PaginatedResponse`.

```ts
async function listUsers(
  dto: ListUserDTO,
  args?: {
    with<Relation>?: boolean;
  },
): Promise<PaginatedResponse<UserResponseDTO, UserOrderKey>> {
  try {
    // 1. Construct where clause
    const where: UserWhereInput = {};
    const and: UserWhereInput[] = [];

    const { id, role, status, search } = dto;
    if (id) and.push({ id });
    if (role) and.push({ role });
    if (status) and.push({ status });
    if (search)
      and.push({
        OR: [
          { email: { contains: search, mode: "insensitive" } },
          { displayName: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } },
        ],
      });

    if (and.length > 0) where.AND = and;

    // 2. Construct pagination data
    const meta = normalizePagination<UserOrderKey>(dto, USER_ORDER_KEYS);
    const orderBy = meta.orderBy
      ? ({
          [meta.orderBy]: meta.order,
        } as Prisma.<Model>OrderByWithRelationInput)
      : undefined;

    // 3. Fetch data + count atomically
    const { items, total } = await prisma.$transaction(async (tx) => {
      const items = await <Model>Repo.findMany(
        { where, orderBy, skip: meta.skip, take: meta.take },
        { with<Relation>: args?.with<Relation> },
        tx,
      );
      const { count } = await <Model>Repo.count({ where }, tx);

      return { items, total: count };
    });

    // 4. Map and return paginated response
    return mapPaginatedResponse(
      items.map((item) =>
        map<Model>ResponseDTO(item, {
          <relation>: item.<relation>,
        }),
      ),
      total,
      meta,
    );
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw Errors.badRequest(`Error fetching <models>`);
  }
}
```

**Rules for paginated list methods:**

1. **Where clause construction** — build the where clause from the DTO's filter fields using an `AND` array. Each filter is pushed as a separate entry. Only apply `where.AND` if there are entries.
2. **Search** — use an `OR` array with `{ contains: search, mode: "insensitive" }` across all searchable text fields.
3. **Pagination** — call `normalizePagination<OrderKeyType>(dto, ORDER_KEYS)` to get validated `page`, `pageSize`, `order`, `orderBy`, `skip`, `take`.
4. **OrderBy** — construct the Prisma `orderBy` object from `meta.orderBy` and `meta.order`. Cast to `Prisma.<Model>OrderByWithRelationInput`.
5. **Atomic read + count** — use `prisma.$transaction()` to run `findMany` and `count` atomically. Pass the transaction client `tx` to both repo calls to ensure consistency.
6. **Response** — call `mapPaginatedResponse(mappedData, total, meta)` to construct the final `PaginatedResponse`.
7. **Return type** — always `Promise<PaginatedResponse<<Model>ResponseDTO, <Model>OrderKey>>`.
8. **Import** — import `normalizePagination`, `mapPaginatedResponse`, `PaginatedResponse` from `../../shared/pagintation.types`. Import `prisma` from `../../lib/prisma` for the transaction.

### Domain-Specific Methods

Add these as the application needs them. Examples:

- `findByFirebaseUid(uid, args)` — custom lookup by external ID
- `updateRole(id, role)` — targeted update for a specific field
- `updateStatus(id, status)` — targeted update for a specific field
- `updateProfile(id, dto)` — update a subset of fields via a DTO
- `getAllByUser(userId, dto, args)` — fetch all records belonging to a user with pagination
- `logoutSessionById(id)` — domain action that maps to an update

**Rules for domain-specific methods:**
1. Name them after the action they perform, not the database operation
2. Accept only the parameters they need — not the full update DTO if only one field changes
3. Follow the same error handling pattern as basic methods

## Error Handling

Every service method must use this exact pattern:

```ts
try {
  // service logic
} catch (e) {
  if (e instanceof AppError) throw e;
  throw Errors.badRequest("Descriptive error message");
}
```

### Why This Pattern

1. `if (e instanceof AppError) throw e;` — if the error is already an `AppError` (from another service, the repo via Prisma error mapping, or thrown explicitly in this method), rethrow it unchanged. This preserves the original error code and status.
2. `throw Errors.badRequest(...)` — any other error (unexpected Prisma error, runtime error, etc.) gets wrapped in a generic `AppError`. This prevents raw errors from leaking to the client.

### Throwing Explicit Errors

Within the try block, throw specific errors for business rule violations:

```ts
if (user.status !== UserStatus.active)
  throw Errors.forbidden("User account status is not active");

if (existingSession)
  throw Errors.forbidden("Session already exists");

if (!decoded.email)
  throw Errors.badRequest("Email id not found");
```

Use the appropriate error factory:
- `Errors.badRequest(msg)` — invalid input or state
- `Errors.unauthorized(msg)` — not authenticated
- `Errors.forbidden(msg)` — authenticated but not allowed
- `Errors.notFound(msg)` — resource does not exist
- `Errors.conflict(msg)` — duplicate or conflicting state
- `Errors.internal(msg)` — unexpected server error

## Relation Args

When a service method loads relations, it must:

1. Accept an `args` parameter matching the repo's relation options
2. Pass each relation flag through to the repo individually:

```ts
const user = await UserRepo.findById(id, {
  withAuthSessions: args?.withAuthSessions,
  withWallet: args?.withWallet,
});
```

3. Pass the loaded relations from the result into the mapper:

```ts
return mapUserResponseDTO(user, {
  authSessions: user.authSessions,
  wallet: user.wallet,
});
```

## Consuming Other Services

Services can call other services through the `ServiceLocator` — never by importing them directly:

```ts
import ServiceLocator from "../service.locator";

const user = await ServiceLocator.userService.findByFirebaseUid(decoded.uid);
```

This is the only acceptable way to access another module's service.

## What Does NOT Belong in a Service

- Direct database queries (that's the repo's job)
- HTTP-specific logic (req, res, next — that's the controller's job)
- Raw Prisma types in return values (always map to DTOs)
- Importing another module's repo directly (use ServiceLocator for cross-module access)

## Non-Standard Services (Orchestration Modules)

For modules that don't own a Prisma model (e.g. `authentication`):

1. Define the interface in a separate `service.interface.ts` file
2. Name the implementation file after the provider: `<provider>.service.ts` (e.g. `firebase.service.ts`)
3. The implementation interface extends the base interface:

```ts
// service.interface.ts
export interface IAuthService {
  login(dto: AuthRequestDTO): Promise<AuthResponseDTO>;
  logout(sessionId: string): Promise<boolean>;
}

// firebase.service.ts
export interface IFirebaseAuthService extends IAuthService {}
```

4. These services orchestrate calls to other services via `ServiceLocator` instead of calling repos directly
5. Same error handling pattern applies
