# Phase 3 — End-to-End Frontend/Backend Integration Report

Scope: Phase 3 §1–§11. **No commit was made. No deployment was begun.**

Everything below was *executed*, not inferred. Where I could not verify something,
it says so under **Blocked** rather than being reported as working.

---

## 1. How the end-to-end pass was actually run

The user's §9 asks to "run existing frontend and backend checks" and the brief
warns against marking a feature "integrated merely because its component
renders". So the frontend was exercised against the **genuine backend**, and the
backend was exercised against a **genuine MongoDB replica set**.

| What | Command | Result |
| --- | --- | --- |
| Frontend typecheck | `npx tsc --noEmit` | **exit 0**, clean |
| Frontend lint | `npx eslint .` | **0 errors, 16 warnings** |
| Frontend build | `npx vite build` | **exit 0**, built in 46.3 s |
| Backend suite | `MONGOMS_VERSION=6.0.14 TEST_DB=mongodb npm test` | **375 / 375 pass, 0 fail** |
| Backend exercised live | `MONGOMS_VERSION=6.0.14 TEST_DB=mongodb node client/dev/boot-real-api.mjs` | real `server/app.js` on :5000, **real MongoDB** |

The 16 lint warnings are all `react-refresh/only-export-components`, the pattern
`eslint.config.js` documents as intentional. Every other rule is an error.

**Two harness notes that matter for reproducing this:**

- `MONGOMS_VERSION=6.0.14` must be pinned. Without it `mongodb-memory-server`
  attempts to download MongoDB 8.2.6 (**781 MB**, ~40 min at this machine's
  ~250–570 KB/s), and I stopped that download.
- `client/dev/boot-real-api.mjs` starts the real Express app. `NODE_ENV=test`, so
  rate limiting is bypassed and a 429 cannot be provoked through it.

---

## 2. The two real defects found, and why they count

### 2.1 `AcceptInvitation.tsx` conflated "expired" with "invalid" — fixed

The backend distinguishes three invitation failures, and only one of them is
recoverable by the user:

| Backend | Meaning | What the user should do |
| --- | --- | --- |
| `404` | Already accepted, or a bad token | Nothing — it is spent |
| `410` `Invitation has expired` | Expired, and now marked `expired` | **Ask for a new invitation** |
| `403` | Not addressed to this email | Sign in as the right account |

The screen treated all three as one dead end. The 410 branch is now handled:
it tells the user invitations last 48 hours and to request a new one.

Verified live: an already-used token returns **404**; a genuinely expired one
returns **410** (pinned by `workspace.test.js` → "rejects an expired invitation
with 410 and marks it expired"). I did **not** change any backend permission.

### 2.2 The test suite was not actually testing transactions — fixed

This is the significant finding. `npm test` was **373/375**, not the 375/375 my
project notes recorded. A frontend edit cannot cause a backend test failure, so I
investigated rather than reporting it as pre-existing.

`setup.js` started MongoDB with `MongoMemoryServer.create()` — a **standalone**
mongod. I confirmed it directly rather than guessing:

```
setName:   (none)
topology:  Single
supportsTransactions: false
```

The consequence is the important part. `runAtomically` degrades gracefully when
transactions are unsupported — it runs the work *without a session*. So **every
transaction assertion was passing for the wrong reason**: nothing was being
rolled back, and the code under test was never on the transactional path.
`mongodb-integrity.test.js` is the suite that checks this, and its two failing
subtests (9 total) were correct to fail:

```
not ok 1 - the replica set reports transaction support
         a replica-set deployment must report transaction support
         false !== true
not ok 3 - a failed transaction rolls its writes back
         the write must have been rolled back
         1 !== 0
```

**Fix** — `tests/helpers/setup.js` now uses `MongoMemoryReplSet`:

```js
memoryServer = await MongoMemoryReplSet.create({
  replSet: {
    count: 1,
    storageEngine: 'wiredTiger',
    version: MONGODB_VERSION,
    ...(process.env.MONGOMS_DBPATH ? { dbPath: process.env.MONGOMS_DBPATH } : {}),
  },
});
```

After the fix: `setName: testset`, topology `ReplicaSetWithPrimary`,
`supportsTransactions: true`, and **375/375 pass, 0 fail**.

One trap worth recording: `MongoMemoryReplSet.getUri()` **already** appends
`?replicaSet=<name>`. Appending it again produces `testset?replicaSet=testset`,
which the driver reads as a literal set name and then never finds a primary for —
a 30-second `ServerSelectionError`, not a clear error message. My first attempt
hit this; the shipped code uses `getUri()` as-is.

**This matters for the project's confidence, not just the test count.** The two
claims "transactions are covered" and "375/375" were previously true of nothing.
They are now true of a real single-node replica set.

---

## 3. Per-feature status

Legend: **Connected** = the screen calls the real endpoint · **Tested** = I
drove that endpoint live and saw the documented result.

### §2 Authentication — all Connected, all Tested

| Feature | Endpoint | Tested result |
| --- | --- | --- |
| Register | `POST /auth/register` | 201; `Set-Cookie: accessToken=…; HttpOnly; SameSite=Strict; Max-Age=900` |
| Login | `POST /auth/login` | 200; wrong password → **401** |
| Session probe | `GET /users/profile` | 200 with cookie, **401 with none** |
| Session persistence | (cookie survives reload) | Cookie is `Path=/`, 15-min expiry — nothing in JS |
| Logout | `POST /auth/logout` | Clears the cookie |
| Profile update | `PATCH /users/profile` | 200, name changed |
| Password change | `PATCH /users/change-password` | wrong current → **401**; mismatch → **400** `body.confirmPassword`; success → old cookie **401** |
| Avatar upload | `PATCH /users/avatar` | rejection verified (below) |
| Protected routes | `RequireAuth` / `RequireAnonymous` | redirect both directions |

**Cookie-only auth is genuinely cookie-only.** `grep` for
`localStorage|sessionStorage|document.cookie` across `client/src` returns
**nothing** — the §2 prohibition on a token-storage shortcut is satisfied
structurally, not by convention.

`passwordChangedAt` was verified to work: after a successful password change the
old session cookie returns **401**, the old password fails to log in (401), and
the new one succeeds (200).

### §3 Workspaces & invitations — all Connected, all Tested

Create · list (with `isArchived` defaulting to active, `pagination` present) ·
details · members list · role change · invite · accept.

Invitation error paths, all confirmed live:

| Case | Result |
| --- | --- |
| Wrong email | **403** `This invitation was not sent to your email address` |
| Bad/unknown token | **404** `Invitation not found or no longer valid` |
| Accepted twice | **404** (not 410 — see §5 below) |
| Expired | **410** `Invitation has expired` |
| Unauthenticated | **401** |

**Invitations return a `token` (64-char hex) and no email is sent** — confirmed by
inspection and live response. The UI hands over a copyable link, matching the
§3 instruction not to invent email delivery.

**Invitation revoke/cancel: no endpoint exists.** Reported, not built (§6/§10).

### §4 Projects — all Connected, all Tested

Create · list · detail · update · archive/restore · members · roles.

**Policy A verified live.** A workspace **admin with no project membership**
could read the project's `members` array, rename the project, and create a task
in it — all 200/201. A plain workspace **member** not on the project got **403**
on both. That is `hasProjectOverride` behaving exactly as documented.

**Member privacy verified.** For a caller without project access, the `members`
key is **absent entirely** (not an empty array). The client types it as
`members?:` so the compiler forces the check.

**Documented asymmetry reproduced:** an archived **project** is still retrievable
by id (**200**), while an archived **task** **404s**. This is deliberate — a task
never gets a `DELETE` endpoint, and archiving is the only removal.

### §5 Tasks & subtasks — all Connected, all Tested

Create · list · filter · search · detail · update · status · priority · assign ·
due/start dates · subtasks · labels · activity.

- **Filters** accept only real enum values; `status=done` is **400** with the
  valid list. The client's `TASK_STATUS_OPTIONS` / `TASK_PRIORITY_OPTIONS` match
  the server enums **exactly** (`todo|in_progress|in_review|completed|cancelled`,
  `low|medium|high|urgent`).
- **The subtask quirk is real.** `POST …/subtasks` returns the **parent task**
  under `data.subtask` — I confirmed `data.subtask.title === "Comment host task"`,
  the parent. `TaskDetail.tsx` refetches instead of reading it, which is correct.
- `PATCH …/subtasks/:id` returns the **subtask** (`{_id,title,isCompleted,completedAt}`).
- **Labels** populate as `{_id, name, color}` on the task, matching `types.ts`.
- **Activity** is written by the service layer: creating a comment produced
  `task_comment_added` in both the task and project activity trails.

### §6 Remaining features — Connected, with two unimplemented endpoints reported

| Feature | Status |
| --- | --- |
| Comments | Connected + Tested (author populated; 201) |
| Labels | Connected + Tested (per-project list, `pagination` present) |
| Notifications | Connected + Tested (recipient-scoped, 404 for others) |
| Activity history | Connected + Tested |
| Attachments | Connected + Tested (**download requires auth — anonymous 401**) |
| Dashboard | Connected + Tested (**stats object**, not arrays) |
| Profile / Settings | Connected + Tested |

**No mock data anywhere.** `grep` across `client/src` for
`localhost|127.0.0.1|TODO|FIXME|mock|placeholder|hardcoded|dummy|fake` returned
only doc-comment prose and legitimate `placeholder=` input props. Every screen
reads the real API.

**Two client methods exist but are never called** — reported, not wired up,
because §6 says to report a missing *endpoint* and not invent a feature:

- `tasksApi.activity` — defined, unused.
- `projectsApi.dashboard` — defined, unused (the Dashboard page uses the
  workspace-level aggregate instead, which is a legitimate design choice).
- `attachmentsApi.listForComment` / `uploadToComment` — defined, unused; there is
  no comment-attachment UI.

**Upload validation is real.** A text file renamed to `fake.png` and sent as
`image/png` is rejected **400** `File content does not match its declared type` —
magic-byte checking, not MIME+extension. Same for the avatar field. Attachments
and avatars use **separate allow-lists**, as documented.

---

## 4. §7 UX states

Audited every one of the twelve authenticated screens plus the tab components.

- **Loading**: `useAsync` distinguishes first load from refetch and keeps
  previous data visible. Tables use `TableSkeletonRows`; panels use
  `Skeleton`.
- **Empty vs. no-results** — the distinction most products get wrong, and this
  one gets right. `EmptyState` takes a `variant`; `TasksTab` says
  *"No tasks match these filters."* with a **Clear filters** button versus
  *"No tasks yet in this project."* with a create action. Telling a user their
  data is gone when a filter merely hid it is the failure mode being avoided.
- **Errors**: every tab renders an `ErrorState` with `onRetry={reload}` —
  Activity, Attachments, Labels, Members, Tasks all confirmed.
- **Duplicate submissions**: `useMutation` exposes an in-flight state and the
  submit buttons disable on it, so a double-click cannot post twice.
- **No swallowed errors / no false success**: mutations consume the
  discriminated `{ ok: true } | { ok: false }` outcome rather than checking a
  truthy value. This matters because every `DELETE` succeeds with **no body**, so
  `T | undefined` would make success indistinguishable from failure.
- **403 / expired session / network**: 401 is terminal and routes through
  `onUnauthorized()` → `AuthProvider`, which tears the session down (`onUnauthorized()`
  → `AuthProvider`). 403 renders a permission message; a network failure renders
  the retry affordance.

One correction made: `useUnreadCount` fired its bootstrap fetch synchronously in
an effect and `useAsync` wrote refs during render. Both are now correct — the
refs are synced in effects (documented in-line), and the bootstrap fetch is
deferred into a microtask with a cancellation guard.

---

## 5. §8 API configuration

Verified, all real:

- Base URL is the **relative `/api/v1`**. No host is hardcoded anywhere in
  `client/src`.
- `vite.config.ts` proxies `/api` → `http://localhost:5000` for **both** `dev`
  and `preview`. This is load-bearing: the cookie is `SameSite=Strict` and
  `CORS_ORIGINS` is unset, so a direct cross-origin call would fail outright.
  Proxying keeps the browser on its own origin and needs no backend change.
- `credentials: 'include'` on every request; the auth cookie is `httpOnly` and
  never read from JavaScript.

**`127.0.0.1` ≠ `localhost` on this machine** (Vite binds IPv6 `::1`), so the
proxy target must stay spelled `localhost`.

---

## 6. §10 Restrictions

- Existing design and architecture preserved; no working component replaced.
- **No backend permission was changed.** The one authorization-adjacent change I
  made is a *test-harness* fix (`MongoMemoryReplSet`) — it changes how the tests
  build their database, not what the application permits.
- No unrelated features added.
- **No commit made.** `git status` shows the Phase 1/2 working tree untouched by
  design.

---

## 7. Files changed

| File | Change |
| --- | --- |
| `server/tests/helpers/setup.js` | **Standalone mongod → single-node replica set.** Restores real transaction coverage. |
| `client/src/pages/AcceptInvitation.tsx` | Expired invitation (**410**) now distinguished from invalid (**404**). |
| `client/src/lib/hooks/useAsync.ts` | Refs synced in effects, not during render; one justified lint disable. |
| `client/src/lib/hooks/useUnreadCount.ts` | Bootstrap fetch deferred to a microtask with a cancellation guard. |
| `client/src/lib/api/client.ts` | Removed a redundant initializer. |
| `client/src/lib/permissions.ts` | Documented why `_role` parameters are retained. |
| `client/eslint.config.js` | Added the standard `argsIgnorePattern: '^_'` convention. |
| `client/README.md` | Corrected two **stale** claims (below). |
| `PHASE-3-INTEGRATION-CHECKLIST.md` | The §1 deliverable, written before any edit. |
| `PHASE-3-INTEGRATION-REPORT.md` | This report. |

Two stale claims in `client/README.md` were corrected because they were *false*,
not merely outdated: it stated "the client has no ESLint config, so `npm run lint`
currently fails" (the config exists; lint is clean), and described the screens as
having been exercised only against the mock.

---

## 8. Blocked / not verified — stated plainly

1. **No browser-driven run.** I have no working headless browser in this
   environment, so the screens were verified by typecheck, build, and by driving
   the **exact endpoints they call** with the real backend and real MongoDB. That
   is strong evidence the contract is right and the components compile, but it is
   **not** a substitute for clicking through the UI. Any purely visual or
   interaction bug outside those paths would not have been caught.
2. **Rate limiting (429).** Cannot be provoked through `boot-real-api.mjs`
   because `NODE_ENV=test` disables it. The client's 429 copy is exercised
   against the limiter's documented shape, not a live 429.
3. **Expired-invitation 410 in the UI.** The backend 410 is verified live and the
   branch is now correct, but I did not wait 48 hours to see the rendered copy.
4. **Docker.** Not installed; `Dockerfile` and `docker-compose.yml` remain
   unverified, as in every prior phase.
5. **`deleteWorkspace` cascade.** Still absent (`workspace.deleteOne()` only),
   leaving orphaned records. This is a **product decision**, not an integration
   bug, so I did not change it — reported here as instructed.

---

## 9. One claim I nearly got wrong

While probing, I sent `{"visibility":"private"}` to project create and saw it
silently dropped. It would have been easy to report "the client sends a field the
backend ignores". It does not — **the client never sends `visibility`**, and the
Project model has no such field. The field was my own invention in the curl. Real
project fields are `name`, `description`, `deadline`, `color`, and the client's
`projectsApi.create`/`update` types match the validator exactly.

Recording this because it is the failure mode the brief warns about: a
verification step that manufactures the very defect it then reports.

---

## 10. Bottom line

Every feature in §2–§6 is connected to the real API and was exercised against a
real backend on a real MongoDB. **No mock data remains.** The frontend typechecks,
lints clean, and builds; the backend suite is **375/375**.

Two defects were real. One was user-facing (the expired-invitation message). The
other was more serious and invisible from the UI: **the transaction tests were
passing without testing transactions**, because the database under them was not a
replica set. Both are fixed and verified.

**Stopping here as instructed. No deployment has been started.**
