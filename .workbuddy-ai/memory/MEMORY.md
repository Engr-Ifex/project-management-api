# Project Memory — project-management-api

Curated, long-lived notes. Daily detail lives in `YYYY-MM-DD.md`.

## Architecture facts worth remembering
- **Auth is cookie-only** (`accessToken`, httpOnly, SameSite=Strict). There is no refresh token and no Bearer support. Logout clears the cookie; the token itself stays valid until expiry (15 min) unless the password changes.
- **`passwordChangedAt`** invalidates tokens issued before a password change. `iat` is whole seconds, so `authenticate` allows a 1-second tolerance.
- **Tasks and projects are archived, never hard-deleted.** There is no `DELETE /tasks/:taskId` route.
- **Only `User` and `Workspace` define a `toJSON` transform** mapping `_id` → `id`. Every other resource serializes with `_id`. Tests must use `_id` for those.
- **Project authorization follows Policy A (decided 2026-09-17):** a workspace OWNER/ADMIN holds authority over every project in their workspace and does **not** need project membership. The rule is defined **once** in `hasProjectOverride(workspaceRole)` (`src/constants/rolePermissions.js`) and applied by `requireProjectPermission` plus the controllers that pass `isWorkspaceElevated` into services. Do not re-derive it — the previous triplication is exactly what let the middleware and the task service drift apart.
- **Exceptions to Policy A (object-level, deliberate):** comment *editing* is author-only — no role overrides it. Comment/attachment *deletion* does honour the override. `assignTask`'s membership check validates the **assignee**, not the caller.
- `PROJECT_ROLE_PERMISSIONS`: OWNER and ADMIN are identical; MEMBER can create/update tasks, comment, assign labels, upload attachments but cannot delete/archive tasks, manage members, or manage labels; VIEWER can only view.
- **Mongoose `select: false` on `User.password`** is the primary guard; `sanitizeUser` and the `toJSON` transform are defence in depth.

## Testing conventions (Phase 18)
- Framework: **`node:test` + `node:assert/strict` + `supertest`**. Script: `npm test` (uses `"tests/*.test.js"` — a directory argument does **not** work with Node 22's runner).
- `TEST_DB=auto|mongodb|memory`. `auto` uses a real DB only when a **cached mongod binary** is detected, otherwise the in-process store in `tests/helpers/memoryStore.js`.
- **Always prefer `TEST_DB=mongodb`** when a real database is available. The in-process store fakes the query transport; it does not prove index or query-planner behaviour.
- Tests never touch the application database: `MONGODB_URI` is overwritten before `src/config/env.js` is imported, and a guard rejects any `mongodb+srv:` / `.mongodb.net` URI.
- Rate limiting is **skipped when `NODE_ENV=test`** (the whole suite originates from one IP); the limiter is unit-tested with its own instance.
- Fixtures are created through the **models**, not the API, so schema defaults and hooks apply. The audit trail is written by the **service layer**, so activity tests must create resources through the API.

## Documentation & deployment pipeline (Phases 19–20)
- **`docs/openapi.json` is generated, never hand-edited.** `npm run docs:generate` builds it from the route table + the routes' own Zod validators; `npm run docs:verify` fails the build if code and spec disagree. The generator runs its own output through prettier, so `docs:generate` and `format:check` cannot fight each other — **do not** add `.prettierignore` for it.
- The docs scripts are plain **`.js`** (the codebase is uniformly `"type": "module"`; ESLint only globs `**/*.js`, so `.mjs` files produce `no-undef` errors).
- **Line endings are LF and enforced by `.gitattributes`.** `.prettierrc` sets `endOfLine: "lf"` and `core.autocrlf=true` on Windows, so without it a fresh clone fails `format:check` on correctly formatted files. Do not delete `.gitattributes`; if the gate ever fails only on a fresh clone, this is why.
- **Two health endpoints, deliberately different:** `/api/v1/health` is liveness and must never touch the database; `/api/v1/health/ready` pings it and returns 503 when down. Both are mounted ahead of the rate limiter.
- `npm run preflight` (also run by `start:prod`) validates the *production* environment and exits 1 on the development `.env` — that failure is expected locally, not a bug.
- **Docker is not installed on this machine.** `Dockerfile` / `docker-compose.yml` have never been built or run; treat them as unverified code. Graceful shutdown likewise cannot be exercised on Windows (Node does not deliver POSIX signals).

## Known inconsistencies (documented, deliberately unfixed)
- `POST /subtasks` returns the parent task under the `subtask` key; `PATCH` returns the subtask.
- An archived project remains retrievable by id; an archived task 404s.
- `src/middlewares/authorize.middleware.js` is dead code.
