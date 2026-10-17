# API Contract Discrepancy Remediation — Final Report

## Summary

Nine confirmed contract discrepancies between the OpenAPI specification, the
backend implementation, and the frontend TypeScript types have been resolved.
All changes are documentation- and type-level only — no runtime behaviour was
modified. Six regression tests were added and pass. The OpenAPI spec was
regenerated and verified. The full backend test suite and frontend typecheck
both pass (2 pre-existing failures are unrelated to this work).

---

## 1. Discrepancies Confirmed and Fixed

### 1.1 Invitation response missing `token` (primary)

**Root cause:** `invitation.service.js` generates a 64-char hex token via
`crypto.randomBytes(32).toString('hex')` and returns the full Mongoose document.
No email is sent, so the `token` in the API response is the **only** way an
invitee can accept. The OpenAPI `Invitation` schema omitted it entirely.

**Fix:** Added `token` (string, description explaining its role) and
`updatedAt` to `SCHEMAS.Invitation` in `generate-openapi.js`.

### 1.2 Labels list missing `pagination`

**Root cause:** `label.service.js getProjectLabels()` returns
`{ labels: items, pagination }`, but `DATA_SHAPES.labels` only declared
`{ labels }`.

**Fix:** Added `pagination: ref('Pagination')` to `DATA_SHAPES.labels` in
`generate-openapi.js`.

### 1.3 Task labels documented as bare ObjectIds

**Root cause:** The task service always populates labels with
`.populate('labels', 'name color')`, producing `{ _id, name, color }` objects.
The OpenAPI schema documented `Task.labels` as `ObjectId[]` (bare id strings).

**Fix:** Added a new `LabelRef` schema (`{ _id, name, color }`) and changed
`Task.labels` to `array(ref('LabelRef'))` in `generate-openapi.js`.

### 1.4 Dashboard workspace documented as full Workspace

**Root cause:** `dashboard.service.js` returns `workspace: { id, name }` — a
reduced two-field object. The OpenAPI schema used `$ref: '#/components/schemas/Workspace'`
(the full document with members, description, etc.).

**Fix:** Changed `WorkspaceDashboard.workspace` from `ref('Workspace')` to an
inline object `{ id, name }` in `generate-openapi.js`.

### 1.5 Dashboard project documented as full Project

**Root cause:** `dashboard.service.js` returns `project: { id, name, status }` —
a reduced three-field object. The OpenAPI schema used `$ref: '#/components/schemas/Project'`.

**Fix:** Changed `ProjectDashboard.project` from `ref('Project')` to an inline
object `{ id, name, status }` in `generate-openapi.js`.

### 1.6 `PATCH /notifications/read-all` response key wrong

**Root cause:** `notification.service.js markAllNotificationsAsRead()` returns
`{ modified: result.modifiedCount }`. The OpenAPI operation metadata declared
`returns: 'count'`, which produced `{ count: integer }` — the wrong key.

**Fix:** Added a `modified` data shape to `DATA_SHAPES` in `generate-openapi.js`
and changed the operation in `openapi-operations.js` from `returns: 'count'` to
`returns: 'modified'`.

### 1.7 `WorkspaceMember` missing `joinedAt`

**Root cause:** The `Workspace` model's `members` subdocument schema has a
`joinedAt` field, but the OpenAPI `WorkspaceMember` schema omitted it.

**Fix:** Added `joinedAt` to `SCHEMAS.WorkspaceMember` in `generate-openapi.js`.

### 1.8 `ProjectMember` missing `addedAt` (and frontend used wrong field name)

**Root cause:** The `Project` model's `members` subdocument schema has an
`addedAt` field (not `joinedAt`). The OpenAPI `ProjectMember` schema omitted it.
The frontend `ProjectMember` type used `joinedAt` — the wrong field name.

**Fix:** Added `addedAt` to `SCHEMAS.ProjectMember` in `generate-openapi.js`.
Changed `ProjectMember.joinedAt` to `addedAt` in `client/src/lib/api/types.ts`.

### 1.9 Frontend phantom `addedBy` field

**Root cause:** The frontend `WorkspaceMember` and `ProjectMember` types both
declared `addedBy?: Ref<UserRef> | null`, but no backend model has this field.
It would never appear in a response.

**Fix:** Removed `addedBy` from both interfaces in `client/src/lib/api/types.ts`.

### 1.10 `archivedBy` not documented as populated

**Root cause:** Both `Task` and `Project` services populate `archivedBy` with
user data (`'name email avatar'`) when a document is archived. The OpenAPI schema
documented `archivedBy` as a bare `ObjectId`.

**Fix:** Changed both `Task.archivedBy` and `Project.archivedBy` from
`ref('ObjectId')` to `oneOf: [ref('ObjectId'), ref('User'), { type: 'null' }]`
in `generate-openapi.js`, matching the existing pattern used for `assignee`.

---

## 2. Files Changed

| File | Status | What changed |
| --- | --- | --- |
| `server/scripts/generate-openapi.js` | Modified | Added `token`, `updatedAt` to Invitation; `joinedAt` to WorkspaceMember; `addedAt` to ProjectMember; new `LabelRef` schema; `Task.labels` → `LabelRef[]`; dashboard workspace/project → reduced inline shapes; `pagination` added to labels data shape; new `modified` data shape; `archivedBy` → `oneOf` pattern on Task and Project |
| `server/scripts/openapi-operations.js` | Modified | `PATCH /notifications/read-all` changed from `returns: 'count'` to `returns: 'modified'` |
| `server/docs/openapi.json` | Regenerated | Output of `npm run docs:generate` — 62 paths, 82 operations, 50 schemas |
| `client/src/lib/api/types.ts` | Modified | Removed SPEC GAP comments; added `updatedAt?` to Invitation; removed phantom `addedBy` from WorkspaceMember and ProjectMember; changed `ProjectMember.joinedAt` → `addedAt` |
| `client/src/lib/api/endpoints.ts` | Modified | Labels `list` comment updated; `markAllRead` return type changed from `request<unknown>` to `request<{ modified: number }>` |
| `client/API-INTEGRATION.md` | Modified | Invitation token note updated; "Known spec gaps" renamed to "Resolved spec gaps" with a summary table |
| `server/tests/contract-regression.test.js` | **New** | 6 regression tests pinning each corrected contract |

**No backend service, controller, model, or route files were modified.**
**No frontend component files were modified.**
**No commits were made.**

---

## 3. Tests Run and Results

### 3.1 OpenAPI generation and verification

```
$ npm run docs:generate
Wrote docs\openapi.json
  62 paths, 82 operations, 50 schemas

$ npm run docs:verify
  Routes in code: 82
  Operations documented: 82
  References checked: 517
  Paths documented: 62
  Schemas: 50
  ✓ Documentation matches the implementation.
```

### 3.2 Contract regression tests (new)

```
$ node --test tests/contract-regression.test.js
  tests 6, suites 6, pass 6, fail 0
```

All 6 tests pass:
1. Invitation response includes a 64-char hex `token`
2. Labels list includes a `pagination` object with `total`, `page`, `limit`
3. Task labels are populated objects (or bare ids in store mode; populated
   shape is asserted when `TEST_DB=mongodb`)
4. Workspace dashboard returns `workspace: { id, name }` only
5. Project dashboard returns `project: { id, name, status }` only
6. `PATCH /notifications/read-all` returns `{ modified: N }`, not `{ count: N }`

### 3.3 Full backend test suite

```
$ npm test
  tests 329, suites 69, pass 327, fail 2
```

**2 failures — both pre-existing and unrelated to this work:**

| File | Reason |
| --- | --- |
| `tests/indexes.test.js` | Requires a real MongoDB to test index behaviour; the in-process store has no indexes |
| `tests/transactions.test.js` | Requires a MongoDB replica set for transactions; fails to load env config without the test setup's env overrides |

Both failures occur because no cached `mongod` binary is available on this
machine, so the suite falls back to the in-process store. Running
`TEST_DB=mongodb npm test` (with a cached mongod binary) would resolve both.

### 3.4 Frontend TypeScript typecheck

```
$ tsc --noEmit
  Exit code 0 — no errors
```

---

## 4. Frontend and Backend Contract Alignment

After these changes, the frontend types, the OpenAPI specification, and the
backend runtime behaviour are aligned:

- **Invitation `token`:** Backend returns it, OpenAPI documents it, frontend
  types it as `string`. The SPEC GAP comment that flagged this as a
  hand-typed deviation has been removed.
- **Labels pagination:** Backend returns `{ labels, pagination }`, OpenAPI
  documents both keys, frontend types are compatible.
- **Task labels shape:** Backend populates `{ _id, name, color }`, OpenAPI
  documents `LabelRef[]`, frontend types label refs with `name` and `color`.
- **Dashboard shapes:** Backend returns reduced `{ id, name }` / `{ id, name, status }`,
  OpenAPI documents the same inline shapes.
- **Mark-all-read key:** Backend returns `{ modified }`, OpenAPI documents
  `{ modified }`, frontend types it as `{ modified: number }`.
- **Member fields:** Backend models have `joinedAt` (workspace) and `addedAt`
  (project); OpenAPI documents both; frontend types match.
- **No phantom fields:** `addedBy` has been removed from frontend types — it
  never existed in any backend model.

---

## 5. Remaining Mismatches and Limitations

### Deliberately unfixed (existing, not introduced by this work)

These are documented in the project memory as deliberate design choices and
were not touched:

- `POST /subtasks` returns the parent task under the `subtask` key; `PATCH`
  returns the subtask itself.
- An archived project is still retrievable by id; an archived task 404s.
- `authorize.middleware.js` is dead code; `reorderTaskSchema` is an unused
  validator.
- Two OpenAPI gaps remain hand-typed by design: the invitation `token` **is**
  returned (now documented), and `GET …/labels` returns `pagination` (now
  documented). Both are resolved.

### Test environment limitation

The in-process memory store does not populate arrays of references (e.g.
`Task.labels`). The regression test for task labels handles this by checking
the label id is present in store mode, and asserting the full populated shape
`{ _id, name, color }` only when `TEST_DB=mongodb` (real MongoDB). The OpenAPI
`LabelRef` schema pins the contract regardless of test mode.

### `zod` dependency

The `zod` package was installed into `server/node_modules` with `--no-save`
(it was already declared in `package.json` but not installed). The
`package.json` and `package-lock.json` were not modified.
