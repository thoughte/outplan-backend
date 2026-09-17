# Commenting Guide

This document describes the commenting conventions used across the codebase.

## Routes / Endpoints

Every route handler in a controller file should have a JSDoc-style comment block directly above it. The comment should include the following fields as applicable:

- **HTTP method and path** (e.g. `GET /auth-sessions`, `POST /login`)
- **Description** - a short summary of what the endpoint does
- **Params** - any URL parameters (e.g. `:id`)
- **Query** - any query string parameters
- **Body** - the expected request body DTO
- **Middleware** - any middleware applied to the route (e.g. authentication, validation, ownership checks)

### Examples

**Standard endpoint with ownership bypass:**

```ts
/**
 * GET /auth-sessions/:id
 * This is an endpoint to get an auth-session by id
 * Params:
 *  - id: string
 * Middleware:
 *  - Requires ownership of the session (admin bypass)
 */

authSessionController.get(
  ALL_ROUTES.AUTH_SESSION_ID,
  bypassMiddleware(checkAuthSessionOwnership, UserRole.admin),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // ...
  },
);
```

**Admin-only endpoint with body and query:**

```ts
/**
 * POST /admin/users
 * This is an endpoint to list all users with filters and pagination
 * Body:
 *  - ListUserBodySchema (id?, role?, status?, search?)
 * Query:
 *  - page, pageSize, order, orderBy (pagination)
 *  - authSessions, wallet, carts, orders, etc. (relation flags)
 * Middleware:
 *  - validateBodyMiddleware(ListUserBodySchema)
 *  - requireRole(UserRole.admin)
 */

userController.post(
  ALL_ROUTES.LIST_USERS,
  validateBodyMiddleware(ListUserBodySchema),
  requireRole(UserRole.admin),
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // ...
  },
);
```

### Rules

1. Place the comment block directly above the route registration call, separated by one blank line.
2. Only include the fields that are relevant - if there are no query params, omit the `Query` section.
3. Keep descriptions concise - one sentence is enough.
4. Use the actual HTTP method and resolved path (e.g. `POST /admin/users`, not `POST ${ADMIN_ROUTE_API_CONSTANT}/users`).
5. When middleware includes `bypassMiddleware`, note the bypass role in parentheses (e.g. "admin bypass").
6. When middleware includes `requireRole`, list it explicitly.
