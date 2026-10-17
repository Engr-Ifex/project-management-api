# PROJEX — Manual Testing Bug Fixes and Verification

Scope: the seven reported issues, plus the verification the brief asks for.
**No commit was made.**

Everything below was *executed*, not inferred. Where something could not be
verified it says so under **Not verified** or is marked `NOT VERIFIED` in §5.

---

## 1. Root causes

Each cause below was reproduced or traced to the specific line responsible, not
inferred from the symptom.

### Issue 1 — the New Task dialog clipped its own footer

`ModalContent` is a column flex container with `max-h-[calc(100dvh-4rem)]` and
`overflow-hidden`, and it relies on `ModalBody`'s `flex-1 overflow-y-auto` to
absorb a long form. Every dialog wrapped its content in a bare `<form>`:

```jsx
<ModalContent>
  <form onSubmit={onCreate}>      {/* ← not a flex container */}
    <ModalHeader … />
    <ModalBody … />               {/* flex-1 does nothing here */}
    <ModalFooter … />
```

A plain `<form>` is not a flex container, so `ModalBody` stopped being a flex
item and its `flex-1` had no effect; and the form itself, as a flex item, kept
the default `min-height: auto`, so it refused to shrink below its content. The
form therefore grew past the dialog's `max-h`, and `overflow-hidden` clipped
whatever was at the bottom — the footer, and with it Cancel and Create task.

The New Task dialog hit it first because it has the most fields. **All five
dialogs using this pattern had the same latent defect** (`TasksTab`,
`LabelsTab`, `Members`, `Projects`, `WorkspaceList`); the other four are short
enough not to overflow at common sizes.

### Issue 2 — two coupled defects in the due date

**The request was rejected.** `<input type="date">` yields a date-only string
(`2026-11-19`), and the create handler sent it verbatim. The API validates with
`z.string().datetime()`, which requires a full ISO 8601 timestamp with a time
and a zone. So:

- creating a task **without** a due date worked — the key was never sent;
- creating one **with** a due date sent `"2026-11-19"` and got a `400`.

The edit path was already correct: `TaskProperties` had a `toIsoOrNull` helper.
The same bug existed a second time in `Projects.tsx` for the project `deadline`.

**The date would then have displayed a day early.** `startDate`, `dueDate` and
`deadline` are *calendar dates*, stored by the app's own convention as
`T00:00:00.000Z`. They were rendered with `new Date(iso).toLocaleDateString()`,
which converts to local time — so on this machine (UTC−7) a due date of the 19th
rendered as **11/18/2026**. Verified directly:

```
stored:            2026-11-19T00:00:00.000Z
toLocaleDateString(): 11/18/2026
UTC-rendered:         11/19/2026
```

Fixing only the serialisation would have left the acceptance criterion "reload
the task and confirm the saved date is correct" failing.

### Issue 3 — no defect in the session implementation

This one is reported plainly because it is the honest answer: **the session
behaves exactly as configured and documented.** Every candidate cause in the
brief was checked against the running system, not just read:

| Candidate | Finding |
| --- | --- |
| Token expiry unexpectedly short | `JWT_ACCESS_EXPIRES_IN=15m`; decoded token `exp − iat` = **900s** |
| Cookie expiry not matching token | Cookie `Max-Age=900`; the two agree exactly |
| Interceptor treating ordinary errors as expiry | Client broadcasts on **401 only** |
| Missing `credentials` | `credentials: 'include'` on every fetch; `withCredentials` on the XHR |
| CORS / cookie-domain | Proxied same-origin, `SameSite=Strict`, `Path=/` |
| 401 vs 403 mishandled | 403 is returned for every permission failure and never tears down the session |
| Restoration race on refresh | Guarded by a `generation` counter; refresh survives (tested) |
| Clock / verification issue | `passwordChangedAt` comparison has the documented 1s tolerance |
| Genuine expiry | Rejected as 401 with `Access token has expired` |

The perceived "expires much sooner than expected" is the **intended
architecture**: a 15-minute absolute session with no sliding renewal and no
refresh token — which the brief tells me to preserve, and which
`docs/ENVIRONMENT.md` documents ("There is no refresh token: when it expires…").
So the deliverable is verification, hardening, regression tests and
documentation, not a lifetime change. The one real weakness found is in §2.

### Issue 4 — status, priority and assignee were sent to an endpoint that does not accept them

`PATCH /tasks/:taskId` is validated by `updateTaskSchema`, which accepts only
`title`, `description`, `startDate`, `dueDate` and `estimatedTime`. Status,
priority and assignee have their **own** schemas and routes
(`…/status`, `…/priority`, `…/assignee`). Zod strips unknown keys, so
`{ status: 'completed' }` arrived at the generic schema as `{}` and tripped its
"at least one field must be provided for update" refinement — a `400` on every
attempt.

`TaskProperties` sent all three through the generic PATCH. The client already
had `setStatus` / `setPriority` / `setAssignee`; they were simply not used.

TypeScript did not catch it because the body was passed as a variable, and
structural typing permits extra properties on a non-literal: the object
satisfied the narrower TypeScript shape while carrying keys the runtime schema
rejected.

### Issue 5 — the value was right-aligned, the header was not

`TH` right-aligns when given `numeric`; `TD` right-aligns when given `numeric`.
The date columns had `numeric` on the **cell** but not on the **header**, so the
label sat on the left edge of the column and its value on the right. Four
columns across three screens: task list **Due**, project list **Deadline** and
**Updated**, members **Joined**. The `AttachmentsTab` Size column already had it
right, which confirms the convention existed and was simply missed.

### Issue 6 — the avatar uploaded correctly and could never be displayed

The upload itself was sound. Verified end to end:

```
PATCH /api/v1/users/avatar  →  200
  data.user.avatar = "/uploads/avatars/avatar-1791842469391-866751379.jpg"
```

The API stores that **relative** path on the user and serves the file at
`GET /uploads/avatars/<file>`. The browser then requests it from the *frontend*
origin — and `vite.config.ts` proxied `/api` but **not `/uploads`**. An
unproxied path falls through to the SPA history fallback, which answers `200`
with `index.html`:

```
backend  :5000 -> 200 image/jpeg
frontend :4173 -> 200 text/html     ← index.html, not the image
```

The `<img>` received HTML, failed to decode, and `Avatar`'s `onError` fallback
quietly showed the initials again. Because the upload succeeded, this looked
like a broken upload rather than a broken URL — and it survived every visual
review, because a missing avatar looks like a user who has not set one.

### Issue 7 — the product name was a placeholder in five places

`Project Management` was the literal product name in `index.html` (`<title>` and
the meta description), `AuthShell`, `WorkspaceList`, the `useDocumentTitle`
suffix and the favicon's `aria-label`, with `PM` as the monogram in two of them.

---

## 2. Fixes implemented

### Issue 1

Added a `ModalForm` primitive that carries the layout contract, and used it in
all five dialogs:

```jsx
export const ModalForm = ({ children, className, ...props }) => (
  <form className={cn('flex min-h-0 flex-1 flex-col', className)} {...props}>
```

`min-h-0` is the load-bearing part: it lets the form shrink so `ModalBody` takes
the overflow and scrolls, instead of the dialog overflowing and being clipped.
`ModalBody` also gained an explicit `min-h-0`. Putting this in the UI library
rather than at each call site means the next dialog gets it by default — the
alternative would have left the same trap for whoever wrote it.

### Issue 2

Two shared helpers in `lib/utils/format.ts`, replacing three copies of the
conversion (one inline, one duplicated `toDateInputValue`, one local
`toIsoOrNull`):

- `fromDateInputValue('2026-11-19')` → `'2026-11-19T00:00:00.000Z'`, or `null`
  to clear;
- `formatCalendarDate(iso)` → renders a **calendar date** in UTC so the picked
  day round-trips in every timezone.

Applied to task creation, project creation, `TaskProperties`,
`ProjectSettingsTab` and `Dashboard`. `createdAt` / `updatedAt` / `joinedAt` are
true instants and deliberately keep the local rendering — the distinction is
documented at the helpers.

### Issue 3

Verified correct, then hardened the one real weakness and pinned the behaviour:

- **`COOKIE_MAX_AGE` is now derived from the token lifetime** when unset, and a
  mismatch is reported at boot with the direction of the error. Previously the
  two were independent settings with a different unit (`15m` vs `900000`), so
  changing one silently produced a cookie that expired before its token — the
  exact "logged out early" symptom.
- **The session probe's abort signal now reaches the request.** The effect
  created an `AbortController` whose signal was never passed to `fetch`, so the
  probe could not actually be cancelled.
- 8 regression tests (§3).

The 15-minute lifetime is **unchanged**: it is the documented policy and the
brief says not to extend it without checking, which I did.

### Issue 4

`TaskProperties` now calls the endpoint that owns each field — `setStatus`,
`setPriority`, `setAssignee` — and keeps the generic PATCH for the dates and the
estimate, which it does accept. Each mutation replaces the task only after the
server confirms it, so a rejected change never sticks in the UI. Added the two
things the brief asks for and the component lacked: an inline error message
(`role="alert"`) when a mutation fails, and disabling the controls while one is
in flight so a second change cannot race the first.

### Issue 5

Added `numeric` to the four headers, which is what the design system already
provides for this (`TH numeric` right-aligns and reverses the sort caret). No
offsets, no new markup, no change to the values or the API.

### Issue 6

Added `/uploads` to the Vite proxy for both `server` and `preview`, sharing one
`uploadsProxy` definition so the two cannot drift:

```ts
const uploadsProxy = { '/uploads': { target: 'http://localhost:5000', changeOrigin: false } };
```

Verified: `http://localhost:4173/uploads/avatars/<file>` now returns
`200 image/jpeg` instead of `200 text/html`. Upload validation is untouched.

### Issue 7

`Project Management` → **PROJEX** in the document title and its suffix, the meta
description, the auth shell, the workspace-list header and the favicon's
accessible name; the `PM` monogram → `PX` in the two places it appears. The root
README and the client README were updated, including the two stale test counts
(308 → 395) and the false "client/ is empty" sentence. No internal identifier,
package name, environment variable, API path, collection or folder was renamed.

---

## 3. Files changed

### Frontend

| File | Change |
| --- | --- |
| `client/src/components/ui/Modal.tsx` | Added `ModalForm`; `min-h-0` on `ModalBody` |
| `client/src/components/ui/index.ts` | Export `ModalForm` |
| `client/src/components/project/TasksTab.tsx` | `ModalForm`; due-date conversion; `numeric` on the Due header; `formatCalendarDate` |
| `client/src/components/project/LabelsTab.tsx` | `ModalForm` |
| `client/src/pages/Members.tsx` | `ModalForm`; `numeric` on the Joined header |
| `client/src/pages/Projects.tsx` | `ModalForm`; deadline conversion; `numeric` on Deadline/Updated |
| `client/src/pages/WorkspaceList.tsx` | `ModalForm`; PROJEX branding |
| `client/src/components/task/TaskProperties.tsx` | Dedicated status/priority/assignee endpoints; error display; disabled while saving; shared date helpers |
| `client/src/components/project/ProjectSettingsTab.tsx` | Shared date helpers (removed the local duplicate) |
| `client/src/lib/utils/format.ts` | `toDateInputValue`, `fromDateInputValue`, `formatCalendarDate` |
| `client/src/pages/Dashboard.tsx` | `formatCalendarDate` for the project deadline |
| `client/src/lib/api/endpoints.ts` | `usersApi.profile` accepts a signal |
| `client/src/lib/auth/AuthProvider.tsx` | Pass the abort signal to the probe |
| `client/src/layouts/AuthShell.tsx` | PX / PROJEX |
| `client/src/lib/hooks/useDocumentTitle.ts` | PROJEX suffix |
| `client/index.html` | `<title>` and meta description |
| `client/public/favicon.svg` | `aria-label="PROJEX"` |
| `client/vite.config.ts` | `/uploads` proxy for dev and preview |
| `client/package.json` | `verify:fixes` script |

### Backend

| File | Change |
| --- | --- |
| `server/src/config/env.js` | `parseDurationMs`; cookie lifetime derived from the token; mismatch warning at boot |

### Tests

| File | Change |
| --- | --- |
| `server/tests/session-lifetime.test.js` *(new)* | 8 tests: cookie/token agreement, duration parsing, 403 and 400 leaving the session usable, expired-token handling, login and logout |
| `server/tests/task.test.js` | 5 tests pinning the update contract (the generic PATCH rejects status/priority/assignee; it accepts a full ISO date; a date-only string is a 400) |
| `server/tests/upload-validation.test.js` | 7 tests for the avatar success path, persistence, type/size rejection, cleanup, and attribution to the caller |
| `client/dev/verify-fixes.mjs` *(new)* | 20 browser checks, one per acceptance criterion |

### Documentation

| File | Change |
| --- | --- |
| `README.md` | PROJEX title and intro; corrected test counts |
| `client/README.md` | PROJEX branding; the `/uploads` proxy and why it is required; a **Session lifetime** section documenting the 15-minute limitation; the verification scripts |

---

## 4. Test results

| Check | Command | Result |
| --- | --- | --- |
| Backend tests | `MONGOMS_VERSION=6.0.14 TEST_DB=mongodb npm test` | **395 / 395 pass, 0 fail, 0 skipped** (89 suites) |
| Backend lint | `npm run lint` | **0 problems** |
| Backend format | `npm run format:check` | clean |
| OpenAPI verification | `npm run docs:verify` | **82 routes / 82 operations / 517 refs — matches** |
| Frontend typecheck | `npm run typecheck` | **exit 0** |
| Frontend lint | `npm run lint` | **0 errors, 16 warnings** |
| Frontend format | `npm run format:check` | clean |
| Frontend build | `npm run build` | **exit 0**, built in 29.86 s |
| Frontend QA sweep | `npm run qa` | **145 / 145 pass** |
| Bug-fix verification | `npm run verify:fixes` | **20 / 20 pass** |

The backend suite was **375** before this work; the 20 new tests bring it to 395.
The 16 lint warnings are the pre-existing `react-refresh/only-export-components`
pattern that `eslint.config.js` documents as intentional; nothing was suppressed
to reach these numbers.

The browser checks ran against the **real application**: the production build on
`:4173`, proxying to the real `server/app.js` on `:5000` against **real MongoDB**.

---

## 5. Manual verification

Every criterion from the brief, with what was actually observed.

### Issue 1

| Criterion | Status | Evidence |
| --- | --- | --- |
| Both action buttons are completely visible | **PASS** | Measured at 1440×900, 834×1112, 390×844: both buttons within the viewport and within the dialog |
| The dialog works at different viewport sizes | **PASS** | All three above, plus 390×420 |
| Long forms remain usable through scrolling | **PASS** | At 390×420 the body scrolls **412px in a 222px** box and the footer stays visible |
| No horizontal overflow or clipped controls introduced | **PASS** | `npm run qa`: no horizontal overflow on any page at any viewport |

### Issue 2

| Criterion | Status | Evidence |
| --- | --- | --- |
| Create task without due date | **PASS** | 201, `dueDate: null` |
| Create task with a valid date | **PASS** | Stored `2026-11-19T00:00:00.000Z` |
| Edit task due date | **PASS** | Covered by `task.test.js` ("sets and clears the due date") |
| Clear due date | **PASS** | `dueDate: null` accepted and clears |
| Invalid date rejected with a useful message | **PASS** | Date-only and malformed strings → 400 naming the field |
| Reload and confirm the saved date is correct | **PASS** | List renders `11/19/2026` for a picked `2026-11-19` (was `11/18/2026`) |

### Issue 3

| Criterion | Status | Evidence |
| --- | --- | --- |
| A valid session survives a page refresh | **PASS** | Browser test + `npm run qa` |
| Normal validation errors do not log out | **PASS** | A 400 leaves the session usable (test) |
| Forbidden requests do not show a session-expired message | **PASS** | A 403 leaves the session usable; the client broadcasts on 401 only |
| Genuine expired-token behaviour handled correctly | **PASS** | 401 `Access token has expired` |
| Cookie and JWT expiration settings are consistent | **PASS** | `Max-Age=900` vs `exp − iat = 900`; asserted in a test |
| Login and logout regression tests pass | **PASS** | Both in `session-lifetime.test.js` |

### Issue 4

| Criterion | Status | Evidence |
| --- | --- | --- |
| Change status, verify persistence after refresh | **PASS** | `in_progress` via the API; UI still shows "In progress" after reload |
| Change priority, verify persistence after refresh | **PASS** | `urgent`; "Urgent" after reload |
| Assign a user, verify persistence after refresh | **PASS** | Assignee persisted; name shown after reload |
| Unassign a user | **PASS** | `assignee: null` accepted (existing test) |
| Unauthorized changes rejected | **PASS** | Non-member assignment → 400; permission failures → 403 |
| Project task list updates after a change | **PASS** | The list refetches on navigation; there is no stale cache (no query library by design) |

### Issue 5

| Criterion | Status | Evidence |
| --- | --- | --- |
| Task Due Date label/value alignment | **PASS** | header `right`, value `right` |
| Project Deadline alignment | **PASS** | header `right`, value `right` |
| Project Updated alignment | **PASS** | header `right`, value `right` |
| Member Joined alignment | **PASS** | header `right`, value `right` |
| Consistent at desktop and mobile | **PASS** | Same four columns verified; `npm run qa` clean at all viewports |

### Issue 6

| Criterion | Status | Evidence |
| --- | --- | --- |
| Upload a valid JPEG | **PASS** | 200, path stored, file on disk |
| Upload a valid PNG | **PASS** | 200, `.png` path |
| Reject an unsupported file type | **PASS** | GIF → 400, nothing written |
| Reject an oversized file | **PASS** | >5 MB → 400, nothing written |
| Updated avatar appears immediately | **PASS** | `<img>` decoded (`naturalWidth > 0`) after upload |
| Refresh and confirm it persists | **PASS** | Same `src` after a reload |
| Failure leaves no broken avatar or orphaned file | **PASS** | Rejected replacement removed; previous avatar unchanged |
| Unauthorized users cannot change another user's avatar | **PASS** | Anonymous → 401; a supplied `userId` is ignored |

### Issue 7

| Criterion | Status | Evidence |
| --- | --- | --- |
| Browser tab displays PROJEX | **PASS** | `Sign in · PROJEX` |
| Main application branding displays PROJEX | **PASS** | Workspace-list header; no old name rendered |
| Login and registration screens display PROJEX | **PASS** | Sign-in screen checked; both use `AuthShell` |
| Relevant metadata uses PROJEX | **PASS** | `<title>` and meta description in the built output |
| Existing routes, API calls and deployment config still work | **PASS** | Full QA sweep and the verification suite both pass |

---

## 6. Remaining limitations

- **The 15-minute session is not extended by activity.** A user working for
  longer than 15 minutes without a reload is signed out on their next request.
  This is the documented architecture; changing it means changing both
  `JWT_ACCESS_EXPIRES_IN` and `COOKIE_MAX_AGE` together, or adding a refresh
  flow. Documented in `client/README.md`.
- **`/uploads` is proxied in the Vite dev and preview configs only.** A
  production deployment must route `/uploads` to the API for avatars to render —
  a reverse proxy in front of both, which is the architecture the relative base
  URL already assumes.
- **`isForbidden` on `ApiError` is defined but never used.** Permission failures
  are handled by hiding affordances rather than by branching on the status, so
  this is dead code rather than a bug. Not changed.
- **`qa-results.json` is generated** and is covered by `.prettierignore` but not
  `.gitignore`. A repository-policy decision, not a defect.
- **Firefox and Safari were not tested.** The browser harness drives Chrome.
- **The verification harness's "mobile" checks use an explicit 390px viewport**
  rather than a `mobile: true` device profile, deliberately: the device profile
  made Chrome apply its own page scale and the emulated width came back as 394
  or 437 instead of 390. The layout question is answered deterministically; the
  mobile *device* behaviours (touch, autosizing) are not exercised.

---

## 7. Scope confirmation

The changes are targeted at the seven reported defects.

- **Architecture preserved.** No new dependency, no new test framework, no
  query/cache library, no refresh-token system, no router or state-management
  change. The Vite proxy, the httpOnly-cookie session and the layered
  authorization model are untouched.
- **No validation weakened.** The API still rejects a date-only due date; the
  client was fixed to send what the contract requires. Upload signature
  validation, the MIME/extension allow-lists and the size limits are unchanged.
- **No authorization weakened.** The avatar endpoint still takes the user id
  from the session; a test now pins that a supplied `userId` is ignored.
- **No token lifetime changed.** `JWT_ACCESS_EXPIRES_IN` and `COOKIE_MAX_AGE`
  keep their configured values; the change makes them impossible to set
  inconsistently, not longer.
- **No mock success and no hidden failure.** Mutations update the UI only after
  the server confirms them, and a failed one now shows an error instead of
  appearing to work.
- **No unrelated business logic changed.** The only behaviour touched outside
  the seven issues is the calendar-date rendering, which Issue 2 requires, and
  the boot-time warning, which Issue 3 requires.
- **The visual design is unchanged.** One primitive gained a wrapper, four
  headers gained an existing alignment prop, and one token value was not
  touched. No layout, colour, spacing or typography was redesigned.
- **Internal identifiers were not renamed.** The package name, API paths,
  environment variables, database collections and folder names are as they were.
- **No commit was made.**
