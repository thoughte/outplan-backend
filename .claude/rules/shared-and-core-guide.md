# Shared & Core Files Guide

This document defines the rules for the `src/shared/` directory and the core application files (`routes.setup.ts`, `service.locator.ts`). These files are the backbone that everything else depends on.

## Shared Directory Structure

```
src/shared/
├── constants.ts          # Application-wide constant values
├── enums.ts              # HTTP enums (headers, status codes)
├── types.ts              # Application-wide type definitions
├── routes.ts             # Central route path definitions
├── helper.ts             # Small, focused utility functions
├── pagintation.types.ts  # Pagination DTOs, normalizer, and response mapper
└── extended-types/       # Prisma extended types (one per model)
    ├── user.extended.ts
    └── auth-session.extended.ts
```

## `constants.ts`

Holds application-wide constant values that are referenced across the codebase.

```ts
export const API_PREFIX = "/api/v1";
export const ADMIN_ROUTE_API_CONSTANT = "/admin";
export const AUTH_TOKEN_PREFIX = "Bearer ";
```

- `API_PREFIX` — prepended to all controller registrations in `routes.setup.ts`
- `ADMIN_ROUTE_API_CONSTANT` — used inside `routes.ts` to prefix admin-only route paths (e.g. `${ADMIN_ROUTE_API_CONSTANT}/users` → `/admin/users`). The full URL becomes `API_PREFIX + ADMIN_ROUTE_API_CONSTANT + path` (e.g. `/api/v1/admin/users`).

**Rules:**
- One constant per export — no objects or grouped exports
- Use `UPPER_SNAKE_CASE` naming
- Only values that are used across multiple files belong here
- Module-specific constants stay inside their module

## `enums.ts`

Defines HTTP-related enums used by middleware, controllers, and error handling.

```ts
export enum HttpHeader {
  auth = "authorization",
  user_agent = "user-agent",
  forwarded_for = "x-forwarded-for",
  real_ip = "x-real-ip",
  refresh_token_hash = "x-refresh-token-hash",
  access_token = "x-access-token",
  refresh_token = "x-refresh-token",
}

export enum HttpStatusCode {
  ok = 200,
  created = 201,
  accepted = 202,
  bad_request = 400,
  unauthorized = 401,
  payment_required = 402,
  forbidden = 403,
  not_found = 404,
  method_not_allowed = 405,
  conflict = 409,
  rate_limited = 429,
  internal = 500,
}
```

**Rules:**
- `HttpHeader` — use `snake_case` keys, lowercase string values matching actual header names. Add custom headers as needed (e.g. `x-refresh-token-hash` for the auth session flow).
- `HttpStatusCode` — use `snake_case` keys, numeric values matching HTTP status codes. Include all status codes the application uses.
- Only HTTP-related enums go here. Domain enums (UserRole, OrderStatus, etc.) are defined in the Prisma schema and imported from the generated client (`generated/prisma/enums`)
- When adding a new `HttpStatusCode`, check if a corresponding `ErrorCode` and `Errors` factory function need to be added too (see `error-handling-guide.md`)

## `types.ts`

Defines application-wide TypeScript types used across multiple layers.

```ts
export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL"
  | "PAYMENT_REQUIRED"
  | "METHOD_NOT_ALLOWED";

export type HttpCode = ErrorCode | "OK" | "CREATED" | "ACCEPTED";

export interface AuthenticatedRequest extends Request {
  auth?: {
    userId: string;
    sessionId: string;
  };
}
```

**Rules:**
- `ErrorCode` — union of all possible error codes. Must stay in sync with `Errors` factory in `app.errors.ts`
- `HttpCode` — extends `ErrorCode` with success codes
- `AuthenticatedRequest` — extends Express `Request` with optional `auth` property. Used by all authenticated middleware and controllers
- Only types used across multiple layers belong here. Module-specific types stay in their `types.ts`

## `routes.ts`

Central definition of all API route paths. Every route in the application must be defined here.

```ts
import { ADMIN_ROUTE_API_CONSTANT } from "./constants";

export const ALL_ROUTES = {
  HEALTH_CHECK: "/health-check",

  // Authentication Routes
  LOGIN: "/login",
  LOGOUT: "/logout",

  // AuthSession Routes
  AUTH_SESSION: "/auth-sessions",
  LIST_AUTH_SESSIONS: "/auth-sessions/list",
  AUTH_SESSION_ID: "/auth-sessions/:id",
  LOGOUT_AUTH_SESSION: "/auth-sessions/logout/:id",
  LOGOUT_ALL_AUTH_SESSIONS: "/auth-sessions/logout",

  // User Routes
  USER: "/users",
  LIST_USERS: `${ADMIN_ROUTE_API_CONSTANT}/users`,
};
```

**Rules:**
1. All route keys use `UPPER_SNAKE_CASE`
2. All route values must start with `/`
3. Group routes by module with a comment header (e.g. `// Authentication Routes`)
4. Route params use `:paramName` syntax (e.g. `/auth-sessions/:id`)
5. Add the route constant here **before** creating the controller endpoint
6. Never hardcode route strings in controllers — always reference `ALL_ROUTES`
7. Admin-only routes use `ADMIN_ROUTE_API_CONSTANT` as a prefix in their path (e.g. `${ADMIN_ROUTE_API_CONSTANT}/users` → `/admin/users`). This makes admin routes visually distinct in the routes file and in the URL.
8. List endpoints use a `/list` suffix when a bare GET on the base path is already used for single-resource retrieval (e.g. `GET /auth-sessions` returns current session, `GET /auth-sessions/list` returns all sessions)

## `helper.ts`

Small, focused utility functions that are used across the codebase. These are **not** library wrappers — those go in `src/lib/`.

```ts
export const Helper = {
  generateHash,
  fetchIpFromRequestHeader,
  fetchUserAgentFromRequestHeader,
};
```

**Rules:**
1. Functions must be small and focused — one purpose per function
2. Must not depend on external libraries (except Node.js built-ins like `crypto`)
3. Must not contain business logic — purely utility/transformation functions
4. Export as a single named object: `export const Helper = { ... }`
5. Examples of what belongs here: hashing, request header extraction, date formatting, string transformations
6. Examples of what does NOT belong here: Firebase calls (→ `src/lib/`), database calls (→ repo), validation (→ Zod schemas)

## `pagintation.types.ts`

Provides the shared pagination system used by all list/search endpoints. Contains DTOs, a normalizer, and a response mapper.

### Types

```ts
export type PaginatedRequestDTO<K extends string> = {
  page?: number;
  pageSize?: number;
} & (
  | { orderBy?: undefined; order?: undefined }
  | { orderBy: K; order?: SortDir }
);

export type SortDir = "asc" | "desc";

export type PaginatedResponse<T, K extends string> = {
  data: T[];
  page: number;
  pageSize: number;
  order: SortDir;
  orderBy?: K;
  total: number;
  totalPages: number;
};
```

- `PaginatedRequestDTO<K>` — generic input type parameterized by the allowed order key type. Uses a discriminated union so `order` can only be provided when `orderBy` is also provided.
- `PaginatedResponse<T, K>` — generic output type for paginated results.
- `SortDir` — `"asc" | "desc"`.

### `normalizePagination<K>(input, allowedOrderKeys)`

Validates and normalizes pagination input into values ready for Prisma queries:

```ts
export function normalizePagination<K extends string>(
  input: PaginatedRequestDTO<K>,
  allowedOrderKeys: readonly K[],
): { page, pageSize, order, orderBy, skip, take }
```

- Defaults: `page = 1`, `pageSize = 10`, `order = "desc"`
- Validates `orderBy` against the `allowedOrderKeys` array — throws `Errors.badRequest` if invalid
- Computes `skip = (page - 1) * pageSize` and `take = pageSize`

### `mapPaginatedResponse<T, K>(data, total, meta)`

Creates the final paginated response:

```ts
export function mapPaginatedResponse<T, K extends string>(
  data: T[],
  total: number,
  meta: { page, pageSize, order, orderBy? },
): PaginatedResponse<T, K>
```

- Calculates `totalPages = Math.max(1, Math.ceil(total / meta.pageSize))`
- Returns `{ data, total, totalPages, ...meta }`

**Rules:**
1. Every list endpoint must use `PaginatedRequestDTO<K>` as part of its input type
2. Every list endpoint must return `PaginatedResponse<T, K>` as its output type
3. The `K` type parameter is a module-specific order key type (e.g. `UserOrderKey`, `AuthSessionOrderKey`)
4. Each module defines its own `ORDER_KEYS` array and derives the key type from it (see `types.md`)
5. Services call `normalizePagination` to validate and compute skip/take, then pass those to the repo's `findMany`

## Extended Types (`extended-types/`)

Extended types define the Prisma type that includes all possible relations for a model. They are used by repos as return types for `find` methods.

**One file per model** that has relations: `<model>.extended.ts`

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

**Rules:**
1. File naming: `<model>.extended.ts` in kebab-case (e.g. `auth-session.extended.ts`)
2. Export a constant named `extended<Model>` in camelCase (e.g. `extendedUser`, `extendedAuthSession`)
3. Export a type named `Extended<Model>` in PascalCase (e.g. `ExtendedUser`, `ExtendedAuthSession`)
4. The constant uses `satisfies Prisma.<Model>DefaultArgs` for compile-time type safety
5. The type is derived using `Prisma.<Model>GetPayload<typeof extended<Model>>`
6. List **all** possible relations for the model in the `include` block — set every relation to `true`
7. The repo controls which relations are actually loaded at query time via the `args` parameter — the extended type just declares what's possible
8. Create the extended type file **before** creating the repo, since the repo depends on it

## `routes.setup.ts`

Central route registration file. Defines the order in which middleware and controllers are applied.

```ts
function setupAppRoutes(app: Application) {
  ///////////////////////////
  // HEALTH CHECK
  ///////////////////////////

  app.get(ALL_ROUTES.HEALTH_CHECK, async (_req, res, _next) => {
    res.json({ health: "ok" }).status(HttpStatusCode.ok);
  });

  ///////////////////////////
  // PUBLIC ENDPOINTS
  ///////////////////////////

  app.use(API_PREFIX, authenticationController);

  ///////////////////////////
  // AUTHENTICATED ENDPOINTS
  ///////////////////////////

  //---- AuthMiddleware----
  app.use(authMiddleware);

  app.use(API_PREFIX, userController);
  app.use(API_PREFIX, authSessionController);

  ///////////////////////////
  // ADMIN ENDPOINTS
  ///////////////////////////

  //---- AdminMiddleware----

  // Admin endpoints are NOT registered via global middleware here.
  // Instead, admin-only endpoints use requireRole(UserRole.admin) per-route
  // within their respective controllers. This keeps admin routes co-located
  // with their module's other routes.
}

export default setupAppRoutes;
```

**Rules:**
1. Export a single `setupAppRoutes(app: Application)` function
2. Registration order matters — middleware applied with `app.use()` affects all routes registered after it
3. Section order must be: **health check → public endpoints → auth middleware → authenticated endpoints → admin endpoints section**
4. Use section divider comments (`///////////////////////////`) to separate sections
5. All controllers are prefixed with `API_PREFIX`
6. When adding a new controller, register it in the correct section based on its access level
7. Admin access control is handled **per-route** using `requireRole` middleware in individual controllers — there is no global admin middleware in `routes.setup.ts`. The admin endpoints section in `routes.setup.ts` exists as a placeholder/comment only.
8. Controllers that contain both public and admin endpoints are registered in the **public section** — their admin routes must include `authMiddleware` at the route level (see rule 9)
9. **CRITICAL — `authMiddleware` in public-section controllers:** Controllers registered in the public section (before `app.use(authMiddleware)`) do NOT get auth applied globally. Any protected route (admin, authenticated, ownership-checked) in these controllers **MUST** add `authMiddleware` as the first per-route middleware. Without it, `req.auth` is `undefined` and `requireRole`/`bypassMiddleware`/ownership checks will fail. This applies to controllers like `categoryController` and `productController` that have both public GET endpoints and admin POST/PATCH/DELETE endpoints.

## `service.locator.ts`

Central dependency registry for all services. Located at `src/modules/service.locator.ts`.

```ts
const ServiceLocator = {
  authenticationService: FirebaseAuthService as IAuthService,
  authSessionService: AuthSessionService as IAuthSessionService,
  userService: UserService as IUserService,
};

export default ServiceLocator;
```

**Rules:**
1. Property names use `camelCase`: `<moduleName>Service` (e.g. `userService`, `authSessionService`)
2. Each service is cast to its interface type: `ServiceImpl as IServiceInterface`
3. Only register services for modules that are **fully implemented** (have at least a service file) — do not register stubs
4. When adding a new module, add its service entry here
5. Exported as default — all consumers import via `import ServiceLocator from "../service.locator"`
6. Controllers and middleware access services through this object — never import services directly
