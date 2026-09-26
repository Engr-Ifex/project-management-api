# Project Memory — project-management-api

Curated notes only. Daily detail lives in `YYYY-MM-DD.md`; full findings live in
`server/docs/`. Consolidated 2026-09-26 — deduplicated, with detail moved to its
source document rather than restated here.

## Where the truth lives (read these before re-deriving anything)

| Topic | Source |
| --- | --- |
| Authorization rules | `src/constants/rolePermissions.js`, `server/docs/SECURITY.md` |
| Audit findings + remediation | `server/docs/AUDIT.md`, `server/docs/REMEDIATION.md` |
| Environment variables | `server/docs/ENVIRONMENT.md` (rewritten against `env.js`) |
| API contract for the frontend | `client/API-INTEGRATION.md` |
| Design tokens, primitives, verification | `client/DESIGN-SYSTEM.md` |

## Non-negotiables — do not re-derive, do not "fix"

- **Policy A:** a workspace OWNER/ADMIN has authority over every project in their
  workspace and does **not** need project membership. Defined **once** in
  `hasProjectOverride(workspaceRole)`; applied by `requireProjectPermission` and
  by controllers that pass `isWorkspaceElevated` into services. The previous
  triplication is exactly what let the middleware and the task service drift.
- **Policy A exceptions, deliberate:** comment *editing* is author-only (no
  override). Comment/attachment *deletion* does honour the override.
  `assignTask`'s membership check validates the **assignee**, not the caller.
- **Read scope is uniform:** workspace membership grants the workspace, its member
  list, the project list and a single project's record. Everything inside a
  project — tasks, subtasks, comments, labels, attachments, dashboard, activity —
  requires `project:view`.
- **`members` is access-shaped, not always returned.** Omitted from
  `GET /projects` and `GET /projects/:id`, and `createdBy` reduced to an id,
  unless the caller is a project member or a workspace owner/admin. Lives in
  `shapeProjectForViewer`, fed by `viewerOf(req)` — the same `hasProjectOverride`
  helper the guard uses.
- **Only `User` and `Workspace` map `_id` → `id`.** Everything else serializes
  `_id`; tests must use `_id` there.
- **Archived, never hard-deleted:** tasks and projects. There is no
  `DELETE /tasks/:taskId`.
- **Auth is cookie-only** (`accessToken`, httpOnly, SameSite=Strict): no refresh
  token, no Bearer. 15-minute expiry. `passwordChangedAt` invalidates older
  tokens; `authenticate` allows 1 second of `iat` tolerance.
- **`members.user` must never get a unique index** — it would enforce uniqueness
  *across documents*, but the invariant is intra-document. The conditional
  `findOneAndUpdate` is the only mechanism. Pinned by a test.
- **Task `position` may repeat** under concurrent creates — tolerated, because it
  is an ordering hint. `TASK_DEFAULT_SORT` is `{position, createdAt, _id}`, so the
  order is total.
- **Indexes:** twelve single-field indexes were removed as provable prefixes of
  compound indexes. Removing a declaration does **not** drop the index —
  `npm run migrate:drop-indexes` does, and it has **never been run** (`.env`
  targets real Atlas). `{isArchived}`, `{isDeleted}`, `{isRead}`,
  `attachments.uploader` and `projectactivities.workspace` are **not** provably
  redundant — leave them without `explain()` evidence.
- **One transaction only:** `acceptInvitation`. Needs a replica set; the fallback
  is detected, logged once and documented.
- **Uploads are content-validated by magic bytes**
  (`src/utils/fileSignature.js`), not just MIME + extension. Attachments use
  memoryStorage; **avatars use diskStorage, so the middleware must unlink on
  rejection**. The attachment and avatar allow-lists are **separate** — the drift
  test must assert both, in both directions (that gap is how `image/jpg` slipped
  through once).
- **Unexpected 5xx are masked** to `Internal Server Error`; deliberate
  `ApiError`s keep their message. Both halves pinned by tests.
- `docs/openapi.json` is **generated, never hand-edited** (`docs:generate` /
  `docs:verify`). Do not add a `.prettierignore` for it.

## Testing

- `node:test` + `node:assert/strict` + `supertest`. `npm test` uses
  `"tests/*.test.js"` — a directory argument does **not** work on Node 22.
- Prefer `TEST_DB=mongodb`. The in-process `tests/helpers/memoryStore.js` fakes
  the query transport and proves nothing about indexes or the query planner.
  Extend it when you use a new operator, or the tests prove nothing.
- Fixtures go through the **models** (so defaults and hooks apply); activity tests
  must go through the **API**, because the service layer writes the audit trail.
- Rate limiting is skipped when `NODE_ENV=test`.
- `makeDocument` cannot represent a populated `members[].user` — assert the
  *decision* (present/absent), never its contents. Attempting to "fix" this made
  fidelity worse.

## Machine constraints — never claim otherwise

- **Docker is NOT installed.** `Dockerfile` / `docker-compose.yml` are unverified.
- Windows: graceful shutdown is untestable — Node does not deliver POSIX signals.
- `git checkout HEAD -- <file>` destroys uncommitted work; when changes are staged,
  `git checkout -- <file>` restores from the INDEX.
- **C: runs at 99–100% full.** Headless-Chrome profiles alone reached 112 MB.
  Always delete the `--user-data-dir` after a run; scratch belongs in the
  gitignored `.tmp-shots/`.
- **The sandbox blocks a build tool from emptying its own output dir** — Vite
  fails with `SAFE_DELETE_BULK_CONFIRM_REQUIRED` on a large `dist/assets`. Delete
  the regenerable `dist/` first; it is not a code error.
- **`127.0.0.1` ≠ `localhost` on Windows** — Vite binds IPv6 `::1`, so curl to
  127.0.0.1 returns HTTP 000 while the server is running fine.

## Known inconsistencies, deliberately unfixed

- `POST /subtasks` returns the parent task under the `subtask` key; `PATCH`
  returns the subtask.
- An archived project remains retrievable by id; an archived task 404s.
- `src/middlewares/authorize.middleware.js` is dead code; `reorderTaskSchema`
  (`task.validator.js`) is an unused validator.

## Frontend (`client/`)

React 19 + Vite + Tailwind v4 + TypeScript. **Phases 2 and 3 are complete**: the
design system *and* the application (router, API client, auth, every screen).
`client/README.md` is the architecture note; `client/API-INTEGRATION.md` is the
endpoint contract; `client/DESIGN-SYSTEM.md` covers tokens and primitives.

- **`/api` is proxied by Vite; the client's base URL is the relative `/api/v1`.**
  Load-bearing: the server's `CORS_ORIGINS` is **unset** (cross-origin requests
  are refused) and the cookie is `SameSite=Strict` (it would not be sent
  cross-origin). The proxy makes the browser talk to its own origin, so the
  backend needs no change. Same proxy configured for `preview`.
- **`useMutation.run` resolves to a discriminated outcome**, never
  `TResult | undefined` — every DELETE/archive succeeds with no body, so `T`
  really is `undefined` on success and the two outcomes would otherwise be
  indistinguishable.
- **`members` is omitted (not empty) on a project** unless the caller has access;
  `Project.members` is optional so the compiler enforces the check.
- **`GET /workspaces/:id` returns `members` unpopulated** — the caller's role
  comes from the member entry for free; `GET …/members` populates names.
- **Comment editing is author-only, no role override** (`canEditComment`);
  deletion also honours `comment:moderate` (`canDeleteComment`). Two predicates,
  deliberately not one.
- **No authenticated screen has been rendered against live data** — the backend
  was not running during verification. `client/` also has no ESLint config, so
  `npm run lint` fails.

Two known OpenAPI response-schema gaps are handled by hand-typed interfaces and
must not be "corrected" from the spec: the invitation `token` **is** returned,
and `GET …/labels` also returns `pagination`.
