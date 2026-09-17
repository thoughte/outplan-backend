# Module Structure Guide

This document describes what a module is, when to create one, and how it should be structured. This guide covers structure only — implementation rules for each file inside a module will be covered separately.

## What is a Module?

A module is a self-contained feature unit inside `src/modules/`. Each module owns its own controller, service, repository, and types. Modules are the building blocks of the application — all business logic lives inside them.

## When to Create a Module

Create a new module when:

1. **A new Prisma model needs CRUD operations** — if you add a model to the schema that will be queried or mutated through the API, it gets its own module (e.g. `user`, `order`, `wallet`).
2. **A distinct business domain needs endpoints** — if a feature has its own set of routes and business logic, even if it operates across multiple models (e.g. `authentication` orchestrates users and sessions).
3. **An existing module is being asked to do too much** — if a module starts handling unrelated concerns, split it.

Do NOT create a module for:

- Shared utilities or helpers — those go in `src/shared/`
- Middleware — those go in `src/middleware/`
- Library wrappers — those go in `src/lib/`
- Config — those go in `src/config/`

## Module Types

There are two types of modules:

### 1. Standard Module (model-backed)

For modules that map directly to a Prisma model and need full CRUD. This is the most common type.

**Files:**

```
src/modules/<module-name>/
├── controller.ts    # Route handlers — HTTP layer only
├── service.ts       # Business logic + interface + implementation + export
├── repo.ts          # Data access layer — pure CRUD, no business logic
└── types.ts         # Zod schemas, DTOs, response types, mapper functions
```

**Examples:** `user`, `auth-session`, `order`, `cart`, `wallet`

### 2. Non-Standard Module (orchestration / no direct model)

For modules that orchestrate other services rather than owning a model directly. These modules may not need a repo and may have a separate service interface file when the service has multiple possible implementations.

**Files:**

```
src/modules/<module-name>/
├── controller.ts           # Route handlers
├── service.interface.ts    # Service interface (when multiple implementations exist)
├── <impl>.service.ts       # Named implementation (e.g. firebase.service.ts)
└── types.ts                # Zod schemas, DTOs, response types, mapper functions
```

**Examples:** `authentication` (orchestrates user + auth-session, has Firebase-specific implementation)

**When to use this pattern:**
- The module doesn't own a Prisma model
- The service has or may have multiple implementations (e.g. Firebase Auth today, custom JWT tomorrow)
- The module primarily coordinates calls to other module services

## Naming Conventions

- **Module directory**: kebab-case matching the domain (e.g. `auth-session`, `discount-redemption`, `support-ticket`)
- **Files inside**: always `controller.ts`, `service.ts`, `repo.ts`, `types.ts` for standard modules
- **Controller variable**: `<moduleName>Controller` in camelCase (e.g. `authSessionController`, `userController`)
- **Repo export**: `<ModuleName>Repo` in PascalCase (e.g. `UserRepo`, `AuthSessionRepo`)
- **Service export**: `<ModuleName>Service` in PascalCase (e.g. `UserService`, `AuthSessionService`)
- **Interfaces**: `I<ModuleName>Service`, `I<ModuleName>Repo` (e.g. `IUserService`, `IUserRepo`)

## Service Locator

Every service must be registered in `src/modules/service.locator.ts`. This is the central dependency registry — controllers and other services access dependencies through it, never by importing services directly.

```ts
const ServiceLocator = {
  userService: UserService as IUserService,
  authSessionService: AuthSessionService as IAuthSessionService,
};
```

When creating a new module, always add its service to the `ServiceLocator`.

## Route Registration

Every controller must be registered in `src/routes.setup.ts` under the correct section:

1. **Public endpoints** — above the auth middleware
2. **Authenticated endpoints** — below the auth middleware

Admin-only endpoints are NOT registered in a separate section. Instead, they live in the same controller as the module's authenticated endpoints and use `requireRole(UserRole.admin)` per-route. The controller is registered once in the authenticated section.

All module routes are prefixed with `API_PREFIX`. Route paths are defined in `src/shared/routes.ts` under the `ALL_ROUTES` object — never hardcode paths in controllers. Admin-only route paths use `ADMIN_ROUTE_API_CONSTANT` prefix (e.g. `${ADMIN_ROUTE_API_CONSTANT}/users`).

```ts
// In src/shared/routes.ts
export const ALL_ROUTES = {
  USER: "/users",
  LIST_USERS: `${ADMIN_ROUTE_API_CONSTANT}/users`,
  // ...
};

// In src/routes.setup.ts
app.use(API_PREFIX, userController);  // contains both authenticated and admin endpoints
```

## Ownership Middleware

If a module's resources need ownership verification (i.e. a user can only access their own records), create an ownership middleware at:

```
src/middleware/ownership-checks/<module-name>.ownership.middleware.ts
```

This middleware checks that the authenticated user owns the resource identified by the route param before allowing access. It is applied per-route in the controller, not globally.

## Checklist for Creating a New Module

1. Create the module directory under `src/modules/<module-name>/`
2. For standard modules: create the extended type file at `src/shared/extended-types/<model>.extended.ts` (the repo depends on it)
3. Create the required files based on module type (standard or non-standard)
4. Add route paths to `src/shared/routes.ts` (including admin paths with `ADMIN_ROUTE_API_CONSTANT` if needed)
5. Register the service in `src/modules/service.locator.ts`
6. Register the controller in `src/routes.setup.ts` under the correct section
7. Create ownership middleware if needed
