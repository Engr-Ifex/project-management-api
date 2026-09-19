# Engineering Audit — Production Readiness

**Date:** 2026-09-17
**Scope:** the whole backend (`server/`), reviewed as a pre-launch gate.
**Commit at time of audit:** `b71c80a` (plus the fixes listed in §5, applied during the audit).

This is a point-in-time report. It states what was checked, what was found, what was
changed, and what is still open. Where a claim depends on running something, the command
that produced the evidence is given.

**Bottom line up front: not yet production-ready.** The code is in good shape — no
exploitable vulnerability was found, and every automated gate passes — but there are open
authorization-consistency and concurrency issues, and the deployment path has never been
executed. See §10 for the specific blockers.

---

## 1. Critical issues

**None found.** No exploitable vulnerability, privilege escalation, cross-workspace data
leak, or authentication bypass was identified.

That is a statement about the evidence, not a clean bill of health. Specifically verified
rather than assumed:

| Risk                           | Evidence it is handled                                                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cross-workspace access         | Every workspace-scoped route resolves membership from the workspace document itself against the authenticated id (`workspace.middleware.js:14`). No id from the request is trusted for identity. |
| Cross-project access           | Project lookups filter `{_id: projectId, workspace: workspaceId}` (`requireProjectPermission.middleware.js:19`), so a project id from another workspace cannot resolve.                          |
| Privilege escalation via input | Unknown keys are stripped by Zod and the parsed value is written back (`validate.middleware.js:30`), so extra fields never reach a service.                                                      |
| Object-level access            | Notifications are queried as `{_id, recipient: userId}` and 404 — not 403 — when absent, so existence is not leaked (`notification.service.js:305`).                                             |
| Invitation theft               | `acceptInvitation` verifies the accepting user's email matches the invitation (`invitation.service.js:97`); a stolen token alone is useless.                                                     |
| JWT confusion                  | `algorithms` is pinned on verify (`authenticate.middleware.js:28`), and the payload's subject is format-checked before use.                                                                      |
| Attachment exposure            | Only `/uploads/avatars` is static; everything else under `/uploads` 404s (`app.js:120-125`).                                                                                                     |
| Password leakage               | `select: false` on the field, plus a `toJSON` transform as defence in depth (`User.js:26,71`).                                                                                                   |

---

## 2. High-priority issues

### 2.1 The permission tables contradict the route guards

Two role/permission tables describe capabilities that no route honours. Both contradict in
the same direction — the table is _more_ permissive than the route — so nothing is
over-permitted, but the tables cannot be trusted when reading the code.

| Granted in the table                                                         | Where                             | Actually enforced by                                                          | Result                                               |
| ---------------------------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------- |
| `ARCHIVE_WORKSPACE`, `RESTORE_WORKSPACE` for workspace **admin**             | `rolePermissions.js:35-36`        | `requireWorkspaceRole(OWNER)` — `workspace.routes.js:56,65`                   | An admin is denied a capability the table grants     |
| `UPDATE_PROJECT`, `ARCHIVE_PROJECT`, `RESTORE_PROJECT` for project **admin** | `projectRolePermissions.js:51-53` | `requireWorkspacePermission(UPDATE_WORKSPACE)` — `project.routes.js:59,68,77` | Unreachable                                          |
| `ADD_PROJECT_MEMBER`, `REMOVE_PROJECT_MEMBER` for project **admin**          | `projectRolePermissions.js:67-68` | Same                                                                          | Unreachable                                          |
| `project:change_role`                                                        | —                                 | `requireProjectPermission` — `project.routes.js:130`                          | The only project-level guard among member operations |

The practical effect: a user who is a **project** admin but only a workspace _member_
cannot update, archive or manage members on the project they administer. The sibling
operation (`PATCH …/members/:userId/role`) uses a project permission, so within
project-membership management, adding a member needs workspace admin while changing a
role needs project admin.

**Not changed deliberately.** Altering the guards would change who can do what — a policy
decision, and one that could widen access. This needs a decision, not a patch.

### 2.2 Read authorization is inconsistent between sibling resources

Writes are uniformly project-scoped. Reads are not:

| Read                                                                               | Requirement                   |
| ---------------------------------------------------------------------------------- | ----------------------------- |
| The project, its task list, a single task, its subtasks, the workspace member list | **workspace membership only** |
| Dashboard, activity trail, labels, attachments, comments                           | `project:view`                |

So a workspace member holding no project role can read every project's tasks and subtasks
— including full descriptions — but not its comments or labels. This makes the project
`VIEWER` role meaningless for task reads, and the restriction is leaky anyway: the task
document embeds its `labels`, so label names are readable on a task that label _listing_
is denied for.

The asymmetry looks deliberate (the code comments say so), but it was never stated as a
policy and it is not consistently applied. It should be an explicit decision.

### 2.3 Check-then-write race conditions

Every one of these is a read → decide → `save()` sequence with no atomic guard. Two
concurrent requests interleave and corrupt state. None is exploitable for privilege gain;
all are data-integrity bugs.

| Location                             | Consequence                                                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------- |
| `invitation.service.js:109-130`      | Two concurrent accepts push the member **twice**                                            |
| `invitation.service.js:28-44`        | Two concurrent invites create duplicate pending invitations                                 |
| `label.service.js:206-214,240-248`   | Concurrent assign/remove → lost update or duplicate label                                   |
| `project.service.js:255-277,323-339` | Concurrent add/remove → duplicate or lost project member                                    |
| `team.service.js:97-110`             | Concurrent ownership transfers can leave the `owner` field and `members[].role` disagreeing |
| `task.service.js:58-70`              | Two concurrent creates read the same max `position` → duplicate positions                   |
| `task.service.js:737-741,826-836`    | Whole-array subtask `save()` clobbers concurrent subtask edits                              |

The fix pattern is the same in each case: a conditional atomic update (`findOneAndUpdate`
with the precondition in the filter, or `$addToSet`/`$pull`) instead of read-then-save.

### 2.4 No multi-document transactions

Zero uses of `startSession` / `withTransaction` in `src/`. Several flows write two
documents and can fail between them:

- `acceptInvitation` (`invitation.service.js:124-130`) — if the second `save()` fails, the
  user is a member while the invitation stays `pending` and is therefore re-acceptable.
- Audit rows are written by the service layer after the mutation, so a failure between the
  two leaves an action with no activity record (`task.service.js`, `taskComment.service.js`,
  `attachment.service.js`, `project.service.js`, `label.service.js`).

The application database is Atlas (a replica set), so transactions are _available_; a
standalone local MongoDB — which is what `.env.example` suggests — is not.

---

## 3. Medium-priority issues

1. **The rate limiter is per-process.** Counters live in each process's memory, so with N
   instances the effective limit is N × `RATE_LIMIT_MAX`. Documented in `DEPLOYMENT.md`,
   but it is a real constraint on horizontal scaling.
2. **Logout does not revoke the token.** `POST /auth/logout` clears the cookie; the token
   stays valid for its remaining lifetime (15 min). Documented. The only early
   invalidation is a password change.
3. **`NODE_ENV` unset silently degrades to development** — no `Secure` cookies, permissive
   CORS, debug logging (`env.js:37,57`). `npm run preflight` catches it, but only
   `start:prod` runs that; a bare `node server.js` does not.
4. **An admin can create more admins.** Invitation and role-change roles are limited to
   `admin | member` (`team.validator.js:7,31`) — good, no path to `owner` — but an admin can
   promote peers and invite new admins with no owner involvement.
5. **No partial unique index on pending invitations.** The service-level check narrows the
   window; only a unique index closes it. (Deliberately not added: a plain unique index
   over `{workspace, email, status}` would forbid two workspaces inviting the same address.)
6. **No TTL index on `Invitation.expiresAt`.** Expired invitations accumulate forever;
   expiry is only applied lazily when someone tries to accept one.
7. **`.lean()` is never used** — zero occurrences in `src/`. Every read hydrates full
   Mongoose documents, including the paginated list paths and dashboard aggregates.
8. **`countDocuments` runs on every paginated request** (`utils/query.js:111`), on top of
   the page query.
9. **Sorting is offered on unindexed fields.** `sortBy` accepts `title`, `updatedAt`,
   `name`, `size`, `type`, `readAt` across tasks/comments/labels/attachments/notifications
   (`constants/query.js`), none of which has an index — each is an in-memory sort.
10. **Search is a case-insensitive `$regex`** (`utils/query.js:37`) used on five collections.
    Correct and injection-safe (metacharacters are escaped) but index-hostile by
    construction.
11. **`PATCH /invitations/:token/accept` has no validator.** The raw `req.params.token` goes
    straight into a query. Low actual risk — it is an equality match on a unique indexed
    field — but it is the only state-mutating route with unvalidated input.
12. **Duplicated authorization logic.** The project-membership predicate is written out at
    ~10 sites and the workspace-membership predicate at 3; `members.find`/`members.some`
    appears 22 times across 9 files. The two comment/attachment deletion rules are the same
    rule written twice (`taskComment.service.js:95`, `attachment.service.js:119`).
13. **Routes hardcode permission strings** instead of importing the constants
    (`'project:view'` in `project.routes.js:112,121`, and in the task/label/attachment/comment
    routes). A typo would be a silent authorization failure; `PROJECT_PERMISSIONS` exists to
    prevent exactly that.

---

## 4. Low-priority improvements

1. **Dead code.** `src/middlewares/authorize.middleware.js` is never imported.
   `reorderTaskSchema` (`task.validator.js:238`) is never used — `position` is
   server-computed. Several exported helpers have no importer (`DEFAULT_ORDER`,
   `isValidWorkspaceRole`, `hasEqualOrHigherRole`, `MAX_FILENAME_LENGTH`, `BASE_DIR`).
   (Two 0-byte orphan files were deleted — see §5.)
2. **Naming inconsistency for the same concept.** The actor is `author` on comments,
   `uploader` on attachments, `createdBy` on projects/tasks, `user` on activity. A person
   is `userId`, `user`, `memberId`, `newOwnerId`, `actorId` depending on the file.
3. **Two modules named `query`** — `utils/query.js` and `constants/query.js`.
   `rolePermissions.js` exports `hasProjectOverride` (a project concept in a
   workspace-named file). `projectPermission.js` (singular) sits beside
   `projectRolePermissions.js` (plural).
4. **`error.middleware.js` reads `process.env.NODE_ENV` directly** instead of `env`, unlike
   the rest of the codebase.
5. **`express.urlencoded({ extended: true })`** is mounted but the API is JSON-only.
6. **No Swagger UI** — deliberate (avoids a CDN dependency and a relaxed CSP). The spec is
   importable into any OpenAPI tooling.
7. **`task:delete` is defined but unreachable** — tasks are archived, and no delete route
   exists. Inert permission.

---

## 5. Bugs fixed during the audit

| #   | Issue                                                                                                                                                                                                                                       | Location                                                                                                   | Change                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Broken response envelope.** `ApiResponse` was called with `message` and `data` swapped, so the project document was returned as `message` and the success string as `data`. The only such call site in the codebase.                      | `project.controller.js:138`                                                                                | Arguments corrected to the shape every sibling handler uses; envelope assertions added to the existing test.                                                                                                                                             |
| 2   | **Unexpected 5xx responses leaked the raw error message.** A non-`ApiError` reaching the handler returned `err.message` verbatim — which for driver errors can contain a connection string, host, or file path.                             | `error.middleware.js`                                                                                      | Unexpected 5xx are now masked to `Internal Server Error` with `errors` cleared; deliberate 5xx `ApiError`s keep their authored message (the docs 503 still tells an operator to run `docs:generate`). Full detail is still logged. Two tests added.      |
| 3   | **Full collection scan on every invitation.** The duplicate-invite check filters `{workspace, email, status}`; only `token` was indexed.                                                                                                    | `models/Invitation.js`                                                                                     | Added compound index `{workspace, email, status}`.                                                                                                                                                                                                       |
| 4   | **Unindexed date-range filter.** `startDateFrom`/`startDateTo` filtered on an unindexed field while the identical `dueDate` filter was indexed.                                                                                             | `models/Task.js`                                                                                           | Added `{project, startDate}`.                                                                                                                                                                                                                            |
| 5   | **Two 0-byte orphan files** — `src/config/logger.js`, `src/routes/product.routes.js`. Neither imported, neither containing anything.                                                                                                        | —                                                                                                          | Deleted.                                                                                                                                                                                                                                                 |
| 6   | **Five unused imports** producing the only lint warnings in the repo.                                                                                                                                                                       | `requireProjectPermission.middleware.js`, `team.routes.js` (×2), `team.service.js`, `workspace.service.js` | Removed. `eslint` is now **0 errors, 0 warnings** (was 0/6). The sixth warning was Express's required 4-arg error handler; `next` is now `_next` with an `argsIgnorePattern` in the ESLint config, so the arity is preserved and the intent is explicit. |
| 7   | **The OpenAPI contract published wrong status codes.** The generator hardcoded 201 for every POST; **four** endpoints answer 200 (login, logout, add project member, assign label). A client generated from the spec would mis-handle them. | `scripts/generate-openapi.js`, `scripts/openapi-operations.js`                                             | Per-operation `status` override added, documented, and applied to the four. Regenerated and verified.                                                                                                                                                    |
| 8   | **Documentation that contradicted the code**                                                                                                                                                                                                | `docs/API.md`, `docs/DEPLOYMENT.md`, `README.md`, `docs/README.md`                                         | See §5.1.                                                                                                                                                                                                                                                |

### 5.1 Documentation corrections

- `API.md` — task read routes listed `project:view`; they require only workspace
  membership. The "reads versus writes" section claimed comments are workspace-readable;
  they require `project:view`. The rate-limit note said all three auth routes are limited;
  logout is not. `upcomingDueDays` documented as 1–90; the code allows 1–365. The status
  table now names the four POSTs that return 200.
- `DEPLOYMENT.md` — claimed labels and comments are "returned in full"; both are paginated.
  Rewritten to describe which lists are genuinely unpaginated (the ones embedded in a
  parent document) and why.
- `README.md` — claimed Zod validation "for every route"; now "every route that accepts
  input". Test count updated 254 → 256.
- `docs/README.md` — documented `JWT_SECRET` / `JWT_EXPIRES_IN`, **neither of which is read
  by anything**; corrected to `JWT_ACCESS_SECRET` / `JWT_ACCESS_EXPIRES_IN`. The status
  section still said "Planning & Documentation" and listed Docker, file storage, the
  activity trail and API versioning as future work; the repository structure claimed a root
  `docs/` and a `LICENSE` that do not exist. All corrected, and the stale files are now
  marked as predating the implementation.

---

## 6. Tests performed

| Check                      | Command                | Result                                                                                   |
| -------------------------- | ---------------------- | ---------------------------------------------------------------------------------------- |
| Full suite                 | `npm test`             | **256 / 256 pass**, 45 suites, ~2 min                                                    |
| Lint                       | `npm run lint`         | **0 errors, 0 warnings**                                                                 |
| Formatting                 | `npm run format:check` | clean                                                                                    |
| Docs ↔ code                | `npm run docs:verify`  | **82 routes = 82 operations**, 513 refs resolve                                          |
| Route/guard inventory      | `npm run routes`       | 82 routes, every guard chain read                                                        |
| Production config          | `npm run preflight`    | correctly **fails** against the development `.env` (2 problems) — expected, not a defect |
| Activity enum ↔ usage      | static cross-check     | 30 values, all used, none missing                                                        |
| Notification types ↔ usage | static cross-check     | 7 values, all used, none missing                                                         |
| Fresh-clone format gate    | `git clone` + prettier | passes (see §7)                                                                          |

Two claims were checked and **disproved** rather than reported: the "dead" activity and
notification enum values are both used (in an assignment and a ternary respectively, which
a naive grep misses), and the documented test count of 254 was correct while a static
count of `test()` calls was not — tests are generated in loops.

Not covered by the suite, and therefore not verified here: real MongoDB query planning and
index behaviour (the default in-process store fakes the query transport), concurrent-write
behaviour, and anything requiring a running container.

---

## 7. Security findings

**No exploitable vulnerability found.** The posture is good: helmet with HSTS, a CORS
allow-list that refuses cross-origin access in production when unset, pinned JWT
algorithms, bcrypt hashing with a validated cost factor, per-IP rate limiting, body-size
limits, uploads restricted by MIME **and** extension with generated storage names, and a
documented refusal to log request bodies because they carry passwords.

Findings:

1. **Fixed — 5xx leaked internal error text** (§5 #2). The most concrete issue found.
2. **Sensitive information is not leaked in normal responses.** Passwords never serialize;
   notification endpoints 404 rather than 403; the error envelope omits the stack outside
   development.
3. **`GET /api/v1/openapi.json` is public**, which publishes the full API surface to
   unauthenticated callers. Normal for a documented API, but worth a conscious decision.
4. **Avatars are public** by design (`/uploads/avatars`), so an avatar URL is an unauthenticated
   capability. Attachment storage is correctly kept out of the static mount.
5. **Rate limiting covers only register/login specifically** (10/15 min) plus a broad API
   limit. Under `NODE_ENV=test` the limiter is skipped entirely — correct for the suite, but
   it means the limiter is not exercised end-to-end by it.
6. **Admin→admin promotion without owner approval** (§3 #4) — a horizontal
   privilege-expansion path, not an escalation to owner.

---

## 8. Performance findings

1. **Two missing indexes — fixed** (§5 #3, #4). The invitation scan was the worst: it grew
   with every invitation ever sent, in every workspace.
2. **Remaining unindexed access paths:** no TTL on `Invitation.expiresAt`; `sortBy` accepts
   six fields with no index behind them; the search regex cannot use an index by design.
3. **`.lean()` is never used**, so every read builds full hydrated documents — including
   the paginated list paths. The cheapest available win for read-heavy endpoints.
4. **`countDocuments` on every paginated request**, doubling the work of each list call.
5. **N+1 writes in notification fan-out:** a per-task query plus create inside a loop
   (`notification.service.js:205-224`) and a per-recipient notify loop
   (`taskComment.service.js:154-164`).
6. **Unbounded `find()`:** `Attachment.find(filter)` with no limit
   (`attachment.service.js:458`) and `Task.find(...)` (`notification.service.js:194`).
7. **`populate()` on unbounded arrays** — `members.user` is populated at nine sites in
   `project.service.js` and one in `team.service.js`.

Nothing here is a launch blocker at current scale. Items 3 and 4 are the ones that will
show up first under real traffic.

---

## 9. Remaining technical debt

- **The permission tables are partly decorative** (§2.1) — needs a policy decision.
- **Read scope is inconsistent** (§2.2) — needs a policy decision.
- **Race conditions in seven flows** (§2.3) — same fix pattern each time.
- **No transactions** (§2.4).
- **Duplicated authorization logic** in ~10 places, with the project-override policy already
  single-sourced but membership predicates not.
- **Permission strings hardcoded in routes** instead of imported.
- **`Dockerfile` and `docker-compose.yml` have never been built or run** — Docker is not
  installed on the development machine. They are unverified by execution and should be
  reviewed as code, not trusted as tested.
- **Graceful shutdown cannot be exercised on Windows** (Node does not deliver POSIX
  signals), so that path needs a Linux host or container to verify.
- **Eight early-phase documents** (`ARCHITECTURE.md`, `DATABASE.md`, `SECURITY.md`,
  `FEATURES.md`, `SETUP.md`, `ENVIRONMENT.md`, `VISION.md`, `CHANGELOG.md`) still predate
  the implementation. They are now labelled as such in `docs/README.md`, but they remain
  misleading if read on their own.
- **Response schemas in the OpenAPI document are hand-authored**, so a response-shape
  change is not caught automatically — only request schemas are generated.
- **No CI pipeline.** Every gate in §6 is run manually.

---

## 10. Final production-readiness assessment

**Not production-ready.** The evidence does not support a stronger conclusion.

What the evidence _does_ support: the application is functionally complete, its automated
gates all pass (256 tests, clean lint and formatting, a spec verified against the code),
its security fundamentals are sound, and no exploitable vulnerability was found in a
review that covered authentication, authorization, object-level access, tenant isolation,
uploads, error handling and secret handling.

What blocks a production launch, in order of what should be settled first:

1. **Decide the two authorization policies** (§2.1, §2.2). These are decisions, not bugs —
   but until they are made, the permission tables cannot be read as documentation and the
   read scope is inconsistent between sibling resources. This is the first thing to fix,
   because both other workstreams depend on the answer.
2. **Build and run the container.** The deployment artifacts have never been executed. Until
   `docker compose up` has been done once, deployment readiness is an assumption. Verify
   health probes, the upload volume, the graceful-shutdown path, and migrations against a
   real replica set (which transactions would also require).
3. **Fix the concurrency bugs** (§2.3) or explicitly accept them. Duplicate workspace
   members and lost updates are data corruption, and they are cheap to fix one at a time
   with conditional atomic updates.
4. **Address the operational constraints that a real launch exposes:** per-process rate
   limiting (so, single-instance only until it moves to a shared store), local-disk uploads
   (so, single-host only), and logout not revoking tokens.

None of these is architectural. The layering, validation, error handling and security
foundations are sound, and the codebase does not need restructuring — it needs the policy
decisions above, one real deployment, and a pass over the concurrency and indexing items.
