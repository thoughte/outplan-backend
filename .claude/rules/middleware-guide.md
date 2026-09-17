# Middleware Guide

This document defines the rules for implementing middleware in the `src/middleware/` directory.

## Directory Structure

```
src/middleware/
├── auth.middleware.ts                         # Authentication middleware
├── error.middleware.ts                        # Global error handler (see error-handling-guide.md)
├── validate.middleware.ts                     # Request body validation
├── require-role.middleware.ts                 # Role/permission check
├── bypass.middleware.ts                       # Ownership bypass for privileged roles
└── ownership-checks/                          # One file per entity
    ├── auth-session.ownership.middleware.ts
    ├── order.ownership.middleware.ts
    └── ...
```

## Middleware Types

### 1. Auth Middleware (`auth.middleware.ts`)

Validates that the request comes from an authenticated user. Applied globally in `routes.setup.ts` before all authenticated routes.

The implementation depends on the auth strategy chosen in `.claude/tech-stack.md`. Check whether auth-sessions are persisted in the database or not.

**Structure (both variants):**
- One main exported function: `authMiddleware`
- Private helper functions prefixed with `_` for each validation step
- All errors thrown via `Errors` factory
- Wrapped in try/catch, errors passed to `next(e)`

**Registration in `routes.setup.ts`:**
```ts
// PUBLIC ENDPOINTS
app.use(API_PREFIX, authenticationController);

// AUTHENTICATED ENDPOINTS
app.use(authMiddleware);   // <-- applied globally here
app.use(API_PREFIX, userController);
```

---

#### Variant A: Without sessions (simple Firebase Auth)

Use this when `.claude/tech-stack.md` says `Persist auth-sessions: no` (or when auth-sessions are not mentioned).

This is the standard JWT flow — verify the token with the auth provider on every request and extract the user from the decoded token.

**Responsibilities:**
- Validate the Authorization header (Bearer token format)
- Extract the token
- Verify the token with Firebase Admin SDK (or whichever auth provider)
- Look up the user in the database by the provider's UID (e.g. `firebaseUid`)
- Check user exists and is active
- Populate `req.auth` with `{ userId }`

**Helpers:**
- `_validateAuthHeader(req)` — checks Bearer format
- `_validateToken(authHeader)` — extracts token string
- `_verifyAndFetchUser(token)` — verifies with Firebase, finds user by UID

---

#### Variant B: With sessions (Firebase Auth + persisted auth-sessions)

Use this when `.claude/tech-stack.md` says `Persist auth-sessions: yes`.

This variant avoids a round trip to Firebase on every request by storing token hashes in the database. It also handles token refresh — when Firebase rotates the access token (hourly), the frontend sends the new token with the same refresh token hash, allowing the backend to associate it with the existing session.

**Responsibilities:**
- Validate the Authorization header (Bearer token format)
- Validate the refresh token hash header (`x-refresh-token-hash`)
- Hash the access token and look up the session in the database by that hash
- If not found by access token hash, fall back to looking up by refresh token hash — this handles the case where Firebase has rotated the access token. In this case:
  - Verify the new token with Firebase to confirm it belongs to the same user
  - Update the session's token hash in the database
- Check session is not logged out or expired
- Verify user exists and is active
- Update session activity (IP, device info)
- Populate `req.auth` with `{ userId, sessionId }`

**Helpers:**
- `_validateAuthHeader(req)` — checks Bearer format
- `_validateRefreshTokenHeader(req)` — extracts refresh token hash header
- `_validateToken(authHeader)` — extracts token string
- `_fetchSession(token, refreshTokenHash)` — hashes token, looks up session, handles refresh fallback
- `_fetchUser(userId)` — fetches user via `ServiceLocator.userService.getById()`, checks active status
- `_updateSessionActivity(id, deviceInfo?, ipAddress?)` — wraps the service call to update session activity
- `_updateSessionIpAndAgent(req, session)` — extracts IP and user-agent from request, delegates to `_updateSessionActivity`
- `_createAuthenticatedRequest(req, session, user)` — populates `req.auth`

**Why this pattern exists:**
1. **Token hash lookup** — instead of calling Firebase on every request, we hash the access token and look it up in the `AuthSession` table. This turns auth verification into a fast DB lookup.
2. **Refresh token hash fallback** — Firebase access tokens expire every hour. The frontend refreshes them via the Firebase client SDK. When the backend receives a new access token it hasn't seen before, it looks up the session by the refresh token hash (which stays constant across refreshes), verifies the new token with Firebase, and updates the stored token hash. This keeps the session alive without requiring a new login.

### 2. Validation Middleware (`validate.middleware.ts`)

Validates the request body against a Zod schema. Applied per-route on endpoints that accept a body.

**Implementation:**
```ts
export function validateBodyMiddleware(schema: ZodObject) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (e) {
      next(e);
    }
  };
}
```

**Rules:**
- Higher-order function — takes a Zod schema, returns a middleware
- Replaces `req.body` with the parsed result (strips unknown fields, coerces types)
- Passes Zod errors to `next(e)` — the error middleware converts them to `AppError`
- Applied per-route, before the route handler:

```ts
userController.patch(
  ALL_ROUTES.USER,
  validateBodyMiddleware(UpdateUserSchema),
  async (req, res, next) => { ... }
);
```

### 3. Require Role Middleware (`require-role.middleware.ts`)

Checks that the authenticated user has a specific role before allowing access. Applied per-route on endpoints that require a specific role (e.g. admin-only endpoints).

**Implementation:**

```ts
import { NextFunction, Response } from "express";
import { AuthenticatedRequest } from "../shared/types";
import { UserRole } from "../../generated/prisma/enums";
import { Errors } from "../errors/app.errors";
import ServiceLocator from "../modules/service.locator";

function requireRole(role: UserRole) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) => {
    const auth = req.auth;
    if (!auth) throw Errors.unauthorized("Access denied");

    const { userId } = auth;

    const user = await ServiceLocator.userService.getById(userId);
    if (!user) throw Errors.forbidden();

    const isValidRole = user.role === role;

    if (!isValidRole) throw Errors.forbidden();

    next();
  };
}

export default requireRole;
```

**Rules:**
- Higher-order function — takes the required `UserRole`, returns a middleware
- Named `requireRole` (not `checkRole`) — exported as default
- Import `UserRole` from `generated/prisma/enums` (not from `generated/prisma/client`)
- Always fetches the user fresh from the database (never trust cached/stale role data)
- Throws `Errors.unauthorized` if `req.auth` is missing
- Throws `Errors.forbidden()` (no message) if user not found or role does not match
- Does NOT wrap in try/catch — errors propagate to Express error handler via the route handler's `next(e)`

**Usage — always per-route, never global:**

Admin-only endpoints use `requireRole` directly in the controller middleware chain:

```ts
import requireRole from "../../middleware/require-role.middleware";
import { UserRole } from "../../../generated/prisma/enums";

userController.post(
  ALL_ROUTES.LIST_USERS,
  validateBodyMiddleware(ListUserBodySchema),
  requireRole(UserRole.admin),
  async (req, res, next) => { ... }
);
```

**Middleware ordering when combined with validation:**
Place `validateBodyMiddleware` before `requireRole` so the body is validated before the role check runs.

**Auth check in handler:** When `requireRole` is in the middleware chain, the route handler does NOT need to check `req.auth` — the middleware guarantees it exists. The handler can go straight to extracting body/query params.

### 4. Bypass Middleware (`bypass.middleware.ts`)

Wraps an ownership middleware so that privileged roles (e.g. admin) can bypass the ownership check entirely. If the user has the specified role, the ownership middleware is skipped. Otherwise, the ownership middleware runs as normal.

**Implementation:**

```ts
import { NextFunction, Response } from "express";
import { AuthenticatedRequest } from "../shared/types";
import { UserRole } from "../../generated/prisma/enums";
import { Errors } from "../errors/app.errors";
import ServiceLocator from "../modules/service.locator";

function bypassMiddleware(
  mw: (req: AuthenticatedRequest, res: Response, next: NextFunction) => void,
  role: UserRole,
) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ) => {
    const auth = req.auth;
    if (!auth) throw Errors.unauthorized("Access denied");

    const { userId } = auth;

    const user = await ServiceLocator.userService.getById(userId);
    if (!user) throw Errors.forbidden();

    const isValidRole = user.role === role;

    if (isValidRole) return next();
    else return mw(req, res, next);
  };
}

export default bypassMiddleware;
```

**Rules:**
- Higher-order function — takes an ownership middleware and a role, returns a new middleware
- Import `UserRole` from `generated/prisma/enums` (not from `generated/prisma/client`)
- Throws `Errors.unauthorized` if `req.auth` is missing
- Throws `Errors.forbidden()` (no message) if user not found
- If the user's role matches, skip the ownership check and call `next()` directly
- If the user's role does not match, delegate to the original ownership middleware
- Always fetches the user fresh to check the role
- Does NOT wrap in try/catch — errors propagate naturally

**Usage in a controller:**
```ts
import { checkAuthSessionOwnership } from "../../middleware/ownership-checks/auth-session.ownership.middleware";
import bypassMiddleware from "../../middleware/bypass.middleware";
import { UserRole } from "../../../generated/prisma/enums";

authSessionController.get(
  ALL_ROUTES.SESSION_ID,
  bypassMiddleware(checkAuthSessionOwnership, UserRole.admin),
  async (req, res, next) => { ... }
);
```

### 5. Ownership Middlewares (`ownership-checks/`)

Ownership middlewares verify that the authenticated user owns the resource being accessed. One file per entity that needs ownership checks.

**When to create an ownership middleware:**
- The entity has a `userId` (or equivalent owner field) in the database
- The controller has GET/PATCH/PUT/DELETE endpoints that accept an `:id` path parameter
- The resource should only be accessible by its owner (unless bypassed by role)

**File naming:** `<entity-name>.ownership.middleware.ts`

**Implementation pattern:**

```ts
import { NextFunction, Response } from "express";
import { AuthenticatedRequest } from "../../shared/types";
import { Errors } from "../../errors/app.errors";
import ServiceLocator from "../../modules/service.locator";

export async function check<Entity>Ownership(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
) {
  try {
    // 1. Verify auth exists
    const auth = req.auth;
    if (!auth) throw Errors.unauthorized("Access denied");

    const { userId } = auth;

    // 2. Extract resource ID from path params
    const { id } = req.params;
    if (!id) throw Errors.unauthorized("Access denied");

    // 3. Fetch the resource
    const resource = await ServiceLocator.<entityService>.getById(
      id.toString(),
      {},
    );

    // 4. Compare owner
    if (resource.userId !== userId) throw Errors.forbidden();

    next();
  } catch (e) {
    next(e);
  }
}
```

**Rules:**
1. Named `check<Entity>Ownership` (e.g. `checkAuthSessionOwnership`, `checkOrderOwnership`)
2. Always verify `req.auth` exists first
3. Always extract `id` from `req.params` and validate it exists
4. Fetch the resource using `getById` (throws `notFound` if missing)
5. Compare the resource's owner field with the authenticated user's ID
6. Throw `Errors.forbidden()` if ownership does not match — no message needed
7. Wrap everything in try/catch, pass errors to `next(e)`
8. Applied per-route in the controller, not globally

## General Middleware Rules

1. **Error handling** — middleware that is globally applied (auth middleware) or that is an exported named function (ownership checks) must wrap logic in try/catch and pass errors to `next(e)`. Per-route higher-order middleware (`requireRole`, `bypassMiddleware`) can throw directly without try/catch — errors propagate through the route handler's `next(e)`. Never send error responses directly from middleware (except the error middleware itself).
2. **Types** — use `AuthenticatedRequest` for middleware that needs `req.auth`. Use `Request` for middleware that runs before authentication.
3. **Private helpers** — prefix internal helper functions with `_` (e.g. `_validateAuthHeader`). Only export the main middleware function.
4. **Service access** — always use `ServiceLocator` to access services. Never import repos directly from middleware.
5. **Placement** — middleware runs in registration order. Ensure correct ordering: authMiddleware (if needed) → validation → requireRole → bypass/ownership → route handler.
6. **Prisma enums** — import `UserRole` and other Prisma enums from `generated/prisma/enums`, not from `generated/prisma/client`.
7. **CRITICAL — `authMiddleware` dependency:** `requireRole`, `bypassMiddleware`, and all ownership middlewares depend on `req.auth` being populated. `req.auth` is ONLY populated by `authMiddleware`. If a controller is registered in the **public** section of `routes.setup.ts` (before the global `app.use(authMiddleware)`), then every protected route in that controller MUST include `authMiddleware` as the first middleware in its per-route chain. Forgetting this causes `req.auth` to be `undefined`, which breaks `requireRole` and ownership checks silently.
