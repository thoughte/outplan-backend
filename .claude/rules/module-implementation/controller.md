# Controller Layer Rules

This document defines the strict rules for implementing a controller file (`controller.ts`) inside a module.

## Purpose

The controller is the HTTP layer. It handles request parsing, calls the service layer via `ServiceLocator`, and sends responses. No business logic lives here.

## File Structure

```ts
import { NextFunction, Request, Response, Router } from "express";
import { ALL_ROUTES } from "../../shared/routes";
import { AuthenticatedRequest } from "../../shared/types";
import { Errors } from "../../errors/app.errors";
import ServiceLocator from "../service.locator";
import { HttpStatusCode } from "../../shared/enums";
// import DTOs, schemas, and middleware as needed

const <moduleName>Controller = Router();

// --- Route handlers ---

export default <moduleName>Controller;
```

## Router

- One `Router()` instance per controller file
- Named `<moduleName>Controller` in camelCase (e.g. `userController`, `authSessionController`)
- Exported as default export

## Route Registration

### Route Paths

Always use constants from `ALL_ROUTES` — never hardcode paths:

```ts
userController.get(
  ALL_ROUTES.USER,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { ... }
);
```

When adding a new endpoint, first add the path to `src/shared/routes.ts`:

```ts
export const ALL_ROUTES = {
  USER: "/users",
  USER_ID: "/users/:id",
  // ...
};
```

### HTTP Methods

Use the correct HTTP method for the operation:

- `GET` — read / fetch data
- `POST` — create a new resource **or** list/search with body filters
- `PATCH` — partial update of an existing resource
- `PUT` — full replacement of an existing resource (rare)
- `DELETE` — remove a resource

**List endpoints:** Use `GET` when the list only needs query params (e.g. `GET /auth-sessions/list?inActive=true`). Use `POST` when the list needs filter criteria in the request body (e.g. `POST /admin/users` with body `{ role, status, search }`).

### When to Create an Endpoint

Create a new endpoint when:

1. The client needs to perform a distinct operation (create, read, update, delete)
2. The operation requires different parameters or permissions than existing endpoints
3. A resource needs its own route (e.g. `/users/:id` vs `/users`)

Do NOT create an endpoint for:
- Internal service-to-service calls (use `ServiceLocator` directly)
- Operations that can be handled by query params on an existing endpoint

## Route Handler Structure

Every route handler must follow this exact pattern:

```ts
<controller>.<method>(
  ALL_ROUTES.<ROUTE>,
  // optional middleware (validation, ownership, etc.)
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // 1. Extract and validate auth (if authenticated endpoint)
      // 2. Extract params / query / body
      // 3. Call service via ServiceLocator
      // 4. Send response

      res.json(result).status(HttpStatusCode.ok);
    } catch (e) {
      next(e);
    }
  },
);
```

### Step 1: Extract Auth

For authenticated endpoints that do NOT have `requireRole` middleware, always extract and validate `req.auth` first:

```ts
const { auth } = req;
if (!auth) throw Errors.unauthorized("Access denied");
const { userId } = auth;
```

Use `AuthenticatedRequest` as the request type. If auth is missing, throw `Errors.unauthorized` immediately — do not continue.

For public endpoints, use `Request` instead of `AuthenticatedRequest`.

**When `requireRole` is in the middleware chain:** The handler does NOT need to check `req.auth` — the middleware guarantees it exists. Skip straight to extracting body/query params.

### Step 2: Extract Params / Query / Body

**URL params** (e.g. `/users/:id`):

```ts
const { id } = req.params;
```

**Query params** (e.g. `/users?wallet=true`):

```ts
const { wallet, carts, orders } = req.query;
const withWallet = wallet === "true";
const withCarts = carts === "true";
const withOrders = orders === "true";
```

Query params arrive as strings. Convert to boolean by comparing with `"true"`.

**Request body** (for POST/PATCH/PUT):

```ts
const dto: UpdateUserDTO = req.body;
```

When the route has `validateBodyMiddleware`, the body is already validated — just type-cast it to the DTO.

### Step 3: Call Service via ServiceLocator

Always access services through `ServiceLocator` — never import a service directly:

```ts
const user = await ServiceLocator.userService.getById(userId, {
  withWallet,
  withCarts,
  withOrders,
});
```

### Step 4: Send Response

Always use this exact pattern:

```ts
res.json(result).status(HttpStatusCode.ok);
```

- `res.json(data)` — sets the response body
- `.status(HttpStatusCode.ok)` — sets the HTTP status code
- Use `HttpStatusCode` enum values — never hardcode status numbers

## Middleware

### Validation Middleware

Apply `validateBodyMiddleware` on routes that accept a request body:

```ts
import { validateBodyMiddleware } from "../../middleware/validate.middleware";

userController.patch(
  ALL_ROUTES.USER,
  validateBodyMiddleware(UpdateUserSchema),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { ... }
);
```

- Pass the Zod schema from `types.ts`
- The middleware validates the body and passes the parsed result to the handler
- Place it before the route handler in the middleware chain

### Ownership Middleware

Apply ownership middleware on routes that access a specific resource by ID. Use `bypassMiddleware` to let admin users skip the ownership check:

```ts
import { checkAuthSessionOwnership } from "../../middleware/ownership-checks/auth-session.ownership.middleware";
import bypassMiddleware from "../../middleware/bypass.middleware";
import { UserRole } from "../../../generated/prisma/enums";

authSessionController.get(
  ALL_ROUTES.AUTH_SESSION_ID,
  bypassMiddleware(checkAuthSessionOwnership, UserRole.admin),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { ... }
);
```

- Place it before the route handler
- Wrap with `bypassMiddleware(ownershipMw, UserRole.admin)` so admins can access any resource
- Can be combined with validation middleware (validation first, then ownership)

### Require Role Middleware

Apply `requireRole` on admin-only endpoints:

```ts
import requireRole from "../../middleware/require-role.middleware";
import { UserRole } from "../../../generated/prisma/enums";

userController.post(
  ALL_ROUTES.LIST_USERS,
  validateBodyMiddleware(ListUserBodySchema),
  requireRole(UserRole.admin),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { ... }
);
```

- Place after `validateBodyMiddleware` (if present) so the body is validated before the role check
- When `requireRole` is present, the handler does NOT need to check `req.auth` — it is guaranteed

### Route-Level Auth Middleware (CRITICAL for public-section controllers)

**When a controller is registered in the PUBLIC section of `routes.setup.ts`** (before `app.use(authMiddleware)`), the global auth middleware does NOT apply to its routes. Any protected routes in that controller **MUST** have `authMiddleware` added explicitly as per-route middleware. Without it, `req.auth` will be `undefined` and `requireRole` / ownership checks will fail.

**This is the most common middleware mistake.** Always check: is this controller in the public section? If yes, every non-public route needs `authMiddleware` at the route level.

```ts
import authMiddleware from "../../middleware/auth.middleware";

// Controller registered in PUBLIC section because it has public GET endpoints.
// Admin routes MUST add authMiddleware explicitly:
categoryController.post(
  ALL_ROUTES.ADMIN_CATEGORY,
  authMiddleware,                              // <-- REQUIRED: populates req.auth
  validateBodyMiddleware(CreateCategorySchema),
  requireRole(UserRole.admin),                 // <-- needs req.auth from above
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { ... }
);
```

**When a controller is registered in the AUTHENTICATED section** (after `app.use(authMiddleware)`), the global middleware already applies — do NOT add `authMiddleware` per-route (it would run twice).

## Error Handling

Every route handler must wrap its body in try/catch:

```ts
try {
  // handler logic
} catch (e) {
  next(e);
}
```

- Pass all errors to `next(e)` — the global error middleware handles formatting
- Do NOT catch specific error types in the controller
- Do NOT send error responses manually from the controller
- The only exceptions the controller throws directly are auth checks (`Errors.unauthorized("Access denied")`)

## Query Params for Relations

When a GET endpoint supports optional relation loading, accept them as query params and convert to booleans:

```ts
const {
  authSessions,
  wallet,
  carts,
} = req.query;

const withAuthSessions = authSessions === "true";
const withWallet = wallet === "true";
const withCarts = carts === "true";

const user = await ServiceLocator.userService.getById(userId, {
  withAuthSessions,
  withWallet,
  withCarts,
});
```

Only add query params for relations that the endpoint's consumers actually need. Do not expose all possible relations by default.

## Admin-Only Endpoints

Admin endpoints live in the **same controller file** as the module's other endpoints, separated by a section divider comment. They are NOT registered in a separate controller or via global admin middleware.

### Case A: Controller in the AUTHENTICATED section

When the controller is registered after `app.use(authMiddleware)` in `routes.setup.ts`, `req.auth` is already populated. Admin routes only need `requireRole`:

```ts
const userController = Router();

// --- Authenticated endpoints ---

userController.get(ALL_ROUTES.USER, async (req, res, next) => { ... });

///////////////////////
// ADMIN ONLY ROUTES
//////////////////////

userController.post(
  ALL_ROUTES.LIST_USERS,
  validateBodyMiddleware(ListUserBodySchema),
  requireRole(UserRole.admin),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { ... }
);
```

### Case B: Controller in the PUBLIC section (has public + admin routes)

When the controller is registered before `app.use(authMiddleware)` in `routes.setup.ts` (because it has public endpoints), admin routes **MUST** include `authMiddleware` at the route level. Without it `req.auth` is `undefined` and `requireRole` will fail.

```ts
import authMiddleware from "../../middleware/auth.middleware";

const categoryController = Router();

// --- Public endpoints ---

categoryController.get(ALL_ROUTES.CATEGORY, async (req, res, next) => { ... });

///////////////////////
// ADMIN ONLY ROUTES
//////////////////////

categoryController.post(
  ALL_ROUTES.ADMIN_CATEGORY,
  authMiddleware,                              // <-- REQUIRED in public-section controllers
  validateBodyMiddleware(CreateCategorySchema),
  requireRole(UserRole.admin),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => { ... }
);
```

### Rules

1. Use the section divider comment `// ADMIN ONLY ROUTES` with `////` borders to visually separate admin routes from authenticated routes
2. Admin routes use `requireRole(UserRole.admin)` as per-route middleware — no global admin middleware
3. Admin route paths use `ADMIN_ROUTE_API_CONSTANT` prefix in their `ALL_ROUTES` definition (e.g. `LIST_USERS: "${ADMIN_ROUTE_API_CONSTANT}/users"`)
4. The controller is registered once in `routes.setup.ts` — in the public section if it has public endpoints, or the authenticated section if all endpoints need auth
5. **CRITICAL:** If the controller is in the public section, every non-public route MUST have `authMiddleware` as the first middleware in its chain. `requireRole` and `bypassMiddleware` depend on `req.auth` which is only populated by `authMiddleware`.
6. Import `requireRole` from `../../middleware/require-role.middleware` and `UserRole` from `../../../generated/prisma/enums`

## List / Search Endpoints

There are two patterns for list endpoints depending on access level:

### Pattern A: Public list (GET with query params) — DEFAULT

Most list endpoints are **public** and use `GET` with all filters as query params. This is the default pattern. See `.claude/rules/planning-guide.md` for the access level policy.

```ts
categoryController.get(
  ALL_ROUTES.CATEGORY,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize, order, orderBy, isActive, search } = req.query;

      const result = await ServiceLocator.categoryService.list({
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
        orderBy: orderBy as CategoryOrderKey,
        order: order === "asc" ? "asc" : "desc",
        isActive: isActive === "false" ? false : true,
        search: search as string | undefined,
      });

      res.json(result).status(HttpStatusCode.ok);
    } catch (e) {
      next(e);
    }
  },
);
```

**Rules for public list endpoints:**
1. Use `GET` — all filters, pagination, and relation flags come from query params
2. Use `Request` type (not `AuthenticatedRequest`) since it's public
3. Boolean filter defaults: `isActive` defaults to `true` (only show active records) unless explicitly set to `"false"`
4. Pagination params: `page` and `pageSize` to `Number`, `order` defaults to `"desc"` if not `"asc"`, `orderBy` cast to the module's order key type
5. One list endpoint per resource — do NOT create separate public and admin list endpoints
6. The response is always `PaginatedResponse<T, K>`

### Pattern B: Protected list (POST with body) — ONLY for sensitive data

Use `POST` with body filters only when the list endpoint needs authentication (e.g. listing users with sensitive data, listing a user's own orders). This is the exception, not the default.

```ts
userController.post(
  ALL_ROUTES.LIST_USERS,
  validateBodyMiddleware(ListUserBodySchema),
  requireRole(UserRole.admin),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const body: ListUserBody = req.body;
      const { page, pageSize, order, orderBy, wallet, orders } = req.query;

      const withWallet = wallet === "true";
      const withOrders = orders === "true";

      const result = await ServiceLocator.userService.listUsers(
        {
          page: page ? Number(page) : undefined,
          pageSize: pageSize ? Number(pageSize) : undefined,
          orderBy: orderBy as UserOrderKey,
          order: order === "asc" ? "asc" : "desc",
          ...body,
        },
        { withWallet, withOrders },
      );

      res.json(result).status(HttpStatusCode.ok);
    } catch (e) {
      next(e);
    }
  },
);
```

**Rules for protected list endpoints:**
1. Use `POST` — filter criteria in body, pagination + relations in query params
2. Body is validated via `validateBodyMiddleware`
3. Body filters and pagination params are spread into a single DTO: `{ ...paginationParams, ...body }`

### Common rules (both patterns)

1. Every list endpoint **must** return `PaginatedResponse<T, K>` — no unpaginated list endpoints
2. Pagination defaults: `page = 1`, `pageSize = 10`, `order = "desc"`
3. The service calls `normalizePagination` and uses `prisma.$transaction` for atomic read + count

## What Does NOT Belong in a Controller

- Business logic or validation rules (that's the service's job)
- Direct repo or database calls
- DTO mapping or response transformation
- Importing services directly (always use `ServiceLocator`)
- Manual error response formatting (the error middleware handles this)

## VIOLATION PENALTY — Controller → Repo Direct Access

**NEVER import or call a repo from a controller. This is a HARD rule with zero exceptions.**

The architecture is: `controller → ServiceLocator → service → repo`. If a service doesn't exist for a module yet, CREATE IT FIRST before writing the controller. Do not shortcut by calling the repo from the controller — not even for "simple" CRUD, not even for "read-only" endpoints, not even for modules with no business logic.

**If this rule is violated again, it will be treated as a critical defect requiring immediate rollback and re-implementation. No exceptions, no excuses.**

Every module that has a controller MUST have a corresponding service registered in `ServiceLocator`. The controller MUST access ALL data through that service. This applies to every module without exception — standard, non-standard, admin-only, or otherwise.