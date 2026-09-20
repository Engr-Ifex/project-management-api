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

## Audit findings that must not be re-derived (Phase 21, `server/docs/AUDIT.md`)
- **RESOLVED 2026-09-19 — see `server/docs/REMEDIATION.md`.** The permission tables now list only what is enforced, and `tests/permissions.test.js` derives the truth from the route inventory and fails on drift. The ROUTES were right; the TABLES were wrong. Do not "fix" this by widening guards.
- **Read scope is now uniform:** workspace membership grants the workspace, its member list, the project list and a single project's record (discovery). Everything inside a project — tasks, subtasks, comments, labels, attachments, dashboard, activity — requires `project:view`. Task/subtask reads were the exception and are fixed.
- **Duplicate membership CANNOT be prevented by a unique index.** A unique index on `{'members.user': 1}` enforces uniqueness *across documents* (one user, one workspace). The invariant is intra-document, which no MongoDB index can express — the conditional `findOneAndUpdate` is the only mechanism.
- **Task `position` may repeat** under concurrent creates; deliberately tolerated, because `position` is an ordering hint and a unique index would turn a benign collision into a failed request. `TASK_DEFAULT_SORT` is `{position, createdAt, _id}` so the order is total.
- **One transaction only**, in `acceptInvitation` (`src/utils/transactions.js`). Everything else is single-document atomic. Transactions need a replica set; the fallback is detected, logged once, and documented.
- **`tests/helpers/memoryStore.js` is a real dependency** — it emulates `$ne`/`$nin` on arrays, `$push`, `$addToSet`, `$pull` by condition, `$elemMatch` and `$set` with `arrayFilters`. Extend it when you use a new operator, or the tests prove nothing.
- **Indexes: prefix redundancy is provable, "unused" is not.** Twelve single-field indexes were removed because each is a prefix of a compound index on the same collection (if `{a:1,b:1}` exists, `{a:1}` can never be the better choice). Removing a schema declaration does **not** drop the index — Mongoose only creates — so `npm run migrate:drop-indexes` exists to drop them from an existing database. `tests/indexes.test.js` derives redundancy from the definitions and fails if one comes back.
- **`{isArchived:1}`, `{isDeleted:1}`, `{isRead:1}`, `attachments.uploader` and `projectactivities.workspace` are NOT provably redundant** and were deliberately left alone — deciding they are unused needs `explain()` against a real database. Do not remove them without that evidence.
- **`members.user` must never get a unique index.** It would enforce uniqueness *across documents* (one user, one workspace). Pinned by a test.
- **Docker is NOT installed on this machine.** Never claim a build/compose/startup was run. Static validation only.
- **Project member data is access-shaped, not always returned.** `GET /projects` and `GET /projects/:id` are workspace-member readable (discovery), but `members` is **omitted** and `createdBy` reduced to an id unless the caller is a project member or a workspace owner/admin. Shaping lives in `shapeProjectForViewer` (`project.service.js`), fed by `viewerOf(req)` which reads `hasProjectOverride` — the same helper the guard uses. Only those two functions needed it; every other project populate site is behind `ws:UPDATE_WORKSPACE`.
- **Uploads are content-validated, not just MIME+extension.** `src/utils/fileSignature.js` checks magic bytes: PNG/JPEG/GIF/WEBP/PDF/ZIP (covers docx/xlsx/pptx) and OLE2 (covers doc/xls/ppt). Attachments use memoryStorage (no temp file); **avatars use diskStorage, so the middleware must unlink on rejection**. Text formats have no magic number — the check is only "plausibly text" and is documented as weak. Adding an allowed MIME type requires adding a content rule, enforced by a test.
- **The test double cannot represent a populated nested array** (`members[].user`): `makeDocument` hydrates through `Model.hydrate`, which casts the array and drops the populated object. Test the *decision* (array present/absent), not its contents. Do not "fix" this — attempting it made fidelity worse.
- **`git checkout HEAD -- <file>` destroys uncommitted work.** When changes are staged, `git checkout -- <file>` restores from the INDEX. Use that.
- **`npm run migrate:drop-indexes` has never been executed** — `.env` points at the real Atlas cluster, so running it would be destructive. It is syntax-checked only. Do not run it without being asked.
- `eslint` is **0 errors / 0 warnings**. `next` in `error.middleware.js` is `_next` on purpose (Express identifies error handlers by arity 4) — the ESLint config has `argsIgnorePattern: '^_'`. Do not "fix" it by dropping the parameter.
- **Unexpected 5xx are masked** to `Internal Server Error`; deliberate 5xx `ApiError`s keep their message. Both halves are pinned by tests.

## Known inconsistencies (documented, deliberately unfixed)
- `POST /subtasks` returns the parent task under the `subtask` key; `PATCH` returns the subtask.
- An archived project remains retrievable by id; an archived task 404s.
- `src/middlewares/authorize.middleware.js` is dead code; `reorderTaskSchema` (`task.validator.js`) is an unused validator.
