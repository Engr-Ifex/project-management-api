# Client

React 19 + Vite + Tailwind v4 + TypeScript. Phase 2 delivered the design system
(see `DESIGN-SYSTEM.md`); **Phase 3 delivered the application** — routing, the API
client, auth, and every screen. The endpoint contract lives in
`API-INTEGRATION.md`.

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

The same proxy is configured for `preview`, so the production build can be
exercised locally against the real API.

## Layout

```
src/
  lib/
    api/          types.ts · client.ts · endpoints.ts   ← the contract, in types
    auth/         AuthProvider — session, 401 teardown
    workspace/    WorkspaceProvider — the active workspace and the caller's role
    hooks/        useAsync · useMutation · useDebounced · useUnreadCount · usePermission
    permissions.ts   capability tables (what to SHOW; the API decides what is ALLOWED)
  components/
    ui/           the design system (Phase 2) — pages import from the barrel only
    layout/       AppShell, PageHeader, AccountMenuTrigger, WorkspaceSwitcher
    project/      the project tabs
  routes/         one file per screen
```

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

| Detail | Where |
| --- | --- |
| `User`/`Workspace` serialize `id`; everything else `_id` | `refId()` in `lib/api/client.ts` |
| Booleans must be the strings `"true"`/`"false"` | `toQueryString()` |
| Envelope unwrapped once, lists read from a named key + `pagination` | `request()` |
| 401 is terminal — no refresh token | `onUnauthorized()` → `AuthProvider` |
| Downloads are authenticated; `<img src>` 401s | `downloadBlob()` |
| Multipart must not set `Content-Type` (boundary) | `request({ formData })` |
| `members` is **omitted** on a project unless you have access | `Project.members?:` — optional, so the compiler enforces the check |
| `subtasks` is embedded; `labels` is populated | `types.ts` |
| Comment **editing** is author-only, no role overrides it | `canEditComment()` |
| Assignee must be a project member (else 400) | picker hidden when `members` is absent |
| Invitations return a `token`; **no email is sent** | `Members.tsx` hands over a copyable link |
| `POST …/subtasks` returns the **parent task** | `TaskDetail.tsx` refetches instead of reading it |

`API-INTEGRATION.md` also flags two OpenAPI response schemas that understate
reality (the invitation `token`, and `GET …/labels` also returning `pagination`).
Both are typed by hand for what the API really returns.

## Verification

```
npx tsc --noEmit    clean (strict, noUncheckedIndexedAccess, noUnusedLocals)
npx vite build      ✓ built in 4.4s — index 261 kB (83 kB gzip)
```

Route-level code splitting is real: each screen is its own chunk (`Login`
1.6 kB, `TaskDetail` 12.7 kB, `ProjectOverview` 25.5 kB) rather than the single
493 kB bundle Phase 2 shipped.

### Unauthenticated, against the real build

- `/` → `RequireAuth` redirects to `/login`; the login screen renders, title
  `Sign in · Project Management`, React mounted.
- `/design` still renders at **6169 px** — byte-identical to the Phase 2
  measurement, which is how the `AppShell` change was checked for regression.
- `/favicon.ico` → the **404 is fixed** (an SVG favicon is now declared).
- Deep links (`/workspaces/x/projects`) fall back to the SPA.

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
  (author-only, no role override) versus `canDeleteComment` (author *or*
  `comment:moderate`) behaving differently on screen, which is exactly the
  distinction the contract calls out.

**What that does and does not prove.** It proves each screen mounts and renders
against the payload *shapes* in `API-INTEGRATION.md` without a runtime error. It
does **not** prove the real API returns those shapes — the mock is a claim about
the API, written from the contract and the server's models, not evidence of it.
Nothing here has been exercised against live data. Run `server` on `:5000`, then
`npm run dev`, and sign in to close that gap for real.

**Not present:** the client has no ESLint config, so `npm run lint` currently
fails. `tsc` covers unused locals and parameters, but not hook-dependency rules.

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
