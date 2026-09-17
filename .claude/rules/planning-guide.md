# Planning Guide

This document defines the mandatory planning step before implementing any module or feature.

## Rule: Plan Before You Build

Before writing **any** implementation code for a new module or feature, you MUST:

1. **Draft an endpoint plan** — list every endpoint the module will expose, including:
   - HTTP method and path
   - Access level (public, authenticated, admin)
   - Request params, query params, and body shape
   - Response shape
   - Middleware chain

2. **Present the plan to the user** using the `AskUserQuestion` tool and wait for confirmation before proceeding.

3. **Only after user approval**, begin implementing the module files (types, repo, service, controller).

If the user requests changes to the plan, revise and re-confirm. Do NOT start coding until the plan is approved.

## Why This Exists

Endpoint design decisions (access levels, request/response shapes, which filters to support) are hard to change after implementation. Getting alignment upfront avoids throwaway work and ensures the API matches what the frontend expects.

## Endpoint Access Level Policy

Use the following guidelines when planning which endpoints need protection:

### GET / List / Detail endpoints

- **Public by default.** Most read endpoints (list, detail by slug/ID) should be public unless they expose sensitive user data (e.g. auth sessions, wallet balance, order history).
- **Use a single list endpoint per resource.** Do not create separate public and admin list endpoints for the same resource. Instead, use a single public `GET` endpoint with optional query param filters (e.g. `?isActive=true`). Admin users can pass `?isActive=false` to see inactive records; the default filters to active-only.
- **Protect only when necessary.** Endpoints that return user-specific private data (sessions, orders, wallet) should require authentication. Endpoints that return catalog data (categories, products, input fields) should be public.

### POST / PATCH / PUT / DELETE (mutation endpoints)

- **Always protected.** Mutation endpoints must require authentication at minimum.
- **User-scoped mutations** — the user can only mutate their own resources. Use ownership middleware.
- **Admin-only mutations** — use `requireRole(UserRole.admin)` for operations like creating categories, managing products, etc.

### Summary table

| Operation | Default Access | Examples |
|-----------|---------------|----------|
| List / search | Public | `GET /categories`, `GET /products` |
| Detail by slug/ID | Public | `GET /categories/:slug`, `GET /products/:slug` |
| User's own data | Authenticated | `GET /users` (profile), `GET /auth-sessions` |
| Create / update / delete | Authenticated + ownership or admin | `POST /admin/categories`, `PATCH /users` |

### Pagination on all list endpoints

Every list endpoint **must** support pagination via query params (`page`, `pageSize`, `order`, `orderBy`). There are no unpaginated list endpoints. The service must use `normalizePagination` and the response must be `PaginatedResponse<T, K>`.
