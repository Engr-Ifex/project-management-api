# Phase 3 — Feature-to-Endpoint Integration Checklist

Produced **before any edit**, as required by §1 of the phase brief.

Sources of truth used (all read in full):
`client/API-INTEGRATION.md`, `client/README.md`, the whole of `client/src/`,
`server/src/routes/*`, `server/src/validators/*`, `server/src/middlewares/*`,
`server/src/constants/*`, the service and controller bodies that decide response
shapes, `client/vite.config.ts`, both `package.json` files.

Verification column legend:
- **VERIFIED** — checked against the actual route + validator + service return,
  not against a doc.
- **GAP** — a real integration defect or unproven claim to address.
- **N/A** — deliberately absent; must NOT be built.

---

## 0. Baseline (measured, not assumed)

| Check | Command | Result |
| --- | --- | --- |
| Client typecheck | `cd client && npx tsc --noEmit` | **PASS** (exit 0, no output) |
| Client lint | `cd client && npx eslint .` | **FAIL** — 7 errors, 16 warnings |
| Client test runner | — | **ABSENT.** No vitest/jest/testing-library in `client/package.json`. |
| Backend tests | `cd server && npm test` | Phase 2: 375/375 against real MongoDB |
| Frontend↔API proof | — | **NONE.** `client/README.md` states all screens were rendered only against `dev/mock-api.mjs`, a throwaway stand-in. |

### Lint errors to fix (all real, all in scope)

1. `src/lib/api/client.ts:245` — `no-useless-assignment` on `parsed` in `uploadWithProgress`.
2. `src/lib/hooks/useAsync.ts:45` — `react-hooks/refs`: writing `loaderRef.current` during render.
3. `src/lib/hooks/useAsync.ts:65` — `react-hooks/set-state-in-effect` on `setError(undefined)`.
4. `src/lib/hooks/useAsync.ts:126` — `react-hooks/refs`: writing `actionRef.current` during render.
5. `src/lib/hooks/useUnreadCount.ts:35` — `react-hooks/set-state-in-effect`.
6. `src/lib/permissions.ts:22` — unused `_role`.
7. `src/lib/permissions.ts:41` — unused `_role`.

> `client/README.md` claims "the client has no ESLint config, so `npm run lint`
> currently fails" — **stale.** `client/eslint.config.js` exists and lint runs;
> it fails on the seven errors above, not on a missing config. README needs
> correcting.

---

## 1. Authentication (§2)

| # | Feature | Endpoint | Client call site | Status |
| --- | --- | --- | --- | --- |
| 1.1 | Register | `POST /auth/register` | `authApi.register` ← `Register.tsx` | VERIFIED |
| 1.2 | Login | `POST /auth/login` | `authApi.login` ← `Login.tsx` | VERIFIED |
| 1.3 | Logout | `POST /auth/logout` | `authApi.logout` ← `AuthProvider.logout` | VERIFIED |
| 1.4 | Session probe | `GET /users/profile` | `usersApi.profile` ← `AuthProvider` mount effect | VERIFIED |
| 1.5 | Session persistence on refresh | — | `AuthProvider` three-valued `status` | VERIFIED |
| 1.6 | Protected routes | — | `RequireAuth` / `RequireAnonymous` | VERIFIED |
| 1.7 | Expired session | — | `onUnauthorized` broadcast → `sessionExpired` | VERIFIED |
| 1.8 | 401 on cold load ≠ expiry | — | `statusRef` guard in `AuthProvider` | VERIFIED |
| 1.9 | Profile update | `PATCH /users/profile` | `usersApi.updateProfile` ← `Settings.tsx` | VERIFIED |
| 1.10 | Avatar update | `PATCH /users/avatar` (field `avatar`) | `usersApi.uploadAvatar` ← `Settings.tsx` | VERIFIED |
| 1.11 | Password change | `PATCH /users/change-password` | `usersApi.changePassword` ← `Settings.tsx` | VERIFIED |
| 1.12 | Delete account | `DELETE /users/account` | `usersApi.deleteAccount` ← `Settings.tsx` | VERIFIED |
| 1.13 | Get/update settings | `GET`/`PATCH /users/settings` | `usersApi.*` ← `Settings.tsx` | VERIFIED |
| 1.14 | Cookie credentials | — | `credentials: 'include'` in `request()`, `xhr.withCredentials`, `downloadBlob` | VERIFIED |
| 1.15 | No localStorage token | — | grep: no `localStorage`/`sessionStorage` token use | VERIFIED |

**Constraints honoured:** no token read from JS (the cookie is `httpOnly` and the
client never attempts to read it); no `localStorage` shortcut; no refresh logic
(the API has none); no forgot/reset password (`auth.routes.js` registers exactly
three routes).

**Gaps:** none in the mapping. Unproven end-to-end (§9).

---

## 2. Workspaces and invitations (§3)

| # | Feature | Endpoint | Client | Status |
| --- | --- | --- | --- | --- |
| 2.1 | List workspaces | `GET /workspaces` (`page,limit,search,sortBy,order,isArchived`) | `workspacesApi.list` ← `WorkspaceList`, `WorkspaceMenu` | VERIFIED |
| 2.2 | Create | `POST /workspaces` | `workspacesApi.create` | VERIFIED |
| 2.3 | Details | `GET /workspaces/:id` | `workspacesApi.get` ← `WorkspaceProvider` | VERIFIED |
| 2.4 | Update | `PATCH /workspaces/:id` (owner/admin) | `workspacesApi.update` ← `Settings` | VERIFIED |
| 2.5 | Archive | `PATCH /workspaces/:id/archive` (**owner only**) | `workspacesApi.archive` | VERIFIED |
| 2.6 | Restore | `PATCH /workspaces/:id/restore` (**owner only**) | `workspacesApi.restore` | VERIFIED |
| 2.7 | Delete | `DELETE /workspaces/:id` (**owner only**) | `workspacesApi.remove` | VERIFIED |
| 2.8 | Members | `GET /workspaces/:id/members` (populates `name,email,avatar`) | `workspacesApi.members` | VERIFIED |
| 2.9 | Remove member | `DELETE /workspaces/:id/members/:userId` | `workspacesApi.removeMember` | VERIFIED |
| 2.10 | Change role | `PATCH /workspaces/:id/members/:userId/role` (**owner only**) | `workspacesApi.changeMemberRole` | VERIFIED |
| 2.11 | Transfer ownership | `PATCH /workspaces/:id/transfer-ownership` (**owner only**) | `workspacesApi.transferOwnership` | VERIFIED |
| 2.12 | Invite | `POST /workspaces/:id/invitations` (`email`, `role ∈ {admin,member}`) | `workspacesApi.invite` | VERIFIED |
| 2.13 | Invitation response shape | `{ invitation }`, includes 64-char hex `token` | `Members.tsx` reads `outcome.data.invitation.token` | VERIFIED |
| 2.14 | Link generation + copy | — | `CopyField` at `/invitations/:token` | VERIFIED |
| 2.15 | Accept | `PATCH /invitations/:token/accept` | `workspacesApi.acceptInvitation` ← `AcceptInvitation` | VERIFIED |
| 2.16 | Expired invitation | `410 Invitation has expired` | `AcceptInvitation` maps 404 → "no longer valid" | **GAP — 410 not handled distinctly** |
| 2.17 | Invalid/wrong-email invitation | `403` "was not sent to your email" | falls through to `error.message` | VERIFIED |
| 2.18 | No email delivery invented | — | "No email is sent by this API" badge in `Members.tsx` | VERIFIED |
| 2.19 | Cancel/revoke invitation | **No endpoint exists** | not built | N/A |

**Gap 2.16:** `acceptInvitation` can return **410** (expired) which is neither
`isNotFound` (404) nor handled, so an expired invitation shows the raw server
message "Invitation has expired" instead of the friendlier expired copy. The
404 path is already handled. Low-severity copy issue; fix by treating 410 as
expired.

---

## 3. Projects (§4)

| # | Feature | Endpoint | Client | Status |
| --- | --- | --- | --- | --- |
| 3.1 | List | `GET /:ws/projects` (`page,limit,sortBy,order,search,status,isArchived,deadlineFrom/To`) | `projectsApi.list` ← `Projects.tsx` | VERIFIED |
| 3.2 | Create | `POST /:ws/projects` (**`update_workspace`**, i.e. owner/admin) | `projectsApi.create` | VERIFIED |
| 3.3 | Detail | `GET /:ws/projects/:id` | `projectsApi.get` ← `ProjectLayout` | VERIFIED |
| 3.4 | Update | `PATCH /:ws/projects/:id` (**owner/admin**, not project role) | `projectsApi.update` ← `ProjectSettingsTab` | VERIFIED |
| 3.5 | Set status | `PATCH …/status` (**owner/admin**) | `projectsApi.setStatus` | VERIFIED |
| 3.6 | Archive/restore | `PATCH …/archive` / `…/restore` (**owner/admin**) | `projectsApi.archive/restore` | VERIFIED |
| 3.7 | Add member | `POST …/members` (**owner/admin**) | `projectsApi.addMember` | VERIFIED |
| 3.8 | Remove member | `DELETE …/members/:userId` (**owner/admin**) | `projectsApi.removeMember` | VERIFIED |
| 3.9 | Change project role | `PATCH …/members/:userId/role` (**`project:change_role`**) | `projectsApi.changeMemberRole` | VERIFIED |
| 3.10 | `members` omission | — | `Project.members?` optional; guards at 3 call sites | VERIFIED |
| 3.11 | Workspace-admin elevation | Policy A via `hasProjectOverride` | `useProjectRole.hasAccess` + `canActOnProject` | VERIFIED |
| 3.12 | Hide disallowed actions | — | `can.manageProjects` gates create/archive/edit | VERIFIED |

**Gaps:** none in the mapping. Note 3.9 is the *only* project-role-gated member
operation, and the client correctly uses `ASSIGNABLE_PROJECT_ROLE_OPTIONS`
(no `owner`) — verified against `changeProjectMemberRoleSchema` which accepts
`Object.values(PROJECT_ROLES)` but the service refuses an owner change.

---

## 4. Tasks and subtasks (§5)

| # | Feature | Endpoint | Client | Status |
| --- | --- | --- | --- | --- |
| 4.1 | List | `GET …/tasks` (14 filter params) | `tasksApi.list` ← `TasksTab` | VERIFIED |
| 4.2 | Create | `POST …/tasks` | `tasksApi.create` | VERIFIED |
| 4.3 | Detail | `GET …/tasks/:taskId` | `tasksApi.get` ← `TaskDetail` | VERIFIED |
| 4.4 | Update | `PATCH …/tasks/:taskId` (title/description/dates/estimate) | `tasksApi.update` | VERIFIED |
| 4.5 | Status | `PATCH …/status` | `tasksApi.setStatus` (via `update` in `TaskProperties`) | VERIFIED |
| 4.6 | Priority | `PATCH …/priority` | `tasksApi.setPriority` (via `update`) | VERIFIED |
| 4.7 | Assignee | `PATCH …/assignee` (`null` unassigns) | `tasksApi.setAssignee` (via `update`) | VERIFIED |
| 4.8 | Start/due date | `PATCH …/start-date`, `…/due-date` | via `update` | VERIFIED |
| 4.9 | Estimated time | `updateTaskSchema.estimatedTime` (minutes) | `TaskProperties` onBlur | VERIFIED |
| 4.10 | Archive/restore | `PATCH …/archive`, `…/restore` | `tasksApi.archive/restore` | VERIFIED |
| 4.11 | Subtask list | `GET …/subtasks` → `{ subtasks }` | `tasksApi.subtasks` (typed) | VERIFIED |
| 4.12 | Subtask create | `POST …/subtasks` → **parent task under `data.subtask`** | `tasksApi.createSubtask` typed `{ subtask: Task }`; `SubtaskList` refetches | VERIFIED |
| 4.13 | Subtask update | `PATCH …/subtasks/:subtaskId` → `{ subtask }` | `tasksApi.updateSubtask` | VERIFIED |
| 4.14 | Subtask delete | `DELETE …/subtasks/:subtaskId` (no body) | `tasksApi.deleteSubtask` | VERIFIED |
| 4.15 | Labels on task | `POST`/`DELETE …/tasks/:taskId/labels[/:labelId]` | `tasksApi.assignLabel/removeLabel` | VERIFIED |
| 4.16 | Task activity | `GET …/tasks/:taskId/activities` | `tasksApi.activity` — **defined but never called** | **GAP — dead API surface** |
| 4.17 | Search/filter/sort/page | all string-encoded, validated | `TasksTab` filter param map | VERIFIED |
| 4.18 | Enum values match | `todo,in_progress,in_review,completed,cancelled`; `low,medium,high,urgent` | `constants/task.ts` | VERIFIED |
| 4.19 | `assignee`+`unassigned` mutual exclusion | `.refine(…)` rejects both | one control in `TasksTab` | VERIFIED |
| 4.20 | Task delete | **No endpoint** | not built; "never deleted, only archived" | N/A |

**Gap 4.16:** `tasksApi.activity` exists with no caller. Either the task detail
should show the task's own activity trail (the endpoint is real and permits
`project:view`), or the unused function should be left alone. §10 says "do not
add unrelated features"; surfacing an existing endpoint on an existing screen is
integration, not a new feature — but it is optional. **Decision: leave the
function; note it in the report.** Not a defect.

---

## 5. Comments, labels, attachments, notifications, activity, dashboard (§6)

| # | Feature | Endpoint | Client | Status |
| --- | --- | --- | --- | --- |
| 5.1 | Comments list | `GET …/comments` (sorted `createdAt: 1`) | `commentsApi.list` | VERIFIED |
| 5.2 | Comment create | `POST …/comments` | `commentsApi.create` | VERIFIED |
| 5.3 | Comment edit (author-only) | `PATCH …/comments/:id` | `commentsApi.update` + `canEditComment` | VERIFIED |
| 5.4 | Comment delete (author or moderate) | `DELETE …/comments/:id` | `commentsApi.remove` + `canDeleteComment` | VERIFIED |
| 5.5 | Label list | `GET …/labels` (`{labels, pagination}`) | `labelsApi.list` | VERIFIED |
| 5.6 | Label create/edit/delete | `POST`/`PATCH`/`DELETE …/labels[/:id]` | `labelsApi.*` ← `LabelsTab` | VERIFIED |
| 5.7 | Label 409 on duplicate name | duplicate-key → 409 | `LabelsTab` maps `isConflict` | VERIFIED |
| 5.8 | Notifications list | `GET /notifications` (`unread` is `"true"`/`"false"`) | `notificationsApi.list` | VERIFIED |
| 5.9 | Unread count | `GET /notifications/unread/count` → `{count}` | `useUnreadCount` (60s poll) | VERIFIED |
| 5.10 | Mark read | `PATCH /notifications/:id/read` | `notificationsApi.markRead` | VERIFIED |
| 5.11 | Mark all read | `PATCH /notifications/read-all` → `{modified}` | `notificationsApi.markAllRead` | VERIFIED |
| 5.12 | Delete notification | `DELETE /notifications/:id` | `notificationsApi.remove` | VERIFIED |
| 5.13 | Others' notifications 404 | recipient-scoped | `Notifications` treats as gone | VERIFIED |
| 5.14 | Project activity | `GET …/activities` | `activityApi.forProject` ← `ActivityTab` | VERIFIED |
| 5.15 | Attachment list (project) | `GET …/attachments` | `attachmentsApi.listForProject` | VERIFIED |
| 5.16 | Attachment list (task) | `GET …/tasks/:taskId/attachments` | `attachmentsApi.listForTask` | VERIFIED |
| 5.17 | Attachment upload | `POST …/attachments` (field `file`) | `uploadToProject`/`uploadToTask` (XHR) | VERIFIED |
| 5.18 | Download (authenticated) | `GET …/attachments/:id/download` | `downloadBlob` + blob URL | VERIFIED |
| 5.19 | Delete attachment | `DELETE …/attachments/:id` | `attachmentsApi.remove` | VERIFIED |
| 5.20 | Workspace dashboard | `GET /:ws/dashboard` | `dashboardApi.workspace` ← `Dashboard` | VERIFIED |
| 5.21 | Project dashboard | `GET /:ws/projects/:id/dashboard` | `projectsApi.dashboard` — **defined but never called** | **GAP — dead API surface** |
| 5.22 | Dashboard payload = aggregates | `byStatus`/`myTasks` objects, not arrays | `types.ts` correct | VERIFIED |
| 5.23 | Comment attachments | `GET`/`POST …/comments/:id/attachments` | `attachmentsApi.listForComment/uploadToComment` — **never called** | **GAP — dead API surface** |

**Gaps 5.21 / 5.23:** real endpoints, typed clients, no call sites. The comment
attachment endpoints are unreachable through the UI because the comment UI has
no attachment affordance. Reporting, not building (no invented features).

**Mock data audit (§6 requirement):** `grep` for hardcoded arrays / placeholder
data across `client/src` will be run and reported. Current inspection finds
**none** — every screen reads from `lib/api`. `dev/mock-api.mjs` still exists but
is only reachable via `npm run mock`; it is not imported by any page. **To
verify by grep and report.**

---

## 6. UX states (§7) — per data-driven screen

Each screen must handle: initial loading · empty · API error · validation error
· success · permission-denied · expired session · network failure · no duplicate
submission.

Carried centrally (so every screen inherits it):

| Concern | Mechanism |
| --- | --- |
| Expired session | `onUnauthorized` → `AuthProvider` → `RequireAuth` redirect |
| Network failure | `request()` maps a fetch throw to `ApiError(0, 'Could not reach the server…')` |
| Duplicate submission | `useMutation.loading` → `Button loading` disables |
| Field validation | `normalizeFieldError` strips `body.` → `fieldError('field')` |
| No false success | outcomes are discriminated; every mutation checks `outcome.ok` before success UI |

Per-screen audit to be completed and tabulated in the final report:
`Login`, `Register`, `AcceptInvitation`, `WorkspaceList`, `Dashboard`,
`Projects`, `ProjectLayout`, `ProjectOverview` (+ 6 tabs), `TaskDetail`,
`Members`, `Notifications`, `Settings`, `NotFound`.

**Already-noted suspicion to verify:** `Dashboard.tsx` recent-activity panel
filters the notification feed by `workspace === workspaceId`; confirm it degrades
to empty rather than erroring when the feed is empty.

---

## 7. API configuration (§8)

| # | Item | Finding | Status |
| --- | --- | --- | --- |
| 7.1 | Dev proxy | `vite.config.ts`: `/api` → `http://localhost:5000`, `changeOrigin: false` | VERIFIED |
| 7.2 | Preview proxy | same, for `vite preview` | VERIFIED |
| 7.3 | Base URL | relative `/api/v1` — no absolute host | VERIFIED |
| 7.4 | No hardcoded localhost in prod code | grep `client/src` for `localhost`/`127.0.0.1` | **to verify** |
| 7.5 | Credentials | `credentials: 'include'`; cookie `SameSite=Strict`, `httpOnly` | VERIFIED |
| 7.6 | CORS | `CORS_ORIGINS` unset ⇒ proxy is load-bearing | VERIFIED |

---

## 8. Testing (§9) — tools actually installed

| Layer | Available | Constraint |
| --- | --- | --- |
| Client | `tsc`, `vite build`, `eslint`, `prettier` | **No test runner.** Cannot add one (§10: no unrelated additions; a new dep is a new dependency). |
| Server | `node:test`, `supertest`, `mongodb-memory-server`, real MongoDB 6.0.14 replica set | Proven 375/375 in Phase 2 |

Therefore "add integration tests using the tools already installed" means:
- **Server-side**: extend `server/tests/` with flow tests if a genuine gap exists.
- **Client-side**: the honest, in-budget equivalent is a **render-level
  integration test is not possible without a runner** — so the client's
  verification is `tsc` + `vite build` + `eslint` + a real end-to-end run of the
  built app against the **real** `server/app.js`.
- **The decisive test is the live run**: boot the real backend
  (`client/dev/boot-real-api.mjs`, which starts the genuine `app.js` on :5000
  against an in-process store — never the Atlas URI in `server/.env`) and drive
  the real screens.

**Do not** mark a feature integrated because a component renders (§9).

---

## 9. Restrictions (§10) — commitment

- Preserve design and architecture; do not replace working components.
- **No backend permission changes** without a demonstrated bug. The two
  candidate defects found (2.16 410 handling, README staleness) are client-side.
- No unrelated features. No new dependencies.
- **Do not commit.**
- Fix only end-to-end integration issues.

---

## 10. Ordered work plan

1. Fix the 7 lint errors (mechanical, no behaviour change).
2. Fix Gap 2.16 (410 expired-invitation copy).
3. Audit hardcoded-data / placeholder-data across `client/src`; replace any with
   real API calls where the endpoint exists; otherwise report.
4. Complete the §7 per-screen state audit; fix any screen that swallows an error
   or reports false success.
5. Correct the stale claim in `client/README.md` about ESLint and about the
   screens having been exercised only against the mock.
6. Boot the real backend and exercise the flows end-to-end (agent-browser
   against the built app on the proxy), recording exactly what was observed.
7. Run: `tsc`, `vite build`, `eslint`, and `npm test` (server).
8. Write the §11 final per-feature report. **Stop. Do not deploy.**
