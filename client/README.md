# PROJEX — Client

React 19 + Vite + Tailwind v4 + TypeScript. Phase 2 delivered the design system
(see `DESIGN-SYSTEM.md`); **Phase 3 delivered the application** — routing, the API
client, auth, and every screen. The endpoint contract lives in
`API-INTEGRATION.md`.

The product name is **PROJEX**. It appears in the document title and its suffix
(`useDocumentTitle`), the favicon's accessible name, the auth shell and the
workspace-list header. Internal identifiers — the package name, API paths,
environment variables and folder names — deliberately do not carry it.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173, proxies /api to the backend on :5000
npm run build      # tsc --noEmit && vite build
npm run preview    # serves dist/ with the same proxy
npm run typecheck
```

The backend must be running on **port 5000** for anything beyond the login
screen. Start it from `../server`.

### Why the API is proxied, not called directly

`vite.config.ts` forwards `/api` to `http://localhost:5000`, and the client's
base URL is the relative `/api/v1`. This is load-bearing, not a convenience:

- The session is an httpOnly cookie with **`SameSite=Strict`**. A frontend on
  `:5173` calling an API on `:5000` is a different **origin**, so the browser
  would refuse the response unless the origin were in the server's
  `CORS_ORIGINS` — which is currently **unset**, so cross-origin requests are
  refused outright — and the cookie would not be sent either.
- Proxying makes the browser talk to its own origin, so neither problem exists
  and **the backend needs no change**.
- **`/uploads` is proxied for the same reason, and it is not optional.** Avatars
  are served by the API at `/uploads/avatars/<file>` and the API stores that
  relative path on the user, so the browser requests it from the _frontend_
  origin. Without the proxy the path falls through to the SPA history fallback,
  which answers `200` with `index.html` — the `<img>` receives HTML, fails to
  decode, and the avatar silently reverts to initials. The upload itself
  succeeds, which is exactly why this reads as a broken upload rather than a
  broken URL.

### Session lifetime

There is **no refresh token**, by design. The access token lives 15 minutes
(`JWT_ACCESS_EXPIRES_IN=15m`) and the cookie is set to the same lifetime
(`COOKIE_MAX_AGE=900000`); the server refuses to boot quietly if the two
disagree. A `401` is therefore terminal — the client tears the session down,
routes to `/login`, and explains itself with `sessionExpired`.

What that means in practice, and it is a real limitation rather than a bug:

- A session lasts 15 minutes from sign-in and is **not extended by activity**.
  Work longer than that without a reload and the next request signs you out.
- A `403` and a `400` must **never** end a session. Only `401` does; the client
  broadcasts on that status alone, and the server keeps the session usable after
  the other two. Both are pinned by tests on either side.
- A page refresh does not log you out while the token is valid.

Adding a refresh-token flow would change the authentication architecture, so it
is deliberately out of scope. The practical fix for a longer session is to raise
**both** `JWT_ACCESS_EXPIRES_IN` and `COOKIE_MAX_AGE` together.

The same proxy is configured for `preview`, so the production build can be
exercised locally against the real API.

## Layout

Each folder has one job, and the split between `routes/`, `layouts/` and `pages/`
is deliberate:

```
src/
  main.tsx              mounts <App/>

  app/
    App.tsx             composition root — providers + routes, nothing else
    providers.tsx       the global provider stack, in nesting order

  routes/
    index.tsx           the route table: what URLs exist
    guards.tsx          RequireAuth / RequireAnonymous

  layouts/
    AppShell.tsx        sidebar · drawer · topbar · content — the shell
    AuthShell.tsx       the frame for login/register
    WorkspaceLayout.tsx resolves the workspace, renders the shell, <Outlet/>
    ProjectLayout.tsx   resolves the project, <Outlet/>

  pages/                one file per screen; no routing logic inside

  components/
    ui/                 design-system primitives (pages import the barrel only)
    project/            the project tabs
    AccountMenu · WorkspaceMenu · PageContainer · CopyField

  lib/
    api/                types · client · endpoints  ← the contract, in types
    auth/               AuthProvider — session, 401 teardown
    workspace/          WorkspaceProvider — active workspace + caller's role
    hooks/              useAsync · useMutation · useDebounced · useUnreadCount · usePermission
    constants/          option lists, limits, page sizes
    utils/              cn · formatBytes · formatDate · humaniseEnum
    permissions.ts      capability tables (what to SHOW; the API decides what is ALLOWED)
```

Why the three-way split rather than "pages hold everything":

- **`routes/`** is the only file you read to answer _"what URLs exist"_. It is
  also where the lazy imports live, so code splitting is visible in one place.
- **`layouts/`** own structure — a shell, an outlet, a provider scoped to a
  route. They render `<Outlet/>` and never page content.
- **`pages/`** own a screen and nothing else. A page that starts importing a
  guard or declaring a route has drifted.

`lib/constants/` exists because the option lists were previously copy-pasted —
task statuses appeared in **four** files, so a status added server-side could be
wired into one screen and silently missing from the others. They are now declared
once. The filter variants (`*_FILTER_OPTIONS`) are separate exports from the
form variants on purpose: a filter has a legitimate "all" state, a create form
does not, and one list for both makes it possible to _save_ "All statuses".

### Routes

| Path                                         | Access                               | Screen                                |
| -------------------------------------------- | ------------------------------------ | ------------------------------------- |
| `/login`, `/register`                        | public, redirect away when signed in | `RequireAnonymous`                    |
| `/forgot-password`                           | public, redirect away when signed in | `RequireAnonymous`                    |
| `/reset-password`                            | **public and unguarded on purpose**  | opened from an email, on any device   |
| `/invitations/:token`                        | **public on purpose**                | an invitee usually has no account yet |
| `/design`                                    | public                               | the design-system showcase            |
| `/workspaces`                                | protected                            | the user's workspaces                 |
| `/workspaces/:workspaceId`                   | protected                            | dashboard (index)                     |
| `…/projects`, `…/projects/:projectId`        | protected                            | project list, then the project        |
| `…/projects/:projectId/tasks/:taskId`        | protected                            | task detail                           |
| `…/members`, `…/notifications`, `…/settings` | protected                            |                                       |
| `*`                                          | public                               | not found                             |

**There is no forgot-password or reset-password route**, because the backend has
no such endpoint. `server/src/routes/auth.routes.js` registers exactly three —
`register`, `login`, `logout` — and the generated `openapi.json` contains no
reset path. A screen here would be a form that cannot work.

### Data flow

`useAsync` is a deliberately small fetcher: abort on unmount, distinguish first
load from refetch, keep previous data visible while refetching. Not React Query —
the API has no websockets, no optimistic updates and 15-minute sessions, so a
query library would add weight and a mental model for behaviour nothing needs.

`useMutation.run` resolves to a **discriminated outcome** (`{ ok: true, data }` |
`{ ok: false, error }`), never `undefined`. Every DELETE and archive endpoint
succeeds with no body, so `TResult` is legitimately `undefined` on success —
returning `TResult | undefined` would make a successful delete
indistinguishable from a failure. `outcome.ok` is the only correct test.

## Contract details encoded here

Each of these is a way the API is surprising, and each is handled in one place
rather than at every call site.

| Detail                                                              | Where                                                              |
| ------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `User`/`Workspace` serialize `id`; everything else `_id`            | `refId()` in `lib/api/client.ts`                                   |
| Booleans must be the strings `"true"`/`"false"`                     | `toQueryString()`                                                  |
| Envelope unwrapped once, lists read from a named key + `pagination` | `request()`                                                        |
| 401 is terminal — no refresh token                                  | `onUnauthorized()` → `AuthProvider`                                |
| Downloads are authenticated; `<img src>` 401s                       | `downloadBlob()`                                                   |
| Multipart must not set `Content-Type` (boundary)                    | `request({ formData })`                                            |
| `members` is **omitted** on a project unless you have access        | `Project.members?:` — optional, so the compiler enforces the check |
| `subtasks` is embedded; `labels` is populated                       | `types.ts`                                                         |
| Comment **editing** is author-only, no role overrides it            | `canEditComment()`                                                 |
| Assignee must be a project member (else 400)                        | picker hidden when `members` is absent                             |
| Invitations return a `token`; **no email is sent**                  | `Members.tsx` hands over a copyable link                           |
| `POST …/subtasks` returns the **parent task**                       | `TaskDetail.tsx` refetches instead of reading it                   |

`API-INTEGRATION.md` also flags two OpenAPI response schemas that understate
reality (the invitation `token`, and `GET …/labels` also returning `pagination`).
Both are typed by hand for what the API really returns.

## Verification

```
npx tsc --noEmit    clean (strict, noUncheckedIndexedAccess, noUnusedLocals)
npx eslint .        0 errors, 16 warnings
npx vite build      ✓ built in 46.3s — index 264 kB (84 kB gzip)
```

Two browser suites, both dependency-free (Chrome over the DevTools Protocol via
Node's built-in `WebSocket` — no Playwright, no test runner). Both need the app on
`:4173` and the API on `:5000`, and both exit non-zero on failure:

| Script                 | What it covers                                                                                                                                                                                                                                                                                                   |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run qa`           | Every page at desktop/tablet/mobile: overflow, clipped content, control names, contrast, plus the interaction set (validation, login, refresh, search, destructive confirm, keyboard). 145 checks.                                                                                                               |
| `npm run verify:fixes` | The seven reported bugs, asserted as behaviour: dialog buttons on screen at 1440/834/390 plus a short viewport where the form must scroll, a due date round-tripping through the API, status/priority/assignee persisting, header/value alignment, avatar upload and reload, and the PROJEX branding. 20 checks. |
| `npm run verify:reset` | Password reset, end to end: register (no email at all) → request a reset → read the emailed link → set a new password → sign in with it, plus the single-use, invalid, missing-token and unknown-address states. 14 checks.                                                                                      |

`verify:reset` follows a link that only exists inside an email, and the server
stores only a digest — so the token genuinely cannot be recovered from the
database. It reads it from the **dev harness mailbox** on `127.0.0.1:5051`, which
`dev/boot-real-api.mjs` serves from the test suite's recording email transport.
That mailbox is part of the harness, not the application: an endpoint that
returned reset tokens would be an account-takeover primitive, and
`server/app.js` has no such route.

The 16 lint warnings are all `react-refresh/only-export-components` on files
that deliberately export a hook or a constant alongside their component
(`AuthProvider` + `useAuth`, `StatusBadge` + the status maps, and so on). They
are documented as intentional in `eslint.config.js`; every other rule is an
error and the tree is clean.

Route-level code splitting is real: each screen is its own chunk (`Login`
1.6 kB, `TaskDetail` 12.7 kB, `ProjectOverview` 25.5 kB) rather than the single
493 kB bundle Phase 2 shipped.

### Unauthenticated, against the real build

- `/` → `RequireAuth` redirects to `/login`; the login screen renders, title
  `Sign in · PROJEX`, React mounted. (The product name was `Project Management`
  when this was first measured; the title now carries the current brand.)
- `/design` still renders at **6169 px** — byte-identical to the Phase 2
  measurement, which is how the `AppShell` change was checked for regression.
- `/favicon.ico` → the **404 is fixed** (an SVG favicon is now declared).
- Deep links (`/workspaces/x/projects`) fall back to the SPA.

Routing behaviour, verified with the API deliberately down (so the session probe
fails and the app is genuinely anonymous):

| Requested                   | Landed on             | Meaning                                     |
| --------------------------- | --------------------- | ------------------------------------------- |
| `/login`                    | `/login`              | public route renders                        |
| `/register`                 | `/register`           | public route renders                        |
| `/`                         | `/login`              | index redirects, then auth guard catches it |
| `/workspaces/<id>/projects` | `/login`              | **protected route redirects**               |
| `/invitations/abc123`       | `/invitations/abc123` | stays public while anonymous, by design     |

With a session present, `/login` correctly bounces to `/workspaces` instead —
`RequireAnonymous` working in the other direction.

### Authenticated screens, against `dev/mock-api.mjs`

The real backend was not running, and starting it would mean writing to the
production Atlas cluster in `server/.env` — so all twelve authenticated routes
were rendered against a dependency-free stand-in API listening on `:5000`, which
is the port the preview proxy already targets.

**All twelve rendered with zero failed requests**, each with its own correct
document title: workspace list, dashboard, project list, all five project tabs
(tasks, labels, members, attachments, activity), task detail, workspace members,
notifications and settings.

Two behaviours visible in those screenshots are worth more than the page count:

- The sidebar shows the **unread badge**, so `useUnreadCount` polls and renders.
- On a task, the comment the signed-in user **authored** offers Edit and Delete;
  a colleague's comment offers **Delete only**. That is `canEditComment`
  (author-only, no role override) versus `canDeleteComment` (author _or_
  `comment:moderate`) behaving differently on screen, which is exactly the
  distinction the contract calls out.

**What that does and does not prove.** It proves each screen mounts and renders
against the payload _shapes_ in `API-INTEGRATION.md` without a runtime error. It
does **not** prove the real API returns those shapes — the mock is a claim about
the API, written from the contract and the server's models, not evidence of it.
Nothing here has been exercised against live data. Run `server` on `:5000`, then
`npm run dev`, and sign in to close that gap for real.

**Not present:** the client has no unit-test runner. Everything below is manual,
measurement-based verification — `tsc` (strict) plus `eslint` are the only
automated frontend gates, and neither can see whether the API agrees with the
types. That is why the end-to-end pass against the real backend matters (see the
next section) and why `server/tests/*` carries the executable contract.

## `dev/mock-api.mjs`

A throwaway stand-in API for working on the UI when the backend is unavailable.
Dependency-free; run it on `:5000` (the port the proxy targets) and the app
behaves as if the backend were up.

```bash
npm run mock     # in one terminal
npm run dev      # in another
```

It serves fixed fixtures for the endpoints the screens read. **It is a
development aid, not a contract.** It will drift from the real API, and a green
run against it means "the UI is sound given the documented shapes", not "the API
agrees". Delete it if it becomes misleading.

## Not in the API — do not build against it

No refresh token, password reset, email delivery, user directory, websockets,
bulk operations, task delete, or "current workspace". See the last section of
`API-INTEGRATION.md`.
