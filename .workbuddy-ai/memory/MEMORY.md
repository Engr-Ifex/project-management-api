# Project Memory — project-management-api

**Product name is PROJEX** (renamed 2026-10-13 from the placeholder
"Project Management"). User-facing only: document title + `useDocumentTitle`
suffix, `index.html` title/meta, `AuthShell`, `WorkspaceList`, favicon
`aria-label`, both READMEs. Monogram is `PX`. Internal identifiers (package
names, API paths, env vars, collections, folders) deliberately do **not** carry
it — don't rename them.

Index + traps. Detail lives in `memory/YYYY-MM-DD.md` and `PHASE-*-REPORT.md`.

## Where the truth lives (read before re-deriving)

| Topic | Source |
| --- | --- |
| Authorization | `src/constants/rolePermissions.js`, `server/docs/SECURITY.md` |
| Env vars | `server/docs/ENVIRONMENT.md` |
| Frontend API contract | `client/API-INTEGRATION.md` |
| Design tokens + primitives | `client/DESIGN-SYSTEM.md` |
| Frontend architecture | `client/README.md` |
| API types (authoritative) | `client/src/lib/api/types.ts` |
| Browser QA harness | `client/dev/{cdp,qa}.mjs`, `npm run qa` |
| Bug-fix verification | `client/dev/verify-fixes.mjs`, `npm run verify:fixes` |
| Password-reset verification | `client/dev/verify-password-reset.mjs`, `npm run verify:reset` |
| Email architecture | `server/src/services/email.service.js`, `server/docs/API.md` §14 |

**Stale, do not use as reference:** `docs/DATABASE.md` (fields don't match the
models), `docs/AUDIT.md`, `docs/REMEDIATION.md` — their metrics do not reproduce.

## Backend traps — do not re-derive, do not "fix"

- **Policy A:** a workspace OWNER/ADMIN rules every project in their workspace
  without project membership. Defined **once** in `hasProjectOverride(workspaceRole)`.
  Deliberate exceptions: comment *editing* is author-only (no override);
  comment/attachment *deletion* honours it; `assignTask` checks the **assignee**.
- Read scope: workspace membership grants the workspace, its members, the project
  list and one project. Everything inside a project needs `project:view`.
- `members` on a project is **access-shaped** — omitted unless the caller is a
  project member or workspace owner/admin.
- Only `User`/`Workspace` map `_id` → `id`; everything else serializes `_id`.
- Tasks/projects are **archived, never hard-deleted**. No `DELETE /tasks/:taskId`.
  An archived project still GETs by id; an archived task 404s.
- **An archived workspace is reachable from exactly one place:** `GET /workspaces`
  with `isArchived` (`?? false`). `GET /workspaces/:id` **404s** once archived
  (pinned by a test). Restore is owner-only.
- `members.user` must **never** get a unique index — the invariant is
  intra-document, so the conditional `findOneAndUpdate` is the only mechanism.
- `position` may repeat under concurrent creates (ordering hint);
  `TASK_DEFAULT_SORT` = `{position, createdAt, _id}` makes the order total.
- Removing an index declaration does **not** drop the index —
  `npm run migrate:drop-indexes` does, and has **never been run**. Don't touch
  `{isArchived}`, `{isDeleted}`, `{isRead}`, `attachments.uploader`,
  `projectactivities.workspace` without `explain()` evidence.
- One transaction only: `acceptInvitation` (needs a replica set).
- Auth is cookie-only (`accessToken`, httpOnly, SameSite=Strict), 15-min, no
  refresh/Bearer. `passwordChangedAt` invalidates older tokens; 1s `iat` tolerance.
- Uploads validated by **magic bytes**, not MIME+extension. Attachments use
  memoryStorage but **avatars use diskStorage — unlink on rejection**. The two
  allow-lists are **separate**; the drift test must assert both directions.
- Unexpected 5xx masked to `Internal Server Error`; deliberate `ApiError`s keep
  their message.
- **The task update contract is split.** `PATCH /tasks/:id` accepts only
  `title`, `description`, `startDate`, `dueDate`, `estimatedTime`. Status,
  priority and assignee have their **own** routes (`/status`, `/priority`,
  `/assignee`). Zod strips unknown keys, so sending one to the generic PATCH is a
  **400 "at least one field must be provided"** — not a 400 naming the field.
  TypeScript cannot catch it when the body is passed as a *variable* (structural
  typing allows extra props on a non-literal). Pinned by tests in `task.test.js`.
- **Calendar dates vs instants.** `startDate`, `dueDate` and a project `deadline`
  are calendar dates stored as `T00:00:00.000Z`; render them with
  `formatCalendarDate` (UTC) or they shift a day for anyone west of UTC.
  `createdAt` / `updatedAt` / `joinedAt` are instants — keep `formatDate` (local).
  Send via `fromDateInputValue`; the API needs a full ISO datetime, not
  `yyyy-mm-dd`.
- `docs/openapi.json` is **generated, never hand-edited**.
- **There is no email verification.** It was built, then removed 2026-10-16 because
  the owner had no Resend domain and it was *blocking* registration. Registration
  creates a fully usable account and sends **no email**; nothing reads
  `isVerified` (the field is gone from the schema). Do not reintroduce a
  registration-time email dependency — see `PHASE-6-REMOVE-VERIFICATION-REPORT.md`.
- **Email config is a WARNING, not a fatal error** (`env.js`, `preflight.js`).
  Only password reset sends mail now, so a fatal check would block deploying.
  Don't make it fatal again unless a feature genuinely needs email at signup.
- **Leftover `isVerified` / `verificationToken` in existing documents are inert** —
  Mongoose ignores undeclared paths. No migration is required;
  `npm run migrate:remove-verification-fields` is an optional tidy-up.
- **Email tokens are stored as SHA-256 digests only** (`src/utils/emailTokens.js`).
  Fast hash is correct because the input is 256 bits of CSPRNG — do not "improve"
  it to bcrypt. Reset links are built from `CLIENT_URL` only; never from `Host`.
- **The Resend SDK does not throw on API rejection** — it resolves
  `{ data: null, error }`. Handle both shapes or a refused message reads as sent.
- **Zod errors carry the full path** (`body.token`); the client strips the
  prefix. Express 5 leaves `req.body` undefined for a bodyless POST, so an
  empty-body schema needs `.optional()`.
- **Dashboard payloads are stats objects, not arrays** — never `data.projects.length`.
- `POST /subtasks` returns the parent under `subtask`; `PATCH` returns the subtask.

## Testing

- `node:test` + `assert/strict` + `supertest`. `npm test` needs `"tests/*.test.js"`.
- **Always pin `MONGOMS_VERSION=6.0.14`** or `mongodb-memory-server` downloads
  8.2.6 (781 MB, ~40 min here). `MONGOMS_VERSION=6.0.14 TEST_DB=mongodb npm test`
  runs a single-node **replica set** → **375/375 green**. Default in-process store:
  366 pass + 9 skipped.
- **The test DB must be a REPLICA SET.** `MongoMemoryServer.create()` is a
  *standalone*, so `supportsTransactions()` is false, `runAtomically` takes its
  no-session path, and transaction assertions pass **for the wrong reason**. Use
  `MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } })`.
  **Trap:** `getUri()` already appends `?replicaSet=`; appending again → 30s
  `ServerSelectionError`.
- **Trap:** a file whose import chain reaches `src/config/env.js` must import
  `./helpers/setup.js` (side-effect only) BEFORE those imports, or it dies at load
  with `Invalid environment configuration` and reports zero assertions.
- `tests/helpers/memoryStore.js` validates on **create** but NOT update, enforces no
  unique indexes, and cannot populate an array of refs. It also cannot create a
  comment (`POST …/comments` → **400** under the store, **201** against real
  MongoDB). Not a product bug.
- Fixtures go through the **models** (`minlength: 2` on project/task names).
- Activity tests go through the **API**. `makeDocument` cannot represent a populated
  `members[].user` — assert the *decision*, never its contents.

## Machine — never claim otherwise

- **Docker is NOT installed**; `Dockerfile`/`docker-compose.yml` unverified. The one
  gate never executed.
- Disk is fine now (~60 GB free); if it fills, `tsc` and headless Chrome die with
  native crash traces that look like code bugs. Network is slow (~250–570 KB/s).
- Sandbox blocks a build tool emptying its own output dir: Vite fails with
  `SAFE_DELETE_BULK_CONFIRM_REQUIRED` on a large `dist/assets`. Delete `dist/` first
  (`find dist -type f -delete && find dist -type d -empty -delete`).
- **`127.0.0.1` ≠ `localhost` on Windows** — Vite binds IPv6 `::1`.

## Running the real stack (no Atlas)

`MONGOMS_VERSION=6.0.14 TEST_DB=mongodb node client/dev/boot-real-api.mjs` boots the
real `server/app.js` on :5000 against **real MongoDB** (`NODE_ENV=test`, rate limiting
off, no backend file modified). Frontend: build + `npx vite preview --port 4173`. The
in-memory store **wipes on restart** — re-seed before verifying.

## Frontend

React 19 + Vite + Tailwind v4 + TS. All scripts pass: `typecheck` 0 · `lint`
**0 errors / 16 `react-refresh` warnings** (intentional) · `format:check` clean ·
`build` exit 0. **No test script and no runner installed** — `npm run qa`
(145 checks), `npm run verify:fixes` (20) and `npm run verify:reset` (14) are the
regression surface. Backend suite is **435/435** under `TEST_DB=mongodb`.

- `qa` and `verify:fixes` seed through the real API and need `node dev/boot-real-api.mjs`
  on :5000 plus `vite preview` on :4173. `verify:reset` additionally reads emailed
  reset links from the **dev mailbox** on `127.0.0.1:5051`, which that harness serves
  from the test suite's recording email transport. Harness only — `server/app.js` has
  no such route and must not.
- **`Input` sets no `name` attribute** unless one is passed. The auth forms pass it;
  the dialogs do not (`id` comes from the label). In a harness, scope dialog fields
  with `[role="dialog"] input`, not `input[name=…]`.

- `/api` **and `/uploads`** are proxied by Vite; base URL is the relative
  `/api/v1`. Both are load-bearing: `CORS_ORIGINS` is unset and the cookie is
  `SameSite=Strict`. **Without the `/uploads` proxy an avatar path falls through
  to the SPA fallback and returns `200 text/html`** — the `<img>` fails to decode
  and silently shows initials, so a working upload looks broken. `curl` returns
  200 either way; check `content-type`. A production deploy must route `/uploads`
  to the API too.
- **A dialog `<form>` must be `ModalForm`, not a bare `<form>`.** `ModalContent`
  is `flex flex-col` + `max-h` + `overflow-hidden` and relies on `ModalBody`'s
  `flex-1 overflow-y-auto`. A bare form is not a flex container and keeps
  `min-height: auto`, so it grows past `max-h` and the footer is clipped. The
  `min-h-0` on `ModalForm` is the load-bearing part.
- **Session policy: 15-minute absolute, no refresh token, no sliding renewal.**
  Cookie `Max-Age` and JWT `exp` must agree — `env.js` derives one from the other
  and warns on mismatch. Only a **401** tears the session down; 400 and 403 must
  not. `session-lifetime.test.js` pins all of it.
- `useMutation.run` resolves to a discriminated outcome, never `T | undefined`.
- Comment editing is author-only; deletion honours `comment:moderate`. Deliberately
  two predicates, not one.
- **Editing a project is a workspace operation, not a project one** — a project owner
  cannot rename their own project. Gate on `can.manageProjects`.
- **An icon inside an icon-only trigger must be `pointer-events-none`**, or the
  `<svg>` becomes the hit target and the menu silently never opens.
- **List filters live in the query string** (`useSearchParams`). `assignee` and
  `unassigned` are one control: the API rejects a query with both.
- `useUnreadCount` returns `{ count, refresh }`.
- **`ActivityAction` is an open union** (`(string & {})`) — every render must fall
  back to `humaniseEnum`, or a new server action shows a blank row.
- **Upload progress needs XHR** (`uploadWithProgress` in `lib/api/client.ts`).
- **`TableSkeletonRows` must sit inside a `<Table>`.**
- Two OpenAPI gaps are hand-typed on purpose: the invitation `token` **is** returned,
  and `GET …/labels` also returns `pagination`.
- **A component must declare any prop it forwards** — TS does not check hyphenated
  attributes like `aria-label`, so an undeclared one compiles and is silently dropped.

### Frontend traps — cost real time

- **A bare `:focus-visible` does NOT beat a utility.** `.focus-visible\:outline-none:focus-visible`
  (0,2,0) out-ranks `:focus-visible` (0,1,0), so the ring was silently stripped from
  `Input`, `PasswordInput`, `Select`, `Checkbox`, `Tabs` — the app shipped with **no
  visible keyboard focus**. Global rules are wrapped in `:where()`; don't un-wrap them.
- **Keyboard-only rules need a real key event.** `element.focus()` never satisfies
  `:focus-visible`, so testing a ring that way reports a **false failure against a
  correct page**. Use `pressKey` in `dev/cdp.mjs`.
- **`sr-only` looks exactly like clipped content** — a 1×1px clipped box *by design*.
  Filtering invisibility from *descendant* styles fails: the clipped element **is** the
  sr-only span. Exclude by the defining rule (clipped **and** ≤1px, or out of flow).
- **Do not filter console 401s by message text** — it also hides a genuine 401. Tag by
  phase. Legitimate 401s: wrong-password login, and the anonymous session probe (first
  `/login` load, and after sign-out).
- `fixed` + `w-full` + `right-0` exceeds the viewport once padding is added. Derive
  from available space (`inset-x-0 … w-auto max-w-full`).
- `/login` uses `RequireAnonymous`, so an authenticated browser is redirected off it —
  sign out first. `/design` is public; Login does **not** use `AppShell`, so it has no
  skip link — test that on an authenticated page.
- **`--color-body-subtle` is `#6e6a63`**, not `#7c7871`. It is used at 11–12px where AA
  needs 4.5:1; the old value was 4.28:1 on canvas. Don't lighten it without re-measuring.

## Deliberately unfixed

- `authorize.middleware.js` is dead code; `reorderTaskSchema` is unused.
- **`deleteWorkspace` does not cascade** — it calls only `workspace.deleteOne()`,
  orphaning projects, tasks, comments, labels, activities, invitations, attachments.
  `purgeAttachmentsForProject|Task` exist and are never called. A product decision.
- `team.service.js` "cannot change your own role" guard is unreachable.
- `qa-results.json` is generated; only `.prettierignore` covers it, not `.gitignore`.
