# Project Memory — project-management-api

Index + traps only. Detail lives in the source docs; do not restate it here.
Consolidated 2026-09-30.

## Where the truth lives (read before re-deriving)

| Topic | Source |
| --- | --- |
| Authorization rules | `src/constants/rolePermissions.js`, `server/docs/SECURITY.md` |
| Audit + remediation | `server/docs/AUDIT.md`, `server/docs/REMEDIATION.md` |
| Env vars | `server/docs/ENVIRONMENT.md` |
| Frontend API contract | `client/API-INTEGRATION.md` |
| Design tokens + primitives | `client/DESIGN-SYSTEM.md` |

## Traps — do not re-derive, do not "fix"

- **Policy A:** a workspace OWNER/ADMIN rules every project in their workspace
  without project membership. Defined **once** in `hasProjectOverride(workspaceRole)`.
  Deliberate exceptions: comment *editing* is author-only (no override);
  comment/attachment *deletion* does honour it; `assignTask` checks the **assignee**,
  not the caller.
- Read scope: workspace membership grants the workspace, its members, the project
  list and one project. Everything inside a project needs `project:view`.
- `members` on a project is **access-shaped** — omitted unless the caller is a
  project member or workspace owner/admin (`shapeProjectForViewer`).
- Only `User`/`Workspace` map `_id` → `id`; everything else serializes `_id`.
- Tasks and projects are **archived, never hard-deleted**. No `DELETE /tasks/:taskId`.
- **An archived workspace is readable from exactly one place.** `GET /workspaces`
  takes `isArchived` (added 2026-09-30, `?? false`, so omitting it is unchanged) —
  that list is the only way to find one, and the only place it can be restored
  from. `GET /workspaces/:id` still **404s** once archived (pinned by a test), so
  Settings can never load an archived workspace. Restore is owner-only.
- `Select` (`components/ui/Select.tsx`) must declare any prop it forwards — TS allows
  a hyphenated attribute like `aria-label` on a component *without* checking it, so an
  undeclared one compiles and is silently dropped.
- `members.user` must **never** get a unique index — the invariant is
  intra-document, so the conditional `findOneAndUpdate` is the only mechanism. Tested.
- `position` may repeat under concurrent creates (ordering hint);
  `TASK_DEFAULT_SORT` = `{position, createdAt, _id}` makes the order total.
- Indexes: twelve single-field ones were dropped as prefixes of compound indexes.
  Removing a declaration does **not** drop the index — `npm run migrate:drop-indexes`
  does, and has **never been run**. Don't touch `{isArchived}`, `{isDeleted}`,
  `{isRead}`, `attachments.uploader`, `projectactivities.workspace` without
  `explain()` evidence.
- One transaction only: `acceptInvitation` (needs a replica set).
- Auth is cookie-only (`accessToken`, httpOnly, SameSite=Strict), 15-min expiry, no
  refresh/Bearer. `passwordChangedAt` invalidates older tokens; 1s `iat` tolerance.
- Uploads are validated by **magic bytes**, not MIME+extension. Attachments use
  memoryStorage but **avatars use diskStorage — unlink on rejection**. The two
  allow-lists are **separate**; the drift test must assert both directions.
- Unexpected 5xx are masked to `Internal Server Error`; deliberate `ApiError`s keep
  their message.
- `docs/openapi.json` is **generated, never hand-edited**. No `.prettierignore`.
- **Dashboard payloads are stats objects, not arrays.** Fixed 2026-09-30 — don't
  regress to `data.projects.length`. `client/src/lib/api/types.ts` is authoritative.

## Testing

- `node:test` + `assert/strict` + `supertest`. `npm test` needs `"tests/*.test.js"` —
  a directory argument fails on Node 22.
- Prefer `TEST_DB=mongodb`. `tests/helpers/memoryStore.js` fakes the query transport
  and proves nothing about indexes; extend it when you use a new operator.
- Fixtures go through the **models**; activity tests go through the **API** (the
  service layer writes the audit trail).
- `makeDocument` cannot represent a populated `members[].user` — assert the
  *decision* (present/absent), never its contents.
- **`npm test` has 3 pre-existing failures** (347/344/3 — verified by re-running the
  full suite with the tree stashed): `probe task field semantics`
  (`tests/tmp-probe.test.js`, a leftover scratch probe) and `upload content
  validation`, a Windows flake — `discardUploadedFile`'s
  `await fsp.unlink(...).catch(() => {})` hides EBUSY on a still-open handle.

## Machine — never claim otherwise

- **Docker is NOT installed**; `Dockerfile`/`docker-compose.yml` are unverified.
- **C: runs 99–100% full.** At 0 bytes free, `tsc` and headless Chrome die with
  native crash traces that look like code bugs but are not. A crashed headless run
  **leaks** its `%TEMP%/cdp-auth-*` profile (~30 MB) — delete it after every run.
- Sandbox blocks a build tool emptying its own output dir: Vite fails with
  `SAFE_DELETE_BULK_CONFIRM_REQUIRED` on a large `dist/assets`. Delete `dist/` first.
- **`127.0.0.1` ≠ `localhost` on Windows** — Vite binds IPv6 `::1`.

## Running the real backend without Atlas

`node client/dev/boot-real-api.mjs` boots the real `server/app.js` on :5000 against
the test in-process store (the Atlas SRV lookup is refused on this machine).
`NODE_ENV=test`, so rate limiting is off. No backend file is modified. **The store is
in-memory — restarting it wipes everything; re-seed before verifying.**

## Deliberately unfixed

- `POST /subtasks` returns the parent under `subtask`; `PATCH` returns the subtask.
- An archived project is still retrievable by id; an archived task 404s.
- `authorize.middleware.js` is dead code; `reorderTaskSchema` is an unused validator.

## Frontend

React 19 + Vite + Tailwind v4 + TS. Phases 2–3 complete. `client/README.md` =
architecture; `API-INTEGRATION.md` = endpoints; `DESIGN-SYSTEM.md` = tokens.
`npm run lint` fails — there is no ESLint config.

- `/api` is proxied by Vite; the base URL is the relative `/api/v1`. Load-bearing:
  `CORS_ORIGINS` is unset and the cookie is `SameSite=Strict`.
- `useMutation.run` resolves to a discriminated outcome, never `T | undefined` —
  every DELETE/archive succeeds with no body, so `undefined` is a real success value.
- Comment editing is author-only (`canEditComment`); deletion honours
  `comment:moderate` (`canDeleteComment`). Two predicates, deliberately not one.
- **Editing a project is a workspace operation, not a project one** — a project
  owner cannot rename their own project. Gate on `can.manageProjects`, not the
  project role. Same reason archiving is gated there.
- **An icon inside an icon-only trigger must be `pointer-events-none`.** The
  `<svg>` otherwise becomes the hit target and the menu silently never opens.
- **List filters live in the query string** (`useSearchParams`), not component
  state — a filter you cannot link to is a filter you lose on reload or Back.
  TasksTab, ProjectOverview, WorkspaceList and the workspace list do this.
  `assignee` and `unassigned` are one control: the API rejects a query with both.
- `useUnreadCount` returns `{ count, refresh }`; poll latency is wrong for an
  action the user just took.
- **`ActivityAction` is an open union** (`(string & {})`) — every render of it
  must fall back to `humaniseEnum`, or a new server action shows a blank row.
  `lib/activity.ts` owns the action → sentence mapping.
- **Upload progress needs XHR.** `fetch` cannot report it at all;
  `uploadWithProgress` in `lib/api/client.ts` is the one XHR path. Everything
  else stays on `fetch`.
- **`TableSkeletonRows` renders `<tr>`s and must sit inside a `<Table>`.** Rendered
  on its own it is a `<tr>` with no table ancestor — invalid nesting that React
  warns about.
- Two OpenAPI gaps are hand-typed on purpose — don't "correct" from the spec: the
  invitation `token` **is** returned, and `GET …/labels` also returns `pagination`.
