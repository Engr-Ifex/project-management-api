# Frontend Integration Map

**Source of truth:** `server/docs/openapi.json` (generated from the route table and
the routes' own Zod validators) plus `server/docs/API.md`. Nothing here is
inferred — every endpoint, body field, parameter and status code below was read
from the running backend.

**82 endpoints across 13 groups.** Base path: `/api/v1`.

---

## 0. The things that shape every request

### Envelope

Success:

```json
{ "success": true, "statusCode": 200, "message": "…", "data": { … } }
```

Error:

```json
{ "success": false, "statusCode": 400, "message": "…", "errors": [ … ] }
```

`data` is always an object. Lists put the array under a named key
(`data.projects`, `data.tasks`, `data.comments`…) alongside `data.pagination`.
Single resources nest one more level: `data.project`, `data.task`,
`data.attachment`.

### Authentication is a cookie, not a header

Login/register set an **httpOnly** cookie named `accessToken`
(`SameSite=Strict`, `Secure` in production, 15-minute lifetime). The token is
never in the response body, so JavaScript cannot read it.

Consequences the frontend must handle:

- Every request needs **`credentials: 'include'`** (fetch) or
  `withCredentials: true` (axios). Without it the cookie is not sent.
- CORS is an allow-list with credentials, so the dev server origin must be in
  `CORS_ORIGINS` on the backend.
- `SameSite=Strict` means the app must be same-site with the API. A
  cross-site frontend will not authenticate.
- **"Am I logged in?" is answered by calling `GET /users/profile`** — there is
  no readable token and no `/me` endpoint. A 401 means logged out.
- **No refresh token.** The session dies after 15 minutes. Handle 401 by
  routing to login; do not build refresh logic.

### Login / register responses

Both return `data.user` (`id, name, email, role, avatar, settings, createdAt,
updatedAt`) and set the cookie. `role` here is the *platform* role
(`user` | `admin`), not a workspace role.

### Id shape

`User` and `Workspace` serialize `_id` as **`id`**. **Everything else** —
`Project`, `Task`, `Subtask`, `Comment`, `Label`, `Attachment`,
`Notification`, `ProjectActivity` — serializes as **`_id`**. Do not assume one
convention.

### Rate limits

Auth endpoints: 10 requests / 15 min / IP. Everything else: 1000 / 15 min / IP
(configurable). A 429 carries a `message`; back off rather than retry
immediately.

### Public endpoints (no cookie)

`GET /`, `GET /health`, `GET /health/ready`, `GET /openapi.json`,
`POST /auth/register`, `POST /auth/login`. Everything else requires the cookie.

---

## 1. Authentication endpoints

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| `POST` | `/auth/register` | `name`, `email`, `password` | 201. Sets cookie. Password: **min 8 chars, no other rule.** |
| `POST` | `/auth/login` | `email`, `password` | 200. Sets cookie. |
| `POST` | `/auth/logout` | — | 200. Clears the cookie. The token stays valid until it expires. |
| `GET` | `/users/profile` | — | The session probe. 401 when logged out. |
| `PATCH` | `/users/profile` | `name?` | |
| `PATCH` | `/users/avatar` | `multipart/form-data`, field **`avatar`** | JPEG/PNG/WEBP, 5 MB. Content is signature-checked. |
| `PATCH` | `/users/change-password` | `currentPassword`, `newPassword`, `confirmPassword` | 400 if the two do not match. |
| `GET` | `/users/settings` | — | |
| `PATCH` | `/users/settings` | `emailNotifications?`, `marketingEmails?` (booleans) | |
| `DELETE` | `/users/account` | — | |

Note: changing the password invalidates existing tokens, so the user must log
in again.

---

## 2. Workspace endpoints

| Method | Path | Body / Params | Who |
| --- | --- | --- | --- |
| `GET` | `/workspaces` | `page,limit,sortBy,order,search` | any authenticated user (their own) |
| `POST` | `/workspaces` | `name`, `description?` | any authenticated user |
| `GET` | `/workspaces/:workspaceId` | — | member |
| `PATCH` | `/workspaces/:workspaceId` | `name?`, `description?` | owner / admin |
| `PATCH` | `/workspaces/:workspaceId/archive` | — | **owner only** |
| `PATCH` | `/workspaces/:workspaceId/restore` | — | **owner only** (workspace must be archived) |
| `DELETE` | `/workspaces/:workspaceId` | — | **owner only** |
| `GET` | `/workspaces/:workspaceId/members` | — | member |
| `POST` | `/workspaces/:workspaceId/invitations` | `email`, `role?` (`admin`\|`member`) | owner / admin |
| `PATCH` | `/invitations/:token/accept` | — | the invited user |
| `DELETE` | `/workspaces/:workspaceId/members/:userId` | — | owner / admin (admin cannot remove owner or another admin) |
| `PATCH` | `/workspaces/:workspaceId/members/:userId/role` | `role` (`admin`\|`member`) | **owner only** |
| `PATCH` | `/workspaces/:workspaceId/transfer-ownership` | `userId` | **owner only** |

`Workspace` = `{ id, name, description, owner, members[], settings, isArchived,
archivedAt, createdAt, updatedAt }`.

> **Spec discrepancy — read this before generating types.** The
> `POST …/invitations` response **does include `token`** (verified against the
> running API: `data.invitation.token` is a 64-character hex string). The
> `Invitation` schema in `openapi.json` omits it, so a type generated from the
> spec will be missing the field the accept link needs.
>
> The token is what `PATCH /invitations/:token/accept` takes. There is **no
> email delivery** in this API, so the UI is the only way the token reaches the
> invitee — the invite flow must surface it (copyable link or code). Treat
> `token` as present and type it manually until the schema is corrected.

---

## 3. Project endpoints

| Method | Path | Body / Params | Who |
| --- | --- | --- | --- |
| `GET` | `…/projects` | `page,limit,sortBy,order,search,status,isArchived,deadlineFrom,deadlineTo` | workspace member |
| `POST` | `…/projects` | `name`, `description?`, `deadline?`, `color?` | **workspace owner/admin** |
| `GET` | `…/projects/:projectId` | — | workspace member |
| `PATCH` | `…/projects/:projectId` | `name?`, `description?`, `deadline?`, `color?` | **workspace owner/admin** |
| `PATCH` | `…/projects/:projectId/status` | `status` (`planning`\|`active`\|`on_hold`\|`completed`\|`cancelled`) | **workspace owner/admin** |
| `PATCH` | `…/projects/:projectId/archive` | — | **workspace owner/admin** |
| `PATCH` | `…/projects/:projectId/restore` | — | **workspace owner/admin** |
| `POST` | `…/projects/:projectId/members` | `userId` | **workspace owner/admin** |
| `DELETE` | `…/projects/:projectId/members/:userId` | — | **workspace owner/admin** (creator cannot be removed) |
| `PATCH` | `…/projects/:projectId/members/:userId/role` | `role` (`owner`\|`admin`\|`member`\|`viewer`) | project owner/admin |

> **Project lifecycle and membership are workspace-level operations.** A project
> owner cannot rename or archive their own project. This is deliberate — see
> §15.

> **`GET …/projects` and `GET …/projects/:projectId` are readable by any
> workspace member, but `members` is omitted and `createdBy` is an id unless the
> caller is a project member or a workspace owner/admin.** The UI must not
> assume `members` exists: gate member UI on the caller having project access,
> or on `members !== undefined`.

`Project` = `{ _id, workspace, createdBy, name, description, status, deadline,
color, members[], isArchived, archivedAt, archivedBy, createdAt, updatedAt }`.

---

## 4. Task and subtask endpoints

| Method | Path | Body / Params | Who |
| --- | --- | --- | --- |
| `GET` | `…/tasks` | `page,limit,sortBy,order,search,status,priority,assignee,unassigned,isArchived,labels,dueDateFrom,dueDateTo,startDateFrom,startDateTo` | `project:view` |
| `POST` | `…/tasks` | `title`, `description?`, `assignee?`, `startDate?`, `dueDate?`, `estimatedTime?` (int, minutes), `priority?` | `task:create` |
| `GET` | `…/tasks/:taskId` | — | `project:view` |
| `PATCH` | `…/tasks/:taskId` | `title?`, `description?`, `startDate?`, `dueDate?`, `estimatedTime?` | `task:update` |
| `PATCH` | `…/tasks/:taskId/status` | `status` (`todo`\|`in_progress`\|`in_review`\|`completed`\|`cancelled`) | `task:update` |
| `PATCH` | `…/tasks/:taskId/priority` | `priority` (`low`\|`medium`\|`high`\|`urgent`) | `task:update` |
| `PATCH` | `…/tasks/:taskId/assignee` | `assignee` (id or `null` to unassign) | `task:assign` |
| `PATCH` | `…/tasks/:taskId/due-date` | `dueDate` (ISO or `null`) | `task:update` |
| `PATCH` | `…/tasks/:taskId/start-date` | `startDate` (ISO or `null`) | `task:update` |
| `PATCH` | `…/tasks/:taskId/archive` | — | `task:archive` |
| `PATCH` | `…/tasks/:taskId/restore` | — | `task:restore` |
| `GET` | `…/tasks/:taskId/subtasks` | — | `project:view` |
| `POST` | `…/tasks/:taskId/subtasks` | `title` | `subtask:create` |
| `PATCH` | `…/tasks/:taskId/subtasks/:subtaskId` | `title?`, `isCompleted?` | `subtask:update` |
| `DELETE` | `…/tasks/:taskId/subtasks/:subtaskId` | — | `subtask:delete` |

**There is no task delete endpoint.** Tasks are archived and restored.

`Task` = `{ _id, project, createdBy, assignee, title, description, subtasks[],
labels[], status, priority, startDate, dueDate, estimatedTime, position,
isArchived, archivedAt, archivedBy, createdAt, updatedAt }`.

`position` is a display-order hint. Two tasks may share a position; the list is
ordered by `position, createdAt, _id`, so treat it as a stable sort key rather
than a unique index.

> **Response-shape inconsistency:** `POST …/subtasks` returns the **parent
> task** under `data.subtask`, while `PATCH` returns the subtask itself. Read
> the new subtask id from the list response.

> Assigning to a user who is not a project member returns **400**.

---

## 5. Comment endpoints

| Method | Path | Body / Params | Who |
| --- | --- | --- | --- |
| `GET` | `…/tasks/:taskId/comments` | `page,limit,sortBy,order,search` | `project:view` |
| `POST` | `…/tasks/:taskId/comments` | `content` | `comment:create` |
| `GET` | `…/tasks/:taskId/comments/:commentId` | — | `project:view` |
| `PATCH` | `…/tasks/:taskId/comments/:commentId` | `content` | **author only** |
| `DELETE` | `…/tasks/:taskId/comments/:commentId` | — | author, or `comment:moderate` |

`Comment` = `{ _id, task, project, author, content, editedAt, isDeleted,
createdAt, updatedAt }`. Soft-deleted.

> **Editing a comment is author-only.** No role overrides it, not even a
> workspace owner. Hide the edit affordance unless `author` is the current user.
> Deletion *does* honour the override.

---

## 6. Label endpoints

| Method | Path | Body / Params | Who |
| --- | --- | --- | --- |
| `GET` | `…/projects/:projectId/labels` | `page,limit,sortBy,order,search` | `project:view` |
| `POST` | `…/projects/:projectId/labels` | `name`, `color` | `label:create` |
| `GET` | `…/projects/:projectId/labels/:labelId` | — | `project:view` |
| `PATCH` | `…/projects/:projectId/labels/:labelId` | `name?`, `color?` | `label:update` |
| `DELETE` | `…/projects/:projectId/labels/:labelId` | — | `label:delete` |
| `POST` | `…/tasks/:taskId/labels` | `labelId` | `label:assign` |
| `DELETE` | `…/tasks/:taskId/labels/:labelId` | — | `label:assign` |

`Label` = `{ _id, project, name, color, createdAt, updatedAt }`. Label names are
unique **within a project** (409 on duplicate). Labels are project-scoped: a
label from another project is a 404.

Task responses populate `labels` as `{ _id, name, color }` objects, so a task
carries enough to render its chips without a second request.

---

## 7. Notification endpoints

All are scoped to the **recipient**; another user's notification is a 404, not a
403. No role or permission is involved.

| Method | Path | Params |
| --- | --- | --- |
| `GET` | `/notifications` | `page,limit,sortBy,order,unread,type` |
| `GET` | `/notifications/unread` | `page,limit,sortBy,order,unread,type` |
| `GET` | `/notifications/unread/count` | — (returns `data.count`) |
| `PATCH` | `/notifications/:notificationId/read` | — |
| `PATCH` | `/notifications/read-all` | — |
| `DELETE` | `/notifications/:notificationId` | — |

`unread` is the literal string `"true"` or `"false"`.
`type` ∈ `task_assigned`, `task_reassigned`, `task_due_soon`,
`task_comment_added`, `project_member_added`, `project_role_changed`,
`workspace_invitation`.

`Notification` = `{ _id, recipient, actor, type, title, message, workspace,
project, task, comment, isRead, readAt, createdAt }`.

Poll `unread/count` for the badge; there is no websocket or SSE.

---

## 8. Activity endpoints

| Method | Path | Params | Who |
| --- | --- | --- | --- |
| `GET` | `…/projects/:projectId/activities` | `page,limit,sortBy,order,action` | `project:view` |
| `GET` | `…/tasks/:taskId/activities` | `page,limit,sortBy,order,action` | `project:view` |

`ProjectActivity` = `{ _id, workspace, project, user, action, metadata,
createdAt }`. `action` values include `task_created`, `subtask_created`,
`subtask_updated`, `subtask_deleted`, `label_assigned`, `label_removed`.

The trail is **append-only and written by the service layer**, so it only
contains changes made through the API.

---

## 9. Attachment endpoints

| Method | Path | Body / Params | Who |
| --- | --- | --- | --- |
| `GET` | `…/projects/:projectId/attachments` | `page,limit,sortBy,order,scope` | `project:view` |
| `POST` | `…/projects/:projectId/attachments` | `multipart/form-data`, field **`file`** | `attachment:create` |
| `GET` | `…/tasks/:taskId/attachments` | `page,limit,sortBy,order,scope` | `project:view` |
| `POST` | `…/tasks/:taskId/attachments` | field **`file`** | `attachment:create` |
| `GET` | `…/tasks/:taskId/comments/:commentId/attachments` | `page,limit,sortBy,order,scope` | `project:view` |
| `POST` | `…/tasks/:taskId/comments/:commentId/attachments` | field **`file`** | `attachment:create` |
| `GET` | `…/projects/:projectId/attachments/:attachmentId/download` | — | `project:view` |
| `DELETE` | `…/projects/:projectId/attachments/:attachmentId` | — | author, or `attachment:moderate` |

**Upload rules** — the frontend must enforce these or the user sees avoidable
400s:

- 10 MB, **one file per request**.
- MIME and extension must agree, **and the content must really be that type**
  (checked by file signature). A renamed file is rejected.
- Allowed: JPEG, PNG, WEBP, GIF, PDF, plain text, CSV, Markdown, JSON, DOC/DOCX,
  XLS/XLSX, PPT/PPTX, ZIP.
- Rejected by policy: executables, scripts, HTML/XML/SVG and other active
  markup.

Downloads are **authenticated**, not public URLs. Fetch the download endpoint
with credentials and turn the response into a blob — an `<img src>` or a plain
link will 401.

`Attachment` = `{ _id, originalFilename, storedFilename, mimeType, size,
uploader, project, task, comment, scope, createdAt, updatedAt }`.

---

## 10. Dashboard endpoints

| Method | Path | Params | Who |
| --- | --- | --- | --- |
| `GET` | `…/workspaces/:workspaceId/dashboard` | — | workspace member (`view_workspace`) |
| `GET` | `…/projects/:projectId/dashboard` | `upcomingDueDays` | `project:view` |

`WorkspaceDashboard` = `{ workspace, projects, myTasks }`
`ProjectDashboard` = `{ project, tasks, myTasks }`
`MyTasks` = `{ assigned, completed, overdue }` (counts)

One request per screen — do not fan out to compute counts client-side.

---

## 11. Search, filter, pagination, sorting

Identical on every list endpoint, composed from one shared validator.

| Param | Rules |
| --- | --- |
| `page` | integer ≥ 1, default **1** |
| `limit` | integer 1–**100**, default **20** |
| `sortBy` | enum — varies per resource (below) |
| `order` | `asc` \| `desc` |
| `search` | 1–100 characters; substring match over the resource's search fields |

Response `data.pagination` = `{ page, limit, total, totalPages, hasNextPage,
hasPrevPage }`.

`sortBy` values:

- workspaces: `name`, `createdAt`, `updatedAt`
- projects: `name`, `status`, `deadline`, `createdAt`, `updatedAt`
- tasks: `title`, `status`, `priority`, `dueDate`, `startDate`, `position`, `createdAt`, `updatedAt`
- comments: `createdAt`, `updatedAt`
- labels: `name`, `createdAt`, `updatedAt`
- notifications: `createdAt`, `readAt`, `type`
- activity: `createdAt`, `action`
- attachments: `originalFilename`, `size`, `createdAt`

Resource-specific filters are in each section above. Two need care:

- **Boolean filters are strings**: `isArchived`, `unassigned`, `unread` accept
  only `"true"` / `"false"` — not `1`/`0`, not booleans.
- **Date ranges** are pairs (`dueDateFrom`/`dueDateTo`,
  `startDateFrom`/`startDateTo`, `deadlineFrom`/`deadlineTo`), ISO 8601.

Search fields: workspaces `name,description`; projects `name,description`; tasks
`title,description`; comments `content`; labels `name`.

---

## 12. Request bodies — complete list

| Endpoint | Fields |
| --- | --- |
| `POST /auth/register` | `name`, `email`, `password` |
| `POST /auth/login` | `email`, `password` |
| `POST /workspaces` | `name`, `description?` |
| `PATCH /workspaces/:id` | `name?`, `description?` |
| `POST /workspaces/:id/invitations` | `email`, `role?` |
| `PATCH /workspaces/:id/members/:userId/role` | `role` |
| `PATCH /workspaces/:id/transfer-ownership` | `userId` |
| `POST …/projects` | `name`, `description?`, `deadline?`, `color?` |
| `PATCH …/projects/:id` | `name?`, `description?`, `deadline?`, `color?` |
| `PATCH …/projects/:id/status` | `status` |
| `POST …/projects/:id/members` | `userId` |
| `PATCH …/projects/:id/members/:userId/role` | `role` |
| `POST …/tasks` | `title`, `description?`, `assignee?`, `startDate?`, `dueDate?`, `estimatedTime?`, `priority?` |
| `PATCH …/tasks/:id` | `title?`, `description?`, `startDate?`, `dueDate?`, `estimatedTime?` |
| `PATCH …/tasks/:id/status` | `status` |
| `PATCH …/tasks/:id/priority` | `priority` |
| `PATCH …/tasks/:id/assignee` | `assignee` |
| `PATCH …/tasks/:id/due-date` | `dueDate` |
| `PATCH …/tasks/:id/start-date` | `startDate` |
| `POST …/subtasks` | `title` |
| `PATCH …/subtasks/:id` | `title?`, `isCompleted?` |
| `POST …/comments` | `content` |
| `PATCH …/comments/:id` | `content` |
| `POST …/labels` | `name`, `color` |
| `PATCH …/labels/:id` | `name?`, `color?` |
| `POST …/tasks/:id/labels` | `labelId` |
| `PATCH /users/profile` | `name?` |
| `PATCH /users/change-password` | `currentPassword`, `newPassword`, `confirmPassword` |
| `PATCH /users/settings` | `emailNotifications?`, `marketingEmails?` |
| `PATCH /users/avatar`, `POST …/attachments` | `multipart/form-data` |

Unknown keys are **stripped** (ignored) on every endpoint **except three**, which
are strict and reject them with a 400: `POST /workspaces`, `PATCH
/workspaces/:id`, and `PATCH /users/settings`.

**At least one field is required** on the update bodies for projects, tasks,
subtasks, labels, workspaces and user settings — an empty body is a 400. The
exception is `PATCH /users/profile`: `name` is optional with no such rule, so an
empty body succeeds as a no-op.

---

## 13. Required parameters

- **Every** endpoint under `/workspaces/…` needs `workspaceId` in the path, even
  where it is not otherwise used. There is no "current workspace" concept.
- Nested resources need the **full ancestor chain** in the path: a comment needs
  `workspaceId, projectId, taskId, commentId`. A mismatch is a 404.
- All ids are 24-character hex ObjectIds; a malformed one is a 400.
- `multipart/form-data` field names: `avatar` (user avatar), `file` (attachment).

---

## 14. Authentication requirements

| Group | Requirement |
| --- | --- |
| `/auth/register`, `/auth/login`, `/`, `/health`, `/health/ready`, `/openapi.json` | none |
| `/auth/logout`, `/users/*` | valid cookie |
| `/workspaces/*`, `/notifications/*` | valid cookie **and** workspace membership (resolved from the path) |
| Everything inside a project | valid cookie, workspace membership, **and** `project:view` |

401 = no valid cookie, expired, or invalidated by a password change.
403 = authenticated but not permitted.

---

## 15. Permission and role requirements

Two independent role systems. Do not conflate them.

**Workspace roles** (`owner`, `admin`, `member`)

| Capability | owner | admin | member |
| --- | :---: | :---: | :---: |
| View workspace, member list, project list | yes | yes | yes |
| Update workspace | yes | yes | — |
| Invite / remove members | yes | yes | — |
| Create / update / archive / restore a project | yes | yes | — |
| Add / remove project members | yes | yes | — |
| Change a workspace member's role | yes | — | — |
| Archive / restore / delete workspace | yes | — | — |
| Transfer ownership | yes | — | — |

**Project roles** (`owner`, `admin`, `member`, `viewer`) — owner and admin are
identical.

| Capability | owner | admin | member | viewer |
| --- | :---: | :---: | :---: | :---: |
| `project:view` (tasks, subtasks, comments, labels, attachments, dashboard, activity) | yes | yes | yes | yes |
| Create / update / assign tasks | yes | yes | yes | — |
| Archive / restore tasks | yes | yes | — | — |
| Subtasks, comments, label assignment, attachments | yes | yes | yes | — |
| Change a project member's role | yes | yes | — | — |
| Manage labels (create / update / delete) | yes | yes | — | — |
| Moderate others' comments / attachments | yes | yes | — | — |

**Workspace override (Policy A).** A workspace owner or admin has authority over
**every** project in their workspace without being a member of it. This is why
`project:view` failures are rare for them.

**Object-level exceptions — these are not role-based:**

- Editing a comment is **author-only**.
- Deleting a comment or attachment is the author's, or anyone with
  `*:moderate`.
- A project's creator cannot be removed from it.
- An admin cannot remove the owner or another admin.
- Notifications are recipient-scoped and 404 for everyone else.

**Practical UI rule:** drive visibility from what the API returns rather than
from a client-side permission table. Fetch the workspace member list and the
project member list, derive the current user's roles, and treat 403 as the
authority. The tables above are for deciding what to *show*; the API decides
what is *allowed*.

---

## 16. Important error responses

| Code | Meaning | Frontend action |
| --- | --- | --- |
| **400** | Validation failed, or a business rule (`errors` array has field detail) | Show inline field errors |
| **401** | No/expired cookie | Redirect to login, clear local state |
| **403** | Authenticated but not permitted | Hide the action; do not retry |
| **404** | Not found **or not visible to you** — cross-workspace ids and other users' notifications both 404 | Treat as "gone" |
| **409** | Conflict — duplicate label name, already a member, already assigned, pending invitation exists | Show the message |
| **429** | Rate limited | Back off; do not retry in a loop |
| **500** | Masked as `"Internal Server Error"` — the real message is never exposed | Generic error UI |
| **503** | `GET /health/ready` only: the database is unreachable | Show a maintenance state |

`errors` is an array of `{ field?, message }` on validation failures.

**404 is used deliberately where 403 would leak existence** — a project in
another workspace, another user's notification. Do not surface a distinction the
API refuses to make.

---

## Known spec gaps

The OpenAPI document is generated from the route table and the routes' own
validators, and it is verified against them — but two response **schemas** are
hand-authored and understate what the API actually returns. Each was checked
against the running API, not assumed. If you generate types from the spec, fix
these by hand.

| Endpoint | Spec says | Actually returns |
| --- | --- | --- |
| `POST /workspaces/:id/invitations` | `Invitation` without `token` | `data.invitation.token` — a 64-char hex string, and the only way the invitee can accept |
| `GET …/projects/:projectId/labels` | `data = { labels }` | `data = { labels, pagination }` — the list **is** paginated and accepts `page`/`limit` |

Everything else in this document was read from the generated spec or verified
against the API directly.

---

## Integration checklist

- [ ] HTTP client sends `credentials: 'include'` on every request
- [ ] Frontend origin added to the backend's `CORS_ORIGINS`
- [ ] Session probe is `GET /users/profile`, 401 → login
- [ ] No refresh-token logic; handle 401 as logged out
- [ ] Id helper handles both `id` and `_id`
- [ ] Unwraps `data` and reads lists from the named key + `pagination`
- [ ] Boolean query params sent as `"true"` / `"false"` strings
- [ ] `members` treated as optional on project list/detail
- [ ] Comment edit hidden unless the current user is the author
- [ ] Downloads fetched as authenticated blobs, not plain links
- [ ] Upload client-side limits: 10 MB, one file, allowed types
- [ ] 403 hides actions; 404 is treated as gone
- [ ] Notification badge polls `unread/count`

---

## Not in the API — do not build against it

There is **no**: refresh token, password reset, email verification, 2FA, user
directory/search across users, real-time updates (websocket/SSE), bulk
operations, task delete, comment threads/replies, file versioning, custom
fields, or a "current workspace" concept. A user's own workspaces come from
`GET /workspaces`.

There is also **no endpoint that lists the users of a workspace** other than
`GET /workspaces/:workspaceId/members` — use it for any assignee or member
picker.
