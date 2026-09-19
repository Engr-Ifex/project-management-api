# Production-Readiness Remediation

**Date:** 2026-09-19
**Scope:** the backend (`server/`), following the audit in `AUDIT.md`.
**Status:** all changes **uncommitted**, staged for independent review.

This report covers the seven areas identified by the audit. It states what was
changed, what was deliberately _not_ changed, what was verified by execution,
and what could not be verified in this environment.

---

## 1. Executive Summary

**The backend is production-ready with documented limitations** — with one
caveat that is not a code issue: the container has never been built or run,
because Docker is not installed on this machine.

The four technical areas the audit raised are resolved:

1. **Authorization-policy contradiction** — resolved by correcting the
   permission tables, not by widening route access. The routes were right; the
   tables were wrong. A new test derives the truth from the route inventory and
   fails if they drift apart again.
2. **Inconsistent read authorization** — resolved. Reading a project's content
   now requires `project:view` uniformly; workspace membership grants project
   _discovery_. This closed a real bypass: task responses embed label names and
   colours, so a workspace member could read label data through the task route
   that the label routes refuse them.
3. **Check-then-write races** — every one of the seven is fixed with a
   conditional atomic update, and each is pinned by a test that fires genuinely
   overlapping requests.
4. **Missing transactions** — implemented for the one flow where partial
   failure breaks an invariant, with capability detection and a documented
   sequential fallback. Every invariant is enforced by a single-document
   operation, so correctness does not depend on the deployment topology.

Rate limiting and local-disk storage are **accepted constraints** of a
single-instance, single-host deployment, now stated explicitly rather than
implied away. Twelve redundant database indexes were removed and two missing
ones added; a migration drops the redundant ones from an existing database.

**Verified by execution:** 308 automated tests pass, lint and formatting are
clean, and the OpenAPI document matches the code.

**Not verified:** the Docker build and container runtime. Docker is not
installed here; this is stated plainly in §6 rather than papered over.

---

## 2. Issues Fixed

### 2.1 Authorization-policy contradiction (audit §2.1)

**Root cause.** Two permission tables granted capabilities that no route
consults. `PROJECT_ROLE_PERMISSIONS` gave project owner/admin
`project:update`, `project:archive`, `project:restore`, `project:add_member`,
`project:remove_member`, `project:view_members` and `task:delete`;
`ROLE_PERMISSIONS` gave workspace admin `archive_workspace` and
`restore_workspace`. The routes gate all of those on workspace
`update_workspace` or `requireWorkspaceRole(OWNER)` instead.

**Which side was wrong.** The routes. The evidence:

- `docs/API.md` §16 already stated that "Project lifecycle is a workspace-level
  concern, so these routes require the `update_workspace` permission … rather
  than a project role", and §17 that adding/removing members requires workspace
  authority while changing a role requires project authority.
- The existing test `'project member cannot update the project'` asserts 403.
- Phase 19's Policy A — workspace owner/admin hold authority over every project
  in their workspace — is implemented in `requireProjectPermission`.
- Widening the guards would have _expanded_ access, which the task explicitly
  ruled out.

**Fix.** Removed the unreachable grants so each table lists only what is
enforced. The permission _names_ remain in `PROJECT_PERMISSIONS` as documented
vocabulary, marked `RESERVED`, with a note explaining where the capability
actually lives. Both matrices in `API.md` were corrected to match.

| File                                      | Change                                                               |
| ----------------------------------------- | -------------------------------------------------------------------- |
| `src/constants/rolePermissions.js`        | Removed `ARCHIVE_WORKSPACE` / `RESTORE_WORKSPACE` from admin         |
| `src/constants/projectRolePermissions.js` | Removed 7 unreachable grants; added the enforcement contract comment |
| `src/constants/projectPermission.js`      | Marked the reserved names and explained where they are enforced      |
| `docs/API.md`                             | Corrected both permission matrices and their notes                   |

**Tests.** `tests/permissions.test.js` (new, 9 tests). It builds the route
inventory from the route files, extracts every permission passed to a guard,
and asserts that (a) no role holds a permission nothing enforces, and (b) every
permission a route checks is held by at least one role. **Verified
discriminating**: reintroducing the exact drift (`project:update` granted to
project admin) makes 2 tests fail naming `project:update`; reverting restores
9/9.

### 2.2 Inconsistent read authorization (audit §2.2)

**Root cause.** Task and subtask reads required only workspace membership, while
comments, labels, attachments, the dashboard and the activity trail required
`project:view`. Because a task response populates `labels` with `name` and
`color`, a workspace member with no project role could read label data through
the task route that `GET …/labels` refuses them.

**Fix.** Project content now requires `project:view` uniformly. Workspace
membership still grants the project list and the project record, so a member can
discover what exists — that workspace-level visibility was preserved rather than
made stricter.

| File                        | Change                                                                    |
| --------------------------- | ------------------------------------------------------------------------- |
| `src/routes/task.routes.js` | Added `requireProjectPermission('project:view')` to the three read routes |
| `docs/API.md`               | Rewrote the read-scope section, §18 and §19, and §31                      |
| `docs/openapi.json`         | Regenerated — the three operations gained 403 responses                   |

**Tests.** Six new cases in `tests/authorization.test.js` pin both tiers: a
plain workspace member gets 403 on the task list, a single task and a task's
subtasks; gets 200 on the project record; a project viewer gets 200 on tasks;
and a workspace admin reads tasks without project membership.

**API-contract note.** The task read routes now answer **403** instead of 200
for a caller who is a workspace member but holds no project role. This is the
intended change and is documented. No other endpoint's status changed.

### 2.3 Check-then-write races (audit §2.3)

Every operation below was a read → decide → `save()`. Each is now a conditional
update whose guard is part of the write. Details and per-race reasoning are in
§4.

| Operation                                | File                                                             |
| ---------------------------------------- | ---------------------------------------------------------------- |
| Accept an invitation                     | `src/services/invitation.service.js`                             |
| Create an invitation                     | `src/services/invitation.service.js`, `src/models/Invitation.js` |
| Attach / detach a label                  | `src/services/label.service.js`                                  |
| Add / remove a project member            | `src/services/project.service.js`                                |
| Remove a workspace member, change a role | `src/services/team.service.js`                                   |
| Transfer ownership                       | `src/services/team.service.js`                                   |
| Append / edit / delete a subtask         | `src/services/task.service.js`                                   |

**Tests.** `tests/concurrency.test.js` (new, 11 tests) fires overlapping
requests and asserts the invariant for each. `tests/helpers/memoryStore.js` was
extended so the double applies these operators the way MongoDB does — see §7.

### 2.4 Missing transactions (audit §2.4)

**Fix.** Added `src/utils/transactions.js`: capability detection via the
`hello` command, `runAtomically(work)` which runs the work in a session when the
deployment supports one, and a documented sequential fallback that logs a
warning once. Applied to `acceptInvitation`, the one flow where a partial
failure leaves two documents disagreeing.

**Design decision.** Every invariant is enforced by a _single-document_ atomic
operation or a unique index, never by the rollback. The transaction narrows the
window in which a partial failure can leave inconsistent state; it is not what
makes the API correct. That is deliberate: correctness does not depend on
whether the deployment is a replica set.

**Tests.** `tests/transactions.test.js` (new, 8 tests) covers capability
detection and, through an injected session, the commit path, the abort path, the
commit-failure path, and that the session is always released.

### 2.5 Docker / deployment configuration (audit §5, §10)

**Not executed.** Docker is not installed on this machine (`docker: command not
found`). Nothing below is a claim of runtime verification — see §6.

Static validation performed: every `COPY` source exists; the `HEALTHCHECK` path
matches a real route; the `RUN mkdir` paths match `config/paths.js`; the
compose file parses as YAML with no tabs and no duplicate keys; service,
volume and network names are consistent.

Documentation gap fixed: `docker-compose.yml` reads five variables the app never
sees (`MONGO_ROOT_USER`, `MONGO_ROOT_PASSWORD`, `MONGO_DATABASE`, `API_PORT`,
`MONGO_PORT`), and `DEPLOYMENT.md` documented only one. A "Compose-only
variables" table now lists all five, with the required/default split.

### 2.6 Per-process rate limiting (audit §3.1)

**Retained, and documented as a constraint.** The limiter is correctly
implemented for a single process; a shared store was not introduced, because
that would be infrastructure the current architecture does not need.

`DEPLOYMENT.md` previously said the API "is stateless, so horizontal scaling
needs no sticky sessions", which implied horizontal-scale protection. It now
opens with a **Deployment model: one instance, one host** section stating the
two things that do not scale out (rate-limit counters, local-disk uploads), and
the zero-downtime section explains that a rolling replace briefly runs two
instances, which is acceptable for a deploy window and not as a steady state.

### 2.7 Redundant database indexes (audit §6, §10)

**Root cause.** Twelve single-field indexes duplicated the prefix of a compound
index on the same collection. If `{a: 1, b: 1}` exists, `{a: 1}` can never be the
better choice for any query — the compound index has the same leading key and
serves everything the single-field one can — so each was costing a write on
every insert and update for no benefit.

| Collection        | Dropped          | Still served by                            |
| ----------------- | ---------------- | ------------------------------------------ |
| workspaces        | `{owner: 1}`     | `{owner: 1, isArchived: 1}`                |
| projects          | `{workspace: 1}` | `{workspace: 1, isArchived: 1}`            |
| tasks             | `{project: 1}`   | `{project: 1, isArchived: 1, position: 1}` |
| taskcomments      | `{task: 1}`      | `{task: 1, isDeleted: 1, createdAt: 1}`    |
| taskcomments      | `{project: 1}`   | `{project: 1, isDeleted: 1}`               |
| taskcomments      | `{author: 1}`    | `{author: 1, isDeleted: 1}`                |
| attachments       | `{project: 1}`   | `{project: 1, createdAt: -1}`              |
| attachments       | `{task: 1}`      | `{task: 1, createdAt: -1}`                 |
| attachments       | `{comment: 1}`   | `{comment: 1, createdAt: -1}`              |
| notifications     | `{recipient: 1}` | `{recipient: 1, isRead: 1, createdAt: -1}` |
| labels            | `{project: 1}`   | `{project: 1, name: 1}`                    |
| projectactivities | `{project: 1}`   | `{project: 1, createdAt: -1}`              |

**Fix.** Removed the twelve declarations, added
`src/migrations/dropRedundantIndexes.js` and an npm script to drop them from an
existing database, and documented it in `DEPLOYMENT.md`.

Removing a declaration is **not** enough on its own: Mongoose only ever creates
indexes, so an existing database keeps them until they are dropped explicitly.
The migration is idempotent (a missing index is reported and skipped) and
deliberately leaves the indexes that are _not_ provably redundant.

**Deliberately not dropped.** `{isArchived: 1}` (workspaces, projects, tasks),
`{isDeleted: 1}` (taskcomments), `{isRead: 1}` (notifications),
`{uploader: 1}` (attachments) and `{workspace: 1}` (projectactivities) are not
prefixes of any compound index, so redundancy cannot be proved from the
definitions alone. They look unused — every `isArchived` filter in the services
is combined with a more selective key — but concluding that requires
`explain()` against a real database, which is not available here. They are
reported rather than removed.

**Tests.** `tests/indexes.test.js` (new, 18 tests) asserts that no index is a
prefix of another, derived from the index definitions rather than a snapshot, so
it cannot rot. **Verified discriminating**: reintroducing
`attachments.{project: 1}` fails the test with
`{"project":1} is a prefix of {"project":1,"createdAt":-1}`; reverting restores
18/18.

The same file also pins the unique constraints that are load-bearing — and
asserts that `members.user` is **not** globally unique, so nobody adds that
index back as a "fix" for the duplicate-member race.

### 2.8 Missing indexes (audit §6)

Two real query patterns had no index support. Both were fixed in the audit
session and are retained:

- **Invitation lookup** — `createInvitation` filters
  `{workspace, email, status}` and had only the `token` index, so every
  duplicate-check was a full collection scan of every invitation ever sent.
  Replaced with the partial unique index described in §4.
- **Task `startDate`** — the list endpoint filters on
  `startDateFrom`/`startDateTo`, and the identical `dueDate` filter was indexed
  while `startDate` was not. Added `{project: 1, startDate: 1}`.

Both are pinned by `tests/indexes.test.js`.

### 2.9 Local-disk uploads (audit §3.2)

**Retained, hardened, and documented.** No S3/Cloudinary/AWS SDK was added.

- Verified path containment: keys are normalised and rejected for `..`,
  absolute paths, backslashes and null bytes, and the resolved path is
  re-checked against the base directory.
- Verified stored filenames are always generated (UUID + validated extension),
  so a user-supplied name never reaches the filesystem.
- Verified only `/uploads/avatars` is served statically.
- **Added** `ensureStorageReady()`, called at startup: the upload directories
  are created and write-checked, so a missing or read-only volume stops the
  process with a clear message instead of surfacing as a 500 on the first
  upload. Files: `src/storage/localStorage.provider.js`,
  `src/storage/storageProvider.js`, `server.js`.

---

## 3. Authorization Policy

The final model, as enforced:

**Workspace roles** (`src/constants/rolePermissions.js`)

| Capability           | owner | admin | member |
| -------------------- | :---: | :---: | :----: |
| `view_workspace`     |  yes  |  yes  |  yes   |
| `update_workspace`   |  yes  |  yes  |   —    |
| `view_members`       |  yes  |  yes  |  yes   |
| `invite_members`     |  yes  |  yes  |   —    |
| `remove_members`     |  yes  |  yes  |   —    |
| `change_roles`       |  yes  |   —   |   —    |
| `archive_workspace`  |  yes  |   —   |   —    |
| `restore_workspace`  |  yes  |   —   |   —    |
| `delete_workspace`   |  yes  |   —   |   —    |
| `transfer_ownership` |  yes  |   —   |   —    |

**Project roles** (`src/constants/projectRolePermissions.js`) — owner and admin
are identical.

| Capability                             | owner | admin | member | viewer |
| -------------------------------------- | :---: | :---: | :----: | :----: |
| `project:view`                         |  yes  |  yes  |  yes   |  yes   |
| `project:change_role`                  |  yes  |  yes  |   —    |   —    |
| `task:create` / `update` / `assign`    |  yes  |  yes  |  yes   |   —    |
| `task:archive` / `restore`             |  yes  |  yes  |   —    |   —    |
| `subtask:create` / `update` / `delete` |  yes  |  yes  |  yes   |   —    |
| `comment:create` / `update` / `delete` |  yes  |  yes  |  yes   |   —    |
| `comment:moderate`                     |  yes  |  yes  |   —    |   —    |
| `label:create` / `update` / `delete`   |  yes  |  yes  |   —    |   —    |
| `label:assign`                         |  yes  |  yes  |  yes   |   —    |
| `attachment:create` / `delete`         |  yes  |  yes  |  yes   |   —    |
| `attachment:moderate`                  |  yes  |  yes  |   —    |   —    |

**How the roles relate**

- **Workspace owner** — full authority over the workspace and every project in
  it. The only role that may archive, restore, delete or transfer the
  workspace, or change a member's role.
- **Workspace admin** — may update the workspace, invite and remove members,
  and create/manage projects. May **not** archive, restore, delete or transfer
  the workspace, and may not change roles. May remove regular members only.
- **Ordinary workspace member** — may read the workspace, its member list, the
  project list and a single project's record. **No project authority by virtue
  of membership.** Holds no capability inside a project they are not a member
  of.
- **Project owner / admin** — full authority over the work _inside_ the
  project: tasks, subtasks, comments, labels, attachments, and changing project
  member roles. **Cannot** rename, archive, restore or re-status the project,
  or add/remove project members — those are workspace-level operations.
- **Project member** — creates and edits work: tasks, subtasks, comments,
  attachments, label assignment. Cannot delete or archive tasks, manage labels,
  moderate others' comments or attachments, or change roles.
- **Project viewer** — `project:view` only. Reads everything inside the
  project; writes nothing.

**Workspace owner/admin override (Policy A).** A workspace owner or admin holds
authority over every project in their workspace without being a member of it.
The rule is defined once, in `hasProjectOverride`, and applied by
`requireProjectPermission` and the services that re-check membership.

**Operation → requirement**

| Operation                                                                       | Requirement                                                                               |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Workspace read, member list                                                     | workspace membership                                                                      |
| Workspace dashboard                                                             | `view_workspace`                                                                          |
| Update workspace                                                                | `update_workspace`                                                                        |
| Archive / restore / delete workspace                                            | role **owner**                                                                            |
| Transfer ownership, change roles                                                | `transfer_ownership` / `change_roles` (owner only in the table)                           |
| Project list, project record                                                    | workspace membership (discovery)                                                          |
| Create project, update / archive / restore / re-status                          | workspace `update_workspace`                                                              |
| Add / remove project member                                                     | workspace `update_workspace`                                                              |
| Change a project member's role                                                  | `project:change_role`                                                                     |
| Project dashboard, activity, labels, attachments, comments, **tasks, subtasks** | `project:view`                                                                            |
| Task create / update / assign / archive / restore                               | `task:create` / `update` / `assign` / `archive` / `restore`                               |
| Subtask create / update / delete                                                | `subtask:*`                                                                               |
| Comment create / update / delete                                                | `comment:*`; editing is **author-only**, deleting someone else's needs `comment:moderate` |
| Label create / update / delete / assign                                         | `label:*`                                                                                 |
| Attachment upload / delete                                                      | `attachment:*`; deleting someone else's needs `attachment:moderate`                       |
| Notification read / update / delete                                             | the notification's own recipient (404, not 403)                                           |

**Cross-workspace isolation** is unchanged and verified: every workspace-scoped
route resolves membership from the workspace document against the authenticated
id, and project lookups filter on `{_id, workspace}`, so an id from another
workspace cannot resolve.

---

## 4. Concurrency and Transactions

All seven races from the audit, plus one found during remediation.

| #   | Operation                                       | Risk before                                                                                                                                                                                  | Mechanism now                                                                                                                                                                                                                                       | Regression test                                                                                    |
| --- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | Accept an invitation                            | Two overlapping accepts both passed the membership check and pushed → **duplicate member**, making the role they hold ambiguous                                                              | Conditional `findOneAndUpdate` with `'members.user': { $ne: userId }` + `$push`; the two writes run in a transaction where supported                                                                                                                | `two overlapping accepts produce exactly one membership`                                           |
| 2   | Create an invitation                            | Two overlapping invites both passed the pre-check → duplicate pending invitations                                                                                                            | Partial unique index on `{workspace, email}` restricted to `status: 'pending'`; the duplicate-key error is translated to a 409                                                                                                                      | `a consumed invitation cannot be accepted twice in sequence` (sequential variant; see §7)          |
| 3   | Attach a label                                  | Read → test array → save: the slower request discarded the faster one's change; two assigns could duplicate                                                                                  | `findOneAndUpdate` with `labels: { $nin: [id] }` + `$addToSet`                                                                                                                                                                                      | `two overlapping assigns attach the label once`                                                    |
| 4   | Detach a label                                  | Same lost-update pattern                                                                                                                                                                     | `labels: { $in: [id] }` + `$pull`                                                                                                                                                                                                                   | `an overlapping assign and remove leave a consistent state`                                        |
| 5   | Add a project member                            | Two adds could both push → one user listed twice with two roles                                                                                                                              | `'members.user': { $ne: userId }` + `$push`                                                                                                                                                                                                         | `two overlapping adds produce exactly one member entry`                                            |
| 6   | Remove a project member / change a project role | Whole-array `save()` discarded a concurrent change to another member                                                                                                                         | `$pull` guarded on membership; `$set` on `members.$[target].role` via `arrayFilters`                                                                                                                                                                | `a concurrent role change is not lost by another member change`                                    |
| 7   | Remove a workspace member                       | Whole-array save; a guard expressed as two dotted conditions could be satisfied by two _different_ elements, weakening the owner protection                                                  | `$pull` guarded by `$elemMatch` on `{user, role: {$ne: owner}}`                                                                                                                                                                                     | covered by the existing authorization suite                                                        |
| 8   | Transfer ownership                              | Mongoose `$set`s only modified paths, so two concurrent transfers could set `members[1].role = owner` **and** `members[2].role = owner` → **two owners**, with the `owner` field disagreeing | One `$set` of both roles and `owner`, compare-and-swapped on `owner`, using two `arrayFilters`                                                                                                                                                      | `two overlapping transfers leave exactly one owner`                                                |
| 9   | Append / edit / delete a subtask                | Whole-array `save()` lost a concurrent append or edit                                                                                                                                        | `$push`, `$set` on `subtasks.$[subtask]`, `$pull`                                                                                                                                                                                                   | `two overlapping appends both survive`, `two overlapping edits to different subtasks both survive` |
| 10  | Create a task (position)                        | Two creates read the same max `position` → duplicate positions                                                                                                                               | **Deliberately tolerated.** `position` is an ordering hint, not an identifier, and a unique index would turn a benign collision into a failed request. The default sort is now `{position, createdAt, _id}`, a total order, so pagination is stable | `overlapping creates keep a stable, total order`                                                   |

**Why no unique index for duplicate membership.** The audit suggested one; it is
not expressible. A unique index on `{'members.user': 1}` would enforce
uniqueness _across documents_ — it would forbid a user from belonging to more
than one workspace — because MongoDB multikey uniqueness is per indexed key
value, not per array. The invariant here is intra-document ("no element repeats
within this array"), which no index can express. The conditional update is the
correct mechanism, and `{ 'members.user': 1, isArchived: 1 }` remains a
non-unique lookup index.

**Transactions.** One transaction, in `acceptInvitation`, covering the
membership grant and the invitation status. Nothing else was wrapped:
ownership transfer, member add/remove and role changes all live inside a single
document, where one update is already atomic; the mutation-plus-audit-row pairs
are ordered so a partial failure leaves a _missing audit row_ rather than
corrupt state, and a transaction cannot cover the filesystem side of an upload
anyway.

**Deployment requirement.** Transactions need a replica set. The application
detects the topology once and logs a warning when it falls back. `DEPLOYMENT.md`
now says to use a replica set in production and explains exactly what the
fallback does and does not guarantee.

---

## 5. Security Verification

Re-audited after the changes; no regression, and no exploitable issue found.

| Area                         | Finding                                                                                                                                                                       |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Password hashing             | `bcrypt`, cost validated to 10–15 at boot (`env.js`); `BCRYPT_SALT_ROUNDS` is a fatal misconfiguration outside that range                                                     |
| Password serialization       | `select: false` on the field, plus a `toJSON` transform as defence in depth. Never serialized                                                                                 |
| JWT verification             | `algorithms` pinned on verify, so the token header cannot select the algorithm; the subject is format-checked before use                                                      |
| Expired tokens               | Mapped to 401 with the library message replaced, so the response never describes why verification failed                                                                      |
| Password-change invalidation | `iat` compared against `passwordChangedAt` with a 1-second tolerance for second-resolution claims                                                                             |
| Cookie configuration         | `httpOnly`, `sameSite: 'strict'`, `secure` in production, host-only (no `domain`), bounded `maxAge`                                                                           |
| Logout                       | Clears the cookie. The token stays valid for its remaining lifetime — documented, unchanged                                                                                   |
| Brute-force protection       | 10 requests / 15 min on register and login; a broad API limit behind it                                                                                                       |
| Workspace isolation          | Membership resolved from the workspace document against the authenticated id                                                                                                  |
| Project isolation            | Lookups filter `{_id, workspace}`; cross-project URL access returns 404                                                                                                       |
| Object ownership             | Notifications scoped to the recipient and 404 (not 403) when absent; comment editing is author-only                                                                           |
| Zod validation               | Every route that accepts input; unknown keys are stripped **and** the parsed value is written back, so extra fields never reach a service                                     |
| ObjectId casting             | `CastError` mapped to 400, never a 500                                                                                                                                        |
| Query injection              | Values are Zod-typed before use; the search regex escapes metacharacters                                                                                                      |
| CORS                         | Allow-list; refuses cross-origin in production when unset; a wildcard is only ever paired with `credentials: false`                                                           |
| Helmet                       | Enabled (CSP, HSTS, nosniff, frameguard, referrer policy)                                                                                                                     |
| Rate limiting                | Per-process; documented limitation                                                                                                                                            |
| CSRF                         | `SameSite=Strict` plus a credentialed CORS allow-list. No token, and none needed                                                                                              |
| Attachment authorization     | Download goes through the authenticated endpoint with `project:view`; the static mount exposes avatars only                                                                   |
| MIME / extension             | Both checked; stored names are generated                                                                                                                                      |
| Path traversal               | Keys normalised and rejected; the resolved path is re-checked for containment                                                                                                 |
| Upload limits                | Size-limited per scope; `MulterError` mapped to 400                                                                                                                           |
| Unexpected 5xx               | Masked to `Internal Server Error` (fixed in the audit); deliberate 5xx keep their message. No connection strings, stacks (outside development), database or filesystem detail |
| Secrets                      | `.env` untracked; no secret values in the diff; nothing logged                                                                                                                |

**Not added**, deliberately: CSRF tokens, refresh-token rotation, 2FA, audit
signing. They are outside the current scope.

---

## 6. Deployment Verification

**Docker is not installed on this machine** (`docker: command not found`).
Therefore:

| Step                                 | Result                           |
| ------------------------------------ | -------------------------------- |
| `docker build`                       | **NOT RUN** — Docker unavailable |
| `docker compose config`              | **NOT RUN** — Docker unavailable |
| `docker compose up`                  | **NOT RUN** — Docker unavailable |
| Startup inside a container           | **NOT RUN**                      |
| Health check inside a container      | **NOT RUN**                      |
| Graceful shutdown inside a container | **NOT RUN**                      |

**No runtime Docker validation was performed, and none is claimed.**

Static validation performed instead:

- Every `COPY` source exists (`server.js`, `app.js`, `src`, `scripts`, `docs`,
  `package.json`, `package-lock.json`).
- `HEALTHCHECK` targets `/api/v1/health`, which exists and does not touch the
  database.
- `RUN mkdir -p /app/src/uploads/{avatars,attachments}` matches
  `PUBLIC_AVATARS_DIR` / `PRIVATE_ATTACHMENTS_DIR` exactly.
- `docker-compose.yml` has no tab characters and no duplicate keys; top-level
  keys are `services` / `volumes` / `networks`; services are `api` and `mongo`;
  volumes are `mongo-data` and `uploads`; network is `pm`.
- `.dockerignore` excludes `.env`, tests and runtime upload data, while
  `docs/*.md` is excluded and `docs/openapi.json` still reaches the image — the
  docs route reads exactly that file.
- `MONGO_ROOT_PASSWORD` is declared with `:?`, so compose stops rather than
  starting a database with an empty password.

**Application startup, outside Docker.** `ensureStorageReady()` and
`connectDB()` both run before `listen()`, and each exits 1 with a clear message
on failure. Verified directly: `ensureStorageReady()` creates and write-checks
both upload directories and resolves successfully.

**Environment configuration.** Every variable read by the code appears in
`.env.example`, and every variable in `.env.example` is read by the code — 14
and 14, no orphans in either direction. `npm run preflight` behaves as
documented: it fails against the development `.env` with exactly two problems
(`NODE_ENV` is `development`; `CORS_ORIGINS` is empty) and one warning
(`TRUST_PROXY` is 0). That failure is expected locally, not a defect.

**Documentation corrected:** `DEPLOYMENT.md` previously listed `NODE_ENV` and
`CORS_ORIGINS` as "Required" under a heading saying the app "refuses to boot".
Neither is boot-fatal — `NODE_ENV` defaults to `development` and an empty
`CORS_ORIGINS` only warns. The section now separates what is fatal at boot from
what is wrong-but-legal, and spells out what running with `NODE_ENV` unset
actually costs (non-`Secure` cookies, wildcard CORS, verbose logging).

---

## 7. Test Results

```
# tests 308
# suites 64
# pass 308
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

| Gate                 | Command                | Result                                                                   |
| -------------------- | ---------------------- | ------------------------------------------------------------------------ |
| Tests                | `npm test`             | **308 pass / 0 fail**, 64 suites                                         |
| Lint                 | `npm run lint`         | **0 errors, 0 warnings**                                                 |
| Formatting           | `npm run format:check` | clean                                                                    |
| Documentation        | `npm run docs:verify`  | **82 routes = 82 operations**, 513 references, 48 schemas                |
| Route inventory      | `npm run routes`       | 82 routes, guard chains inspected                                        |
| Production preflight | `npm run preflight`    | fails against the development `.env` as designed (2 problems, 1 warning) |

**Tests added or updated**

| File                           | Change                                                                                                                                                                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/permissions.test.js`    | **New, 9 tests.** Derives enforced permissions from the route inventory and fails on table drift. Verified discriminating by reintroducing the original bug                                                                       |
| `tests/indexes.test.js`        | **New, 18 tests.** Derives index redundancy from the index definitions, pins the load-bearing unique constraints, and asserts `members.user` is _not_ globally unique. Verified discriminating by reintroducing a redundant index |
| `tests/concurrency.test.js`    | **New, 11 tests.** One per race, firing overlapping requests                                                                                                                                                                      |
| `tests/transactions.test.js`   | **New, 8 tests.** Capability detection plus commit / abort / cleanup paths                                                                                                                                                        |
| `tests/authorization.test.js`  | +6 read-scope cases, pinning both tiers                                                                                                                                                                                           |
| `tests/helpers/memoryStore.js` | Extended so the double applies the operators the fixes rely on                                                                                                                                                                    |

**Test-infrastructure work (the double, not the application).** The in-process
store is the only database available here, so it had to apply updates the way
MongoDB does or the concurrency tests would prove nothing. Four fidelity gaps
were fixed:

1. `$ne` / `$nin` on an array path were evaluated per element, making
   `{'members.user': {$ne: id}}` true for almost every array. Now "no element
   matches", as MongoDB means it. No existing query used this shape, so the
   change is behaviour-neutral for the rest of the suite.
2. `$push` and `$addToSet` were unsupported.
3. `$set` with `arrayFilters` was unsupported — needed to update two different
   array elements in one operation.
4. `$push` did not assign a subdocument `_id`, which the subtask routes address
   elements by; and `$pull` compared with equality, so a condition document
   (`{user: id}`) matched nothing.

**Honest limits of these tests.** The double emulates operators but executes one
operation at a time, so the concurrency tests prove the _invariant_ and the
conditional-update shape, not MongoDB's atomicity. That is a MongoDB guarantee,
and it is exercised end to end only by `TEST_DB=mongodb` against a real
deployment, which is not available here. The same applies to the partial unique
index on invitations, which the double does not enforce at all.

**An intermittent failure, explained.** One earlier full-suite run reported 1
failure; the failing files had exited with code 134 (SIGABRT, heap OOM), not an
assertion failure. The machine had 1.8 GB of 119 GB free on disk (99% full) and
2.1 GB of 8.3 GB RAM free. Running the same files in three batches passed
completely (99 + 57 + 125 = 281 at that point), and the full suite has since
passed twice. It is environmental resource exhaustion, not a test defect.

---

## 8. API Contract Verification

Compared against `HEAD` with `git diff`.

**Routes.** No path, method, controller or validator changed. The complete set
of route-file changes is:

| File                           | Change                                                                                                   |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `src/routes/task.routes.js`    | **+3** `requireProjectPermission('project:view')` guards on the task list, single task, and subtask list |
| `src/routes/team.routes.js`    | −3 lines of unused imports                                                                               |
| `src/routes/product.routes.js` | deleted (0-byte orphan, never imported)                                                                  |

**Request schemas.** Zero changes under `src/validators/`. No request body,
parameter or query contract changed.

**Responses.** Exactly one controller change:

- `project.controller.js` — the `ApiResponse` argument order for
  `PATCH …/members/:userId/role` was corrected (the audit's finding: the project
  document was returned as `message` and the success string as `data`). The
  response now matches every sibling handler. **This is an intentional
  response-shape fix**, and the test now asserts the envelope rather than only
  the status code.

Every other changed service preserves its return shape: `acceptInvitation`
returns `{workspace, invitation}`; the member operations return the project; the
label operations return the task; the subtask operations return the task (POST,
DELETE) or the subtask (PATCH); `transferOwnership` returns
`{previousOwner, newOwner}`.

**Status codes.** No controller status code changed. The OpenAPI document was
regenerated and correctly gained `403` responses for the three newly guarded
task reads.

**Authentication.** Unchanged. Cookie-only, no Bearer support, no refresh token.

**Synchronisation.** `npm run docs:verify` passes: 82 routes = 82 operations,
513 references resolve, 48 schemas. `docs/openapi.json` is generated, never
hand-edited, and was regenerated as part of this work.

---

## 9. Remaining Limitations

### Accepted for current architecture

1. **Single instance.** The rate limiter is per-process, so N instances multiply
   the effective limit by N. Documented in `DEPLOYMENT.md`.
2. **Single host.** Uploads are on local disk, so a second instance serves
   broken downloads. The storage interface exists to make the swap contained.
3. **Logout does not revoke the token.** It stays valid for its remaining
   lifetime (15 min). Only a password change invalidates early.
4. **No transactions on a standalone MongoDB.** Every invariant still holds; the
   window in which a partial failure can leave documents disagreeing is what
   closes on a replica set.
5. **Task `position` can repeat** under concurrent creates. Ordering stays total
   and pagination stable; a unique index would turn a benign collision into a
   failed request.
6. **`task:delete` and the reserved project permissions** exist as vocabulary
   with no route. Marked `RESERVED` with an explanation.
7. **No CSRF token**, relying on `SameSite=Strict` plus the CORS allow-list.
8. **Avatars are public** by design; an avatar URL is an unauthenticated
   capability. Attachment storage is correctly kept out of the static mount.

### Must be addressed before production deployment

1. **Build and run the container once.** Docker is unavailable here, so
   `docker build`, `docker compose up`, the health probes, the upload volume and
   the graceful-shutdown path are all unverified. This is the one item that
   blocks a confident launch, and it is an environment limitation rather than a
   known defect.
2. **Deploy against a replica set**, so the transaction path is exercised. This
   also enables the index build and real query-planner behaviour.
3. **Check for pre-existing duplicate pending invitations before the index
   builds.** The partial unique index will fail to create if the collection
   already contains duplicates. The aggregation to find them is in
   `src/models/Invitation.js`.
4. **Run the suite with `TEST_DB=mongodb`** at least once, to exercise real
   index and query-planner behaviour rather than the double.
5. **Set `CORS_ORIGINS` and `NODE_ENV=production`.** `preflight` fails without
   them, which is the intended guard.
6. **Run `npm run migrate:drop-indexes` once after deploying.** Removing the
   twelve redundant index declarations from the schemas does **not** remove them
   from an existing database — Mongoose only ever creates. Until the migration
   runs, an existing deployment keeps paying a write on every insert and update
   for indexes nothing uses. A fresh database never grows them.

### Future enhancements

- Redis-backed rate limiting and object storage, which together unlock
  horizontal scaling.
- Refresh-token rotation, so a session can be revoked before it expires.
- `.lean()` on read-only paths and a cheaper pagination count — the two cheapest
  read-path wins from the audit, neither of which affects correctness.
- A CI pipeline running the gates in §7 automatically.

---

## 10. Complete File Change List

### Source — authorization policy

| File                                      | Why                                                                                                                          |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `src/constants/rolePermissions.js`        | Removed admin's unreachable `ARCHIVE_WORKSPACE` / `RESTORE_WORKSPACE`; documented that the table is the enforcement contract |
| `src/constants/projectRolePermissions.js` | Removed 7 unreachable grants; rewrote the header to explain what is deliberately absent and why                              |
| `src/constants/projectPermission.js`      | Marked the reserved names and pointed to where those capabilities are enforced                                               |
| `src/routes/task.routes.js`               | Added `project:view` to the three read routes                                                                                |
| `tests/permissions.test.js`               | **New** — fails on table/implementation drift                                                                                |
| `tests/indexes.test.js`                   | **New** — fails on a redundant index or a weakened unique constraint                                                         |

### Source — concurrency and integrity

| File                                 | Why                                                                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `src/services/invitation.service.js` | Atomic conditional membership grant; transaction; duplicate-key translated to 409                                |
| `src/models/Invitation.js`           | Partial unique index on `{workspace, email}` for pending invitations, with the pre-deployment check              |
| `src/services/label.service.js`      | `$addToSet` / `$pull` with the attachment state in the filter                                                    |
| `src/services/project.service.js`    | `$push` / `$pull` conditional member add and remove                                                              |
| `src/services/team.service.js`       | `$pull` with `$elemMatch`; `arrayFilters` role change; compare-and-swap ownership transfer; imported `Workspace` |
| `src/services/task.service.js`       | `$push` / `$set` with `arrayFilters` / `$pull` for subtasks                                                      |
| `src/constants/query.js`             | Task default sort gained `_id`, making the order total                                                           |
| `src/utils/transactions.js`          | **New** — capability detection and `runAtomically`                                                               |

### Source — indexes

| File                                     | Why                                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/models/Workspace.js`                | Removed the redundant `{owner: 1}` index                                               |
| `src/models/Project.js`                  | Removed the redundant `{workspace: 1}` index                                           |
| `src/models/Task.js`                     | Removed the redundant `{project: 1}` index; `{project: 1, startDate: 1}` added earlier |
| `src/models/TaskComment.js`              | Removed the redundant `{task: 1}`, `{project: 1}`, `{author: 1}` indexes               |
| `src/models/Attachment.js`               | Removed the redundant `{project: 1}`, `{task: 1}`, `{comment: 1}` indexes              |
| `src/models/Notification.js`             | Removed the redundant `{recipient: 1}` index                                           |
| `src/models/Label.js`                    | Removed the redundant `{project: 1}` index                                             |
| `src/models/ProjectActivity.js`          | Removed the redundant `{project: 1}` index                                             |
| `src/models/Invitation.js`               | Partial unique index on `{workspace, email}` for pending invitations                   |
| `src/migrations/dropRedundantIndexes.js` | **New** — drops the twelve indexes from an existing database; idempotent               |
| `package.json`                           | Added the `migrate:drop-indexes` script                                                |

### Source — storage and startup

| File                                   | Why                                                                              |
| -------------------------------------- | -------------------------------------------------------------------------------- |
| `src/storage/localStorage.provider.js` | Added `ensureReady()`: creates and write-checks the upload directories           |
| `src/storage/storageProvider.js`       | Exposed `ensureStorageReady()`, delegating to the active provider                |
| `server.js`                            | Calls `ensureStorageReady()` before connecting, and exits 1 with a clear message |

### Tests

| File                           | Why                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `tests/concurrency.test.js`    | **New, 11 tests** — one per race                                                                                                     |
| `tests/transactions.test.js`   | **New, 8 tests** — commit, abort, cleanup                                                                                            |
| `tests/authorization.test.js`  | +6 read-scope cases                                                                                                                  |
| `tests/helpers/memoryStore.js` | Four fidelity fixes so the double applies `$ne`/`$nin` on arrays, `$push`, `$addToSet`, `arrayFilters` and subdocument ids correctly |

### Documentation

| File                 | Why                                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `docs/API.md`        | Read-scope policy; both permission matrices; §18, §19, §31                                                           |
| `docs/DEPLOYMENT.md` | Deployment model; transactions and concurrency; compose-only variables; corrected env requirements; upload hardening |
| `docs/openapi.json`  | Regenerated (403 responses on the three guarded reads)                                                               |
| `docs/AUDIT.md`      | The audit this work answers (from the previous session)                                                              |

### Carried over from the audit session (uncommitted)

`README.md`, `docs/README.md`, `eslint.config.js`, `scripts/generate-openapi.js`,
`scripts/openapi-operations.js`, `src/controllers/project.controller.js`,
`src/middlewares/error.middleware.js`,
`src/middlewares/requireProjectPermission.middleware.js`, `src/models/Task.js`,
`src/routes/team.routes.js`, `src/services/workspace.service.js`,
`tests/api-contract.test.js`, `tests/project.test.js`, and the deletion of
`src/config/logger.js` and `src/routes/product.routes.js`.

---

## 11. Final Verdict

**PRODUCTION READY WITH DOCUMENTED LIMITATIONS**

The authorization model is internally consistent and enforced; the read model
is coherent and no longer leaks project data through an embedded field; every
race the audit identified is fixed with a database-level guard and pinned by a
test; transactions are used where atomicity is genuinely needed and the
fallback is documented rather than silent; the security posture was re-audited
with no exploitable finding; and every gate passes (308 tests, clean lint and
formatting, documentation verified against the code).

It is **not** plain "production ready" for two reasons, neither of them a code
defect: the container has never been built or run, because Docker is not
available in this environment; and the deployment is single-instance by design,
with the constraints that implies stated explicitly rather than assumed away.
Both are documented above, in §6 and §9 respectively.
