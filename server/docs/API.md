# API Documentation

Complete reference for the Project Management API, written for a developer
consuming the backend.

Everything here is derived from the implementation. Where the code and this
document could disagree, the code wins — and `npm run docs:verify` will tell you
if the machine-readable contract has drifted.

- **Machine-readable contract:** [`openapi.json`](./openapi.json) (OpenAPI 3.1)
- **Served at runtime:** `GET /api/v1/openapi.json`
- **Base URL (development):** `http://localhost:5000/api/v1`

---

## Contents

1. [Project overview](#1-project-overview)
2. [Installation and setup](#2-installation-and-setup)
3. [Environment variables](#3-environment-variables)
4. [Running the development server](#4-running-the-development-server)
5. [Running in production](#5-running-in-production)
6. [Authentication](#6-authentication)
7. [Authorization model](#7-authorization-model)
8. [Workspace roles](#8-workspace-roles)
9. [Project roles](#9-project-roles)
10. [Project permissions](#10-project-permissions)
11. [API versioning](#11-api-versioning)
12. [Success response format](#12-success-response-format)
13. [Error response format](#13-error-response-format)
14. [Authentication endpoints](#14-authentication-endpoints)
15. [Workspace endpoints](#15-workspace-endpoints)
16. [Project endpoints](#16-project-endpoints)
17. [Project member and role endpoints](#17-project-member-and-role-endpoints)
18. [Task endpoints](#18-task-endpoints)
19. [Subtask endpoints](#19-subtask-endpoints)
20. [Comment endpoints](#20-comment-endpoints)
21. [Label endpoints](#21-label-endpoints)
22. [Notification endpoints](#22-notification-endpoints)
23. [Activity endpoints](#23-activity-endpoints)
24. [File endpoints](#24-file-endpoints)
25. [Dashboard endpoints](#25-dashboard-endpoints)
26. [Search, filtering, pagination and sorting](#26-search-filtering-pagination-and-sorting)
27. [Validation rules](#27-validation-rules)
28. [File upload restrictions](#28-file-upload-restrictions)
29. [HTTP status codes](#29-http-status-codes)
30. [Worked examples](#30-worked-examples)
31. [Authorization requirements per endpoint](#31-authorization-requirements-per-endpoint)

---

## 1. Project overview

A RESTful backend for team project management. It covers:

- **Accounts** — registration, login, cookie sessions, profile and settings.
- **Workspaces** — the top-level container, with owner/admin/member roles.
- **Projects** — inside workspaces, with owner/admin/member/viewer roles.
- **Tasks** — status, priority, assignment, dates, estimates, subtasks.
- **Collaboration** — comments, labels, file attachments.
- **Insight** — per-project audit trail, notifications, dashboards.

Two design decisions are worth knowing before you read further:

- **Sessions are cookie-based only.** There is no bearer token and no refresh
  token. See [Authentication](#6-authentication).
- **Nothing is hard-deleted.** Tasks and projects are archived; comments are
  soft-deleted. See each endpoint's notes.

---

## 2. Installation and setup

Requires **Node.js 20.19+** (developed on 22) and a MongoDB deployment.

```bash
cd server
npm install
cp .env.example .env      # then edit .env
npm run dev
```

The API listens on `http://localhost:5000` by default and the base path is
`/api/v1`.

---

## 3. Environment variables

Read once at startup by `src/config/env.js`, which **validates them and refuses
to boot** on a fatal misconfiguration.

| Variable                | Required | Default       | Notes                                           |
| ----------------------- | -------- | ------------- | ----------------------------------------------- |
| `NODE_ENV`              | no       | `development` | `development` \| `test` \| `production`         |
| `PORT`                  | no       | `5000`        |                                                 |
| `MONGODB_URI`           | **yes**  | —             | Connection string.                              |
| `JWT_ACCESS_SECRET`     | **yes**  | —             | **Minimum 32 characters.**                      |
| `JWT_ACCESS_EXPIRES_IN` | no       | `15m`         | Access-token lifetime.                          |
| `COOKIE_MAX_AGE`        | no       | `900000`      | Cookie lifetime in ms (15 min).                 |
| `BCRYPT_SALT_ROUNDS`    | no       | `10`          | Must be 10–15.                                  |
| `CORS_ORIGINS`          | no       | _(empty)_     | Comma-separated allow-list.                     |
| `TRUST_PROXY`           | no       | `0`           | Trusted proxy hops. Set behind a load balancer. |
| `RATE_LIMIT_MAX`        | no       | `1000`        | Requests per IP per window.                     |
| `RATE_LIMIT_WINDOW_MS`  | no       | `900000`      | Window length in ms.                            |

### Validation behaviour

- A **missing** `MONGODB_URI` or `JWT_ACCESS_SECRET` is fatal in every environment.
- A **short** `JWT_ACCESS_SECRET` is fatal in production, a warning elsewhere.
  Generate one with `openssl rand -hex 32`.
- `BCRYPT_SALT_ROUNDS` outside 10–15 is fatal.
- With `CORS_ORIGINS` empty, production refuses all cross-origin browser
  requests; development allows any origin **without** credentials.

---

## 4. Running the development server

```bash
npm run dev      # nodemon, restarts on change
npm start        # plain node
```

Useful companions:

```bash
npm test             # full test suite
npm run routes       # print every route with its guards
npm run docs:verify  # confirm the docs match the routes
npm run lint
```

---

## 5. Running in production

```bash
NODE_ENV=production npm start
```

Before you deploy:

1. **Rotate `JWT_ACCESS_SECRET`** to at least 32 characters. The app will not
   start otherwise.
2. **Set `CORS_ORIGINS`** to your client origin(s), comma-separated. Without it
   no cross-origin browser request is permitted.
3. **Set `TRUST_PROXY`** if you run behind a load balancer or reverse proxy.
   Rate limiting keys on `req.ip`; without this every request appears to come
   from the proxy.
4. Cookies become `Secure` automatically when `NODE_ENV=production`, so serve
   over HTTPS.
5. Consider a shared rate-limit store if you run more than one instance — the
   built-in limiter counts per process, so the effective limit multiplies.

Health check: `GET /api/v1/health`.

---

## 6. Authentication

### Session model

Login and registration set a single cookie:

```
Set-Cookie: accessToken=<JWT>; Max-Age=900; Path=/; HttpOnly; SameSite=Strict
```

| Property     | Value                                       |
| ------------ | ------------------------------------------- |
| Name         | `accessToken`                               |
| Type         | JWT (HS256, algorithm pinned)               |
| Lifetime     | `JWT_ACCESS_EXPIRES_IN`, default 15 minutes |
| `HttpOnly`   | always — JavaScript cannot read it          |
| `SameSite`   | `Strict`                                    |
| `Secure`     | only when `NODE_ENV=production`             |
| Bearer token | **not supported**                           |

Send it back automatically by including credentials in your requests:

```js
fetch('http://localhost:5000/api/v1/users/profile', { credentials: 'include' });
```

> **Same-origin note.** `SameSite=Strict` means the cookie is not sent on
> cross-site requests. In development, either serve your frontend from the same
> origin or proxy `/api` to the backend. A cross-origin setup needs
> `CORS_ORIGINS` set **and** `credentials: 'include'` on the client.

### Token payload

```json
{ "userId": "64f0...", "role": "user", "iat": 1758030000, "exp": 1758030900 }
```

### When a request is rejected with 401

| Cause                                        | Message                                |
| -------------------------------------------- | -------------------------------------- |
| No cookie                                    | `Authentication required`              |
| Expired                                      | `Access token has expired`             |
| Malformed, bad signature, `alg:none`         | `Invalid access token`                 |
| User deleted since the token was issued      | `User no longer exists`                |
| Token issued before the last password change | `Session expired, please log in again` |

### Token invalidation

Access tokens are stateless, so there is no server-side session store. A token
stops working before its natural expiry in exactly one case: **a password
change**. The user's `passwordChangedAt` timestamp is compared against the
token's `iat`, so every token issued earlier is rejected. Log out after
changing a password and log in again.

### Password storage

Passwords are hashed with bcrypt at `BCRYPT_SALT_ROUNDS` (10–15). The hash is
`select: false` on the schema, stripped again on serialisation, and never
appears in any response. Login performs an equivalent bcrypt comparison even
when the email is unknown, so response timing does not reveal whether an account
exists.

### Rate limiting

| Scope                                     | Limit                                                               |
| ----------------------------------------- | ------------------------------------------------------------------- |
| `POST /auth/register`, `POST /auth/login` | **10 requests / 15 minutes per IP**                                 |
| Everything else under `/api`              | `RATE_LIMIT_MAX` per `RATE_LIMIT_WINDOW_MS` (default 1000 / 15 min) |

Exceeding a limit returns **429** with `RateLimit-*` and `Retry-After` headers.

---

## 7. Authorization model

Authorization is applied in layers, each answering a different question:

| Layer                        | Question                                                       |
| ---------------------------- | -------------------------------------------------------------- |
| `authenticate`               | Is there a valid session?                                      |
| `requireWorkspaceMember`     | Does the caller belong to this workspace?                      |
| `requireWorkspacePermission` | Does the caller's **workspace role** grant this capability?    |
| `requireProjectPermission`   | Does the caller's **project role** grant this capability?      |
| Service layer                | Object-level rules — authorship, moderation, assignee validity |

### The workspace override (Policy A)

**A workspace owner or admin holds authority over every project in their
workspace and does not need to be a project member.**

This rule is defined once, in `hasProjectOverride(workspaceRole)`
(`src/constants/rolePermissions.js`), and applied both by
`requireProjectPermission` and by the services that would otherwise require
membership.

The override is bounded: it never crosses workspace boundaries. A workspace
admin acting on a project in a workspace they do not belong to is rejected like
anyone else.

### Rules no role overrides

- **Editing a comment is author-only.** A workspace admin can _delete_ another
  member's comment but cannot _edit_ it.
- **Assignees must be project members.** Assigning to a non-member is a **400**,
  not a permission error.
- **Uploaders may always delete their own files**, regardless of role.

### Reads versus writes

Reads of project content are scoped to the **workspace** — any workspace member
can read any project's tasks, subtasks and comments. Writes are scoped to the
**project** and carry a project permission.

---

## 8. Workspace roles

Three roles, defined in `src/constants/workspaceRoles.js`.

| Role     | Rank | Summary                                                                                    |
| -------- | ---- | ------------------------------------------------------------------------------------------ |
| `owner`  | 3    | Full control, including deleting the workspace and transferring ownership.                 |
| `admin`  | 2    | Manages members and workspace settings. Cannot delete the workspace or transfer ownership. |
| `member` | 1    | Read-only at workspace level; works inside projects.                                       |

### Workspace permission matrix

| Permission           | owner | admin | member |
| -------------------- | :---: | :---: | :----: |
| `view_workspace`     |  yes  |  yes  |  yes   |
| `update_workspace`   |  yes  |  yes  |   —    |
| `view_members`       |  yes  |  yes  |  yes   |
| `invite_members`     |  yes  |  yes  |   —    |
| `remove_members`     |  yes  |  yes  |   —    |
| `change_roles`       |  yes  |   —   |   —    |
| `archive_workspace`  |  yes  |  yes  |   —    |
| `restore_workspace`  |  yes  |  yes  |   —    |
| `delete_workspace`   |  yes  |   —   |   —    |
| `transfer_ownership` |  yes  |   —   |   —    |

> **Implementation note.** Archiving and restoring a workspace are enforced by
> `requireWorkspaceRole(OWNER)` on the route, which is **stricter** than the
> permission table above (which grants `archive_workspace` to admins too). The
> route wins: only the owner can archive or restore.

Additional guards from the route layer:

- Removing a member: an admin may remove regular members only, never the owner
  or another admin.
- Changing a role: owner only.
- Transferring ownership: owner only.

---

## 9. Project roles

Four roles, defined in `src/constants/projectRoles.js`.

| Role     | Summary                                                                |
| -------- | ---------------------------------------------------------------------- |
| `owner`  | Full control of the project and its content.                           |
| `admin`  | Identical to owner in the current permission table.                    |
| `member` | Creates and edits work; cannot delete, archive, or manage the project. |
| `viewer` | Read-only.                                                             |

## 10. Project permissions

| Permission              | owner | admin | member | viewer |
| ----------------------- | :---: | :---: | :----: | :----: |
| `project:view`          |  yes  |  yes  |  yes   |  yes   |
| `project:update`        |  yes  |  yes  |   —    |   —    |
| `project:archive`       |  yes  |  yes  |   —    |   —    |
| `project:restore`       |  yes  |  yes  |   —    |   —    |
| `project:view_members`  |  yes  |  yes  |  yes   |  yes   |
| `project:add_member`    |  yes  |  yes  |   —    |   —    |
| `project:remove_member` |  yes  |  yes  |   —    |   —    |
| `project:change_role`   |  yes  |  yes  |   —    |   —    |
| `task:create`           |  yes  |  yes  |  yes   |   —    |
| `task:update`           |  yes  |  yes  |  yes   |   —    |
| `task:assign`           |  yes  |  yes  |  yes   |   —    |
| `task:delete`           |  yes  |  yes  |   —    |   —    |
| `task:archive`          |  yes  |  yes  |   —    |   —    |
| `task:restore`          |  yes  |  yes  |   —    |   —    |
| `subtask:create`        |  yes  |  yes  |  yes   |   —    |
| `subtask:update`        |  yes  |  yes  |  yes   |   —    |
| `subtask:delete`        |  yes  |  yes  |  yes   |   —    |
| `comment:create`        |  yes  |  yes  |  yes   |   —    |
| `comment:update`        |  yes  |  yes  |  yes   |   —    |
| `comment:delete`        |  yes  |  yes  |  yes   |   —    |
| `comment:moderate`      |  yes  |  yes  |   —    |   —    |
| `label:create`          |  yes  |  yes  |   —    |   —    |
| `label:update`          |  yes  |  yes  |   —    |   —    |
| `label:delete`          |  yes  |  yes  |   —    |   —    |
| `label:assign`          |  yes  |  yes  |  yes   |   —    |
| `attachment:create`     |  yes  |  yes  |  yes   |   —    |
| `attachment:delete`     |  yes  |  yes  |  yes   |   —    |
| `attachment:moderate`   |  yes  |  yes  |   —    |   —    |

Notes:

- `comment:update` / `comment:delete` / `attachment:delete` grant the ability to
  act on **your own** items. Acting on someone else's requires the matching
  `*:moderate` capability (owner/admin, or a workspace owner/admin).
- `task:delete` exists in the table but **no delete endpoint is exposed** — tasks
  are archived instead.

---

## 11. API versioning

The version is in the path: **`/api/v1`**. Every route documented here is
relative to that prefix.

`GET /api/v1/` returns the index and current version, using the standard
success envelope:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Welcome to the Product Management API",
  "data": { "version": "1.0.0", "documentation": "/api/v1/openapi.json" }
}
```

### System endpoints

Three endpoints are outside the resource model and need no authentication:

| Method | Path            | Purpose                                                                   |
| ------ | --------------- | ------------------------------------------------------------------------- |
| `GET`  | `/`             | API index and version                                                     |
| `GET`  | `/health`       | **Liveness** — is the process alive? Never touches the database.          |
| `GET`  | `/health/ready` | **Readiness** — should this instance receive traffic? Pings the database. |
| `GET`  | `/openapi.json` | This document.                                                            |

They are mounted **ahead of the rate limiter**, so a probe is never throttled by
API traffic. Successful probes are not logged; failing ones are.

#### Liveness — `GET /health`

Always `200` while the process can serve a request.

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Service is healthy",
  "data": { "status": "ok", "uptimeSeconds": 812, "environment": "production", "version": "1.0.0" }
}
```

Use this as a container liveness probe. It deliberately ignores the database: a
liveness probe that failed on a database blip would make the orchestrator
restart healthy instances, which cannot fix a database problem.

#### Readiness — `GET /health/ready`

`200` when the instance can serve traffic:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Service is ready",
  "data": { "status": "ready", "checks": { "database": { "status": "up", "latencyMs": 3 } } }
}
```

`503` when the database is unreachable — note `success: false`, and that the
instance is still _alive_:

```json
{
  "success": false,
  "statusCode": 503,
  "message": "Service is not ready",
  "data": {
    "status": "not_ready",
    "checks": { "database": { "status": "down", "reason": "not connected" } }
  }
}
```

Use this for **load-balancer readiness**. An unready instance should be removed
from the pool but left running, so it can recover on its own.

See [DEPLOYMENT.md](./DEPLOYMENT.md) for how to wire these into an
orchestrator.

---

## 12. Success response format

Every successful response uses the same envelope (`src/utils/ApiResponse.js`):

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Task created successfully",
  "data": { "task": { "…": "…" } }
}
```

`data` is `null` or absent for endpoints that only report success.

### Paginated lists

List endpoints add a `pagination` block inside `data`:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Tasks retrieved successfully",
  "data": {
    "tasks": [],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 42,
      "totalPages": 3,
      "hasNextPage": true,
      "hasPrevPage": false
    }
  }
}
```

### A note on `id` versus `_id`

Only **`User`** and **`Workspace`** remap `_id` to `id`. Every other resource —
projects, tasks, comments, labels, attachments, notifications, activities —
serialises with **`_id`**. Read `id ?? _id` defensively, or use the OpenAPI
schemas, which document each resource's actual shape.

---

## 13. Error response format

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [{ "field": "body.email", "message": "Please provide a valid email address" }]
}
```

`errors` is always an array; it is empty for errors that are not field-specific.

Error responses never contain stack traces, database errors, or driver messages.
Stack traces are attached only when `NODE_ENV=development`.

---

## 14. Authentication endpoints

| Method | Path             | Auth     | Purpose                               |
| ------ | ---------------- | -------- | ------------------------------------- |
| `POST` | `/auth/register` | public   | Create an account and start a session |
| `POST` | `/auth/login`    | public   | Start a session                       |
| `POST` | `/auth/logout`   | required | Clear the session cookie              |

All three are rate limited to **10 requests / 15 minutes per IP**.

`POST /auth/register` and `POST /auth/login` set the cookie and return the user.
The token is **never** in the response body.

```json
{ "name": "Ada Lovelace", "email": "ada@example.com", "password": "at-least-8-chars" }
```

Registration returns **409** if the email is taken and **400** if validation
fails. Login returns **401** with the same message for both an unknown email and
a wrong password, so it cannot be used to enumerate accounts.

`POST /auth/logout` clears the cookie. The token itself remains valid until it
expires — there is no server-side revocation list.

---

## 15. Workspace endpoints

| Method   | Path                               | Auth         | Purpose                       |
| -------- | ---------------------------------- | ------------ | ----------------------------- |
| `POST`   | `/workspaces`                      | required     | Create a workspace            |
| `GET`    | `/workspaces`                      | required     | List workspaces you belong to |
| `GET`    | `/workspaces/:workspaceId`         | member       | Get one workspace             |
| `PATCH`  | `/workspaces/:workspaceId`         | owner, admin | Update name/description       |
| `PATCH`  | `/workspaces/:workspaceId/archive` | **owner**    | Archive                       |
| `PATCH`  | `/workspaces/:workspaceId/restore` | **owner**    | Restore an archived workspace |
| `DELETE` | `/workspaces/:workspaceId`         | **owner**    | Delete                        |

Creating a workspace makes the creator its `owner`. An archived workspace is
invisible to the membership guard, so `GET` on it returns **404** until restored.

---

## 16. Project endpoints

| Method  | Path                                           | Auth                         | Purpose       |
| ------- | ---------------------------------------------- | ---------------------------- | ------------- |
| `POST`  | `/workspaces/:workspaceId/projects`            | workspace `update_workspace` | Create        |
| `GET`   | `/workspaces/:workspaceId/projects`            | workspace member             | List          |
| `GET`   | `/workspaces/:workspaceId/projects/:projectId` | workspace member             | Get one       |
| `PATCH` | `/workspaces/:workspaceId/projects/:projectId` | workspace `update_workspace` | Update        |
| `PATCH` | `…/projects/:projectId/archive`                | workspace `update_workspace` | Archive       |
| `PATCH` | `…/projects/:projectId/restore`                | workspace `update_workspace` | Restore       |
| `PATCH` | `…/projects/:projectId/status`                 | workspace `update_workspace` | Change status |

Project **lifecycle** is a workspace-level concern, so these routes require the
`update_workspace` permission (workspace owner/admin) rather than a project role.

The creator becomes the project's `owner`. Project status is one of `planning`,
`active`, `on_hold`, `completed`, `cancelled`.

> An archived project disappears from the listing but **remains retrievable by
> id**. Archived _tasks_, by contrast, return 404.

---

## 17. Project member and role endpoints

| Method   | Path                                         | Auth                          | Purpose         |
| -------- | -------------------------------------------- | ----------------------------- | --------------- |
| `POST`   | `…/projects/:projectId/members`              | workspace `update_workspace`  | Add a member    |
| `DELETE` | `…/projects/:projectId/members/:userId`      | workspace `update_workspace`  | Remove a member |
| `PATCH`  | `…/projects/:projectId/members/:userId/role` | project `project:change_role` | Change a role   |

Adding and removing require workspace authority; changing a role requires
project authority. The target user must already belong to the workspace, and
roles are one of `owner`, `admin`, `member`, `viewer`.

---

## 18. Task endpoints

| Method  | Path                         | Project permission   | Purpose                                 |
| ------- | ---------------------------- | -------------------- | --------------------------------------- |
| `POST`  | `…/tasks`                    | `task:create`        | Create                                  |
| `GET`   | `…/tasks`                    | _(workspace member)_ | List, filter, sort, paginate            |
| `GET`   | `…/tasks/:taskId`            | _(workspace member)_ | Get one                                 |
| `PATCH` | `…/tasks/:taskId`            | `task:update`        | Update title/description/dates/estimate |
| `PATCH` | `…/tasks/:taskId/archive`    | `task:archive`       | Archive                                 |
| `PATCH` | `…/tasks/:taskId/restore`    | `task:restore`       | Restore                                 |
| `PATCH` | `…/tasks/:taskId/status`     | `task:update`        | Change status                           |
| `PATCH` | `…/tasks/:taskId/priority`   | `task:update`        | Change priority                         |
| `PATCH` | `…/tasks/:taskId/assignee`   | `task:assign`        | Assign or unassign                      |
| `PATCH` | `…/tasks/:taskId/due-date`   | `task:update`        | Set or clear the due date               |
| `PATCH` | `…/tasks/:taskId/start-date` | `task:update`        | Set or clear the start date             |

**There is no delete endpoint for tasks.** They are archived.

- `status`: `todo`, `in_progress`, `in_review`, `completed`, `cancelled`
- `priority`: `low`, `medium`, `high`, `urgent`
- `estimatedTime`: integer minutes, `>= 0`
- Assigning to a non-project-member returns **400**

Create payload:

```json
{
  "title": "Handle refund webhooks",
  "description": "Retry with backoff",
  "assignee": "64f000000000000000000002",
  "priority": "high",
  "estimatedTime": 120,
  "startDate": "2026-09-20T09:00:00.000Z",
  "dueDate": "2026-09-27T17:00:00.000Z"
}
```

---

## 19. Subtask endpoints

| Method   | Path                                  | Project permission   | Purpose       |
| -------- | ------------------------------------- | -------------------- | ------------- |
| `POST`   | `…/tasks/:taskId/subtasks`            | `subtask:create`     | Add a subtask |
| `GET`    | `…/tasks/:taskId/subtasks`            | _(workspace member)_ | List subtasks |
| `PATCH`  | `…/tasks/:taskId/subtasks/:subtaskId` | `subtask:update`     | Update        |
| `DELETE` | `…/tasks/:taskId/subtasks/:subtaskId` | `subtask:delete`     | Delete        |

Subtasks are embedded in the parent task and support `title` and
`isCompleted`. Setting `isCompleted` stamps `completedAt`.

> **Response shape inconsistency.** `POST` returns the **parent task** under the
> `subtask` key, while `PATCH` returns the subtask itself. Take the new subtask
> id from the list response, which is unambiguous.

---

## 20. Comment endpoints

| Method   | Path                                  | Project permission   | Purpose                |
| -------- | ------------------------------------- | -------------------- | ---------------------- |
| `POST`   | `…/tasks/:taskId/comments`            | `comment:create`     | Add a comment          |
| `GET`    | `…/tasks/:taskId/comments`            | _(workspace member)_ | List comments          |
| `GET`    | `…/tasks/:taskId/comments/:commentId` | _(workspace member)_ | Get one                |
| `PATCH`  | `…/tasks/:taskId/comments/:commentId` | `comment:update`     | Edit — **author only** |
| `DELETE` | `…/tasks/:taskId/comments/:commentId` | `comment:delete`     | Delete                 |

`content` is required and limited to 2000 characters. Deletion is a soft delete:
the comment is hidden from listings and its attachments are purged.

**Editing is author-only and no role overrides it** — not a project owner, not a
workspace admin. Deletion is different: the author may delete their own comment,
and project owner/admin (or a workspace owner/admin) may delete anyone's.

---

## 21. Label endpoints

| Method   | Path                                    | Project permission   | Purpose            |
| -------- | --------------------------------------- | -------------------- | ------------------ |
| `POST`   | `…/projects/:projectId/labels`          | `label:create`       | Create             |
| `GET`    | `…/projects/:projectId/labels`          | _(workspace member)_ | List               |
| `GET`    | `…/projects/:projectId/labels/:labelId` | _(workspace member)_ | Get one            |
| `PATCH`  | `…/projects/:projectId/labels/:labelId` | `label:update`       | Update             |
| `DELETE` | `…/projects/:projectId/labels/:labelId` | `label:delete`       | Delete             |
| `POST`   | `…/tasks/:taskId/labels`                | `label:assign`       | Assign to a task   |
| `DELETE` | `…/tasks/:taskId/labels/:labelId`       | `label:assign`       | Remove from a task |

Labels are project-scoped: `name` (1–50 chars, unique within the project) and
`color` (hex, e.g. `#ff0000`). Only owner/admin may create, rename or delete
labels; members may assign existing ones.

Assigning a label that belongs to another project fails with **400** or **404**.

---

## 22. Notification endpoints

| Method   | Path                                  | Auth     | Purpose                 |
| -------- | ------------------------------------- | -------- | ----------------------- |
| `GET`    | `/notifications`                      | required | List your notifications |
| `GET`    | `/notifications/unread`               | required | List unread only        |
| `GET`    | `/notifications/unread/count`         | required | Count unread            |
| `PATCH`  | `/notifications/read-all`             | required | Mark all read           |
| `PATCH`  | `/notifications/:notificationId/read` | required | Mark one read           |
| `DELETE` | `/notifications/:notificationId`      | required | Delete                  |

Notifications are per-user and **never** visible to anyone else: acting on
another user's notification returns **404**, not 403, so the resource is not
disclosed. They are produced by the service layer, never by a client.

Types: `task_assigned`, `task_reassigned`, `task_due_soon`,
`task_comment_added`, `project_member_added`, `project_role_changed`,
`workspace_invitation`.

---

## 23. Activity endpoints

| Method | Path                               | Project permission | Purpose      |
| ------ | ---------------------------------- | ------------------ | ------------ |
| `GET`  | `…/projects/:projectId/activities` | `project:view`     | Project feed |
| `GET`  | `…/tasks/:taskId/activities`       | `project:view`     | Task feed    |

The audit trail is append-only and written by the service layer — clients cannot
create entries. Entries carry `workspace`, `project`, `user`, `action`,
`metadata` and `createdAt`.

Supported query parameters: `page`, `limit`, `sortBy`, `order`, `action`,
`userId`, `from`, `to`.

Actions include project (`created`, `updated`, `status_changed`,
`member_added`, `member_removed`, `member_role_changed`, `archived`,
`restored`), task (`task_created`, `task_updated`, `task_archived`,
`task_restored`, `task_status_changed`, `task_priority_changed`,
`task_assigned`, `task_reassigned`, `task_unassigned`), subtask
(`subtask_created`, `subtask_updated`, `subtask_deleted`), comment
(`task_comment_added`, `task_comment_updated`, `task_comment_deleted`), label
(`label_created`, `label_updated`, `label_deleted`, `label_assigned`,
`label_removed`) and attachment (`attachment_uploaded`, `attachment_deleted`).
An unknown `action` value is a **400**.

---

## 24. File endpoints

| Method   | Path                                                       | Project permission  | Purpose             |
| -------- | ---------------------------------------------------------- | ------------------- | ------------------- |
| `POST`   | `…/projects/:projectId/attachments`                        | `attachment:create` | Upload to a project |
| `GET`    | `…/projects/:projectId/attachments`                        | `project:view`      | List                |
| `POST`   | `…/tasks/:taskId/attachments`                              | `attachment:create` | Upload to a task    |
| `GET`    | `…/tasks/:taskId/attachments`                              | `project:view`      | List                |
| `POST`   | `…/tasks/:taskId/comments/:commentId/attachments`          | `attachment:create` | Upload to a comment |
| `GET`    | `…/tasks/:taskId/comments/:commentId/attachments`          | `project:view`      | List                |
| `GET`    | `…/projects/:projectId/attachments/:attachmentId/download` | `project:view`      | Download            |
| `DELETE` | `…/projects/:projectId/attachments/:attachmentId`          | `attachment:delete` | Delete              |

Uploads are `multipart/form-data` with the file in the field **`file`**. One file
per request.

**Files are never publicly served.** The private store is not exposed by the
static handler; the only way to read a file is the download endpoint, which
requires authentication and project access. Downloads are sent with
`Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`, and are
never rendered inline.

Deleting a comment purges its attachments.

### Avatar

`PATCH /users/avatar` uploads an avatar in the field **`avatar`**. Avatars are
public and served from `/uploads/avatars/<name>`.

---

## 25. Dashboard endpoints

| Method | Path                                 | Project permission         | Purpose              |
| ------ | ------------------------------------ | -------------------------- | -------------------- |
| `GET`  | `/workspaces/:workspaceId/dashboard` | workspace `view_workspace` | Workspace statistics |
| `GET`  | `…/projects/:projectId/dashboard`    | `project:view`             | Project statistics   |

Workspace dashboard:

```json
{
  "workspace": { "…": "…" },
  "projects": {
    "total": 4,
    "active": 3,
    "archived": 1,
    "byStatus": { "active": 2, "planning": 1 }
  },
  "myTasks": { "assigned": 3, "completed": 1, "overdue": 1 }
}
```

Project dashboard:

```json
{
  "project": { "…": "…" },
  "tasks": {
    "total": 5,
    "byStatus": { "todo": 2, "in_progress": 1, "completed": 1, "cancelled": 1 },
    "byPriority": { "high": 2, "medium": 1, "low": 1, "urgent": 1 },
    "completed": 1,
    "cancelled": 1,
    "overdue": 1,
    "upcoming": 1,
    "unassigned": 1,
    "upcomingDueDays": 7,
    "completionPercentage": 25,
    "estimatedTime": { "unit": "minutes", "total": 75, "completed": 30, "remaining": 45 }
  },
  "myTasks": { "assigned": 3, "completed": 1, "overdue": 1 }
}
```

- Archived tasks are excluded from **every** figure.
- `completionPercentage` is `completed / (total − cancelled)`, `0` when the
  denominator is zero.
- `overdue` counts open tasks (not `completed`/`cancelled`) with a past due date.
- `unassigned` counts tasks with no assignee — including a cancelled one.
- `upcomingDueDays` defaults to 7 and accepts 1–90.

---

## 26. Search, filtering, pagination and sorting

Shared conventions across list endpoints, built by `src/utils/query.js`.

### Pagination

| Parameter | Default | Range     |
| --------- | ------- | --------- |
| `page`    | `1`     | `>= 1`    |
| `limit`   | `20`    | `1`–`100` |

`page=0`, `page=-1`, `page=abc` and `limit=500` are **400**.

### Sorting

`sortBy` accepts only the fields an endpoint whitelists; `order` is `asc` or
`desc`. An unknown `sortBy` — including operator-shaped input such as `$where` —
is **400**. A stable `_id` tiebreaker is always appended.

Task list sorting: `position` (default), `title`, `status`, `priority`,
`dueDate`, `startDate`, `estimatedTime`, `createdAt`, `updatedAt`.

### Task list filters

| Parameter                       | Type          | Notes                                         |
| ------------------------------- | ------------- | --------------------------------------------- |
| `status`                        | enum          | One task status                               |
| `priority`                      | enum          | One priority                                  |
| `assignee`                      | ObjectId      | Mutually exclusive with `unassigned`          |
| `unassigned`                    | boolean       | Mutually exclusive with `assignee`            |
| `labels`                        | ObjectId list | Comma-separated; matches **any**              |
| `isArchived`                    | boolean       | Default `false`                               |
| `dueDateFrom` / `dueDateTo`     | ISO date      | An inverted range is **400**                  |
| `startDateFrom` / `startDateTo` | ISO date      | An inverted range is **400**                  |
| `search`                        | string        | Case-insensitive across title and description |

Passing both `assignee` and `unassigned=true` is **400**.

### Search behaviour

`search` matches **title or description**, case-insensitively. Regex
metacharacters are escaped, so a search for `.*` matches the literal characters
`.*` rather than everything.

### Query safety

Filter values are validated as scalars or enums before reaching the database, so
an object-shaped value such as `?status={"$ne":"todo"}` is rejected with **400**
rather than being interpreted as a MongoDB operator.

---

## 27. Validation rules

Every request is validated with Zod before it reaches a controller
(`src/middlewares/validate.middleware.js`). A failure returns **400** with one
entry per invalid field.

| Field                      | Rule                                                                 |
| -------------------------- | -------------------------------------------------------------------- |
| `name` (user)              | 2–100 chars, trimmed                                                 |
| `email`                    | Valid email; lower-cased                                             |
| `password`                 | Minimum 8 characters                                                 |
| `name` (workspace/project) | 2–100 chars, trimmed                                                 |
| `title` (task)             | 2–200 chars, trimmed                                                 |
| `description`              | Maximum 5000 chars                                                   |
| `estimatedTime`            | Integer, `>= 0`, minutes                                             |
| `status` (task)            | `todo` \| `in_progress` \| `in_review` \| `completed` \| `cancelled` |
| `priority`                 | `low` \| `medium` \| `high` \| `urgent`                              |
| `status` (project)         | `planning` \| `active` \| `on_hold` \| `completed` \| `cancelled`    |
| `content` (comment)        | 1–2000 chars                                                         |
| `name` (label)             | 1–50 chars, unique per project                                       |
| `color` (label)            | Hex, e.g. `#ff0000`                                                  |
| `role` (project member)    | `owner` \| `admin` \| `member` \| `viewer`                           |
| `role` (workspace member)  | `owner` \| `admin` \| `member`                                       |

Path parameters named `*Id` must be 24-character hex ObjectIds. A malformed one
produces a **400**, not a 500.

Update endpoints reject an empty body — send at least one field.

The exact constraints for every field are in the OpenAPI document, generated
directly from these validators.

---

## 28. File upload restrictions

Enforced by `src/middlewares/upload.middleware.js` and
`src/constants/attachment.js`.

|                   | Attachments | Avatars  |
| ----------------- | ----------- | -------- |
| Max size          | **10 MB**   | **5 MB** |
| Files per request | 1           | 1        |
| Form field        | `file`      | `avatar` |

A file must satisfy **both** checks: its declared MIME type must be allow-listed
**and** its extension must be one mapped to that MIME type. This blocks a renamed
executable (`payload.exe` sent as `image/png`) as well as a lying MIME type on a
permitted extension.

**Allowed MIME types:** `image/jpeg`, `image/png`, `image/webp`, `image/gif`,
`application/pdf`, `text/plain`, `text/csv`, `text/markdown`,
`application/json`, `application/msword`, `.docx`,
`application/vnd.ms-excel`, `.xlsx`, `.ppt`, `.pptx`, `application/zip`,
`application/x-zip-compressed`.

Executables, scripts, HTML and other markup are rejected by default — the list is
an allow-list, not a deny-list.

Stored filenames are server-generated UUIDs. A traversal attempt in the original
filename (`../../evil.pdf`) is sanitised and cannot escape the storage root.

Rejections return **400**.

---

## 29. HTTP status codes

| Code    | Meaning here                                                                                                                                                                                               |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **200** | Success (`GET`, `PATCH`, `DELETE`).                                                                                                                                                                        |
| **201** | Resource created (`POST`).                                                                                                                                                                                 |
| **400** | Validation failed, or the request is not actionable (bad ObjectId, invalid date range, assigning a non-member, unsupported file type).                                                                     |
| **401** | Missing, expired, malformed or revoked session cookie; wrong current password.                                                                                                                             |
| **403** | Authenticated but without the required workspace or project authority.                                                                                                                                     |
| **404** | The resource does not exist, is archived, or is outside the caller's scope. Also used deliberately where revealing existence would leak information — another user's notification, another project's task. |
| **409** | Conflict — e.g. registering an email that already exists, or a duplicate label name.                                                                                                                       |
| **429** | Rate limit exceeded.                                                                                                                                                                                       |
| **500** | Unexpected server error. Never includes a stack trace outside development.                                                                                                                                 |
| **503** | Service unavailable — `GET /health/ready` when the database is unreachable, or `GET /openapi.json` when the document has not been generated.                                                               |

---

## 30. Worked examples

### Register, then create a project

```bash
# 1. Register — the response sets the accessToken cookie
curl -i -c cookies.txt -X POST http://localhost:5000/api/v1/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Ada Lovelace","email":"ada@example.com","password":"correct-horse"}'
```

```http
HTTP/1.1 201 Created
Set-Cookie: accessToken=eyJhbGciOi...; Max-Age=900; Path=/; HttpOnly; SameSite=Strict
```

```json
{
  "success": true,
  "statusCode": 201,
  "message": "User registered successfully",
  "data": {
    "user": {
      "id": "64f0…",
      "name": "Ada Lovelace",
      "email": "ada@example.com",
      "role": "user"
    }
  }
}
```

```bash
# 2. Create a workspace
curl -b cookies.txt -X POST http://localhost:5000/api/v1/workspaces \
  -H 'Content-Type: application/json' \
  -d '{"name":"Acme Platform","description":"Core services"}'

# 3. Create a project inside it
curl -b cookies.txt -X POST \
  "http://localhost:5000/api/v1/workspaces/$WORKSPACE_ID/projects" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Payments v2","status":"active"}'
```

### Create and progress a task

```bash
curl -b cookies.txt -X POST \
  "http://localhost:5000/api/v1/workspaces/$WORKSPACE_ID/projects/$PROJECT_ID/tasks" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Handle refund webhooks","priority":"high","estimatedTime":120}'
```

```json
{
  "success": true,
  "statusCode": 201,
  "message": "Task created successfully",
  "data": {
    "task": {
      "_id": "64f0…",
      "project": "64f0…",
      "title": "Handle refund webhooks",
      "status": "todo",
      "priority": "high",
      "estimatedTime": 120,
      "position": 0,
      "isArchived": false
    }
  }
}
```

```bash
# Move it along, then archive it (there is no DELETE)
curl -b cookies.txt -X PATCH ".../tasks/$TASK_ID/status" \
  -H 'Content-Type: application/json' -d '{"status":"in_progress"}'

curl -b cookies.txt -X PATCH ".../tasks/$TASK_ID/archive"
```

### Filter and paginate

```bash
curl -b cookies.txt \
  ".../tasks?status=todo&priority=high&sortBy=dueDate&order=asc&page=1&limit=10&search=refund"
```

### A validation failure

```bash
curl -b cookies.txt -X POST ".../tasks" \
  -H 'Content-Type: application/json' -d '{"title":"x","estimatedTime":-5}'
```

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation failed",
  "errors": [
    { "field": "body.title", "message": "Title must be at least 2 characters" },
    { "field": "body.estimatedTime", "message": "Estimated time cannot be negative" }
  ]
}
```

### An expired session

```json
{
  "success": false,
  "statusCode": 401,
  "message": "Access token has expired",
  "errors": []
}
```

---

## 31. Authorization requirements per endpoint

**Policy A** applies throughout: a workspace owner/admin satisfies project
requirements without project membership.

### Public

| Method | Path             |
| ------ | ---------------- |
| `GET`  | `/`              |
| `GET`  | `/health`        |
| `GET`  | `/health/ready`  |
| `GET`  | `/openapi.json`  |
| `POST` | `/auth/register` |
| `POST` | `/auth/login`    |

### Authenticated (any logged-in user)

| Method                 | Path                         |
| ---------------------- | ---------------------------- |
| `POST`                 | `/auth/logout`               |
| `GET` `PATCH`          | `/users/profile`             |
| `PATCH`                | `/users/avatar`              |
| `PATCH`                | `/users/change-password`     |
| `GET` `PATCH`          | `/users/settings`            |
| `DELETE`               | `/users/account`             |
| `POST`                 | `/workspaces`                |
| `GET`                  | `/workspaces`                |
| `PATCH`                | `/invitations/:token/accept` |
| `GET` `PATCH` `DELETE` | `/notifications…`            |

### Workspace membership required

| Method   | Path                                            | Extra requirement                        |
| -------- | ----------------------------------------------- | ---------------------------------------- |
| `GET`    | `/workspaces/:workspaceId`                      | —                                        |
| `GET`    | `/workspaces/:workspaceId/members`              | —                                        |
| `GET`    | `/workspaces/:workspaceId/dashboard`            | `view_workspace`                         |
| `PATCH`  | `/workspaces/:workspaceId`                      | role `owner` or `admin`                  |
| `PATCH`  | `/workspaces/:workspaceId/archive`              | role `owner`                             |
| `PATCH`  | `/workspaces/:workspaceId/restore`              | role `owner`, workspace must be archived |
| `DELETE` | `/workspaces/:workspaceId`                      | role `owner`                             |
| `POST`   | `/workspaces/:workspaceId/invitations`          | `invite_members`                         |
| `DELETE` | `/workspaces/:workspaceId/members/:userId`      | `remove_members`                         |
| `PATCH`  | `/workspaces/:workspaceId/members/:userId/role` | `change_roles`                           |
| `PATCH`  | `/workspaces/:workspaceId/transfer-ownership`   | `transfer_ownership`                     |

### Workspace `update_workspace` (owner/admin)

| Method   | Path                                    |
| -------- | --------------------------------------- |
| `POST`   | `/workspaces/:workspaceId/projects`     |
| `PATCH`  | `…/projects/:projectId`                 |
| `PATCH`  | `…/projects/:projectId/archive`         |
| `PATCH`  | `…/projects/:projectId/restore`         |
| `PATCH`  | `…/projects/:projectId/status`          |
| `POST`   | `…/projects/:projectId/members`         |
| `DELETE` | `…/projects/:projectId/members/:userId` |

### Project permission required

Workspace owner/admin satisfy all of these.

| Method                 | Path                                                                 | Permission                                           |
| ---------------------- | -------------------------------------------------------------------- | ---------------------------------------------------- |
| `GET`                  | `…/projects/:projectId`                                              | _(workspace member)_                                 |
| `GET`                  | `…/projects/:projectId/dashboard`                                    | `project:view`                                       |
| `GET`                  | `…/projects/:projectId/activities`                                   | `project:view`                                       |
| `PATCH`                | `…/projects/:projectId/members/:userId/role`                         | `project:change_role`                                |
| `GET` `POST`           | `…/tasks`                                                            | `project:view` / `task:create`                       |
| `GET` `PATCH`          | `…/tasks/:taskId`                                                    | `project:view` / `task:update`                       |
| `PATCH`                | `…/tasks/:taskId/archive` \| `restore`                               | `task:archive` / `task:restore`                      |
| `PATCH`                | `…/tasks/:taskId/status` \| `priority` \| `due-date` \| `start-date` | `task:update`                                        |
| `PATCH`                | `…/tasks/:taskId/assignee`                                           | `task:assign`                                        |
| `GET` `POST`           | `…/tasks/:taskId/subtasks`                                           | `project:view` / `subtask:create`                    |
| `PATCH` `DELETE`       | `…/tasks/:taskId/subtasks/:subtaskId`                                | `subtask:update` / `subtask:delete`                  |
| `GET` `POST`           | `…/tasks/:taskId/comments`                                           | `project:view` / `comment:create`                    |
| `GET` `PATCH` `DELETE` | `…/tasks/:taskId/comments/:commentId`                                | `project:view` / `comment:update` / `comment:delete` |
| `GET`                  | `…/tasks/:taskId/activities`                                         | `project:view`                                       |
| `GET` `POST`           | `…/projects/:projectId/labels`                                       | `project:view` / `label:create`                      |
| `GET` `PATCH` `DELETE` | `…/projects/:projectId/labels/:labelId`                              | `project:view` / `label:update` / `label:delete`     |
| `POST` `DELETE`        | `…/tasks/:taskId/labels…`                                            | `label:assign`                                       |
| `GET` `POST`           | `…/projects/:projectId/attachments`                                  | `project:view` / `attachment:create`                 |
| `GET` `POST`           | `…/tasks/:taskId/attachments`                                        | `project:view` / `attachment:create`                 |
| `GET` `POST`           | `…/tasks/:taskId/comments/:commentId/attachments`                    | `project:view` / `attachment:create`                 |
| `GET`                  | `…/projects/:projectId/attachments/:attachmentId/download`           | `project:view`                                       |
| `DELETE`               | `…/projects/:projectId/attachments/:attachmentId`                    | `attachment:delete`                                  |

### Object-level rules on top of the above

| Action                     | Additional rule                                                                |
| -------------------------- | ------------------------------------------------------------------------------ |
| Edit a comment             | Must be the author. No role overrides this.                                    |
| Delete a comment           | Author, or `comment:moderate` (project owner/admin, or workspace owner/admin). |
| Delete an attachment       | Uploader, or `attachment:moderate`.                                            |
| Assign a task              | The assignee must be a project member (**400** otherwise).                     |
| Read/act on a notification | Must be the recipient — otherwise **404**.                                     |

---

## Keeping this documentation honest

The OpenAPI document is generated from the routes, the Zod validators and the
Mongoose models, and then verified against the route table:

```bash
npm run docs:generate   # regenerate docs/openapi.json from the implementation
npm run docs:verify     # fail if the docs and the routes disagree
npm run routes          # print every route with its guard chain
```

`docs:verify` checks that every route is documented, that nothing is documented
that does not exist, that every `$ref` resolves, and that each operation's
authentication requirement matches the route's guard chain. Run it after adding
or changing a route.
