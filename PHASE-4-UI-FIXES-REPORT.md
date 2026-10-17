# Phase 4 — UI Fixes Report

Logout, page gutters, mobile 3D alignment, long task labels.

---

## 1. Files modified

### New
| File | Purpose |
| --- | --- |
| `client/src/components/LogoutButton.tsx` | Visible sign-out control (loading state, redirect) |

### Changed
| File | Change |
| --- | --- |
| `client/src/layouts/WorkspaceLayout.tsx` | Account slot now renders the account menu **plus** a visible Log out button (sidebar footer and mobile drawer) |
| `client/src/pages/WorkspaceList.tsx` | Visible Log out in the header; account menu narrowed on mobile |
| `client/src/components/PageContainer.tsx` | Responsive gutter `px-4 sm:px-6 lg:px-8` |
| `client/src/layouts/AppShell.tsx` | `PageHeader` gutter matches |
| `client/src/layouts/ProjectLayout.tsx` | Header gutter matches |
| `client/src/pages/Dashboard.tsx` | Header gutter matches |
| `client/src/pages/Projects.tsx` | Header gutter matches |
| `client/src/pages/Members.tsx` | Header gutter matches |
| `client/src/pages/Notifications.tsx` | Header gutter matches |
| `client/src/pages/Settings.tsx` | Header gutter matches |
| `client/src/pages/MarketingHomepage.tsx` | Responsive gutters on every section; nav uses SPA navigation |
| `client/src/components/marketing/Scene3D.tsx` | Rewritten scaling + float (see §4) |
| `client/src/components/project/TasksTab.tsx` | Title and assignee truncation with accessible full text |
| `client/src/pages/TaskDetail.tsx` | Task title wraps instead of pushing the Edit button; description breaks long tokens |
| `client/src/components/task/SubtaskList.tsx` | Long subtask titles wrap; delete button no longer pushed out |
| `client/src/components/task/CommentSection.tsx` | Author/date row wraps; comment body breaks long tokens |
| `client/src/components/task/TaskProperties.tsx` | Assignee and creator names break |
| `client/src/components/ui/StatusBadge.tsx` | `LabelChip` truncates inside its container |

No dependencies added. No backend files touched.

---

## 2. How logout was implemented

The product already had a logout **action** — a `Log out` item inside the account
dropdown — but nothing visible. The dropdown is the only place it existed, which
is exactly the "there is no logout button" report.

`LogoutButton` uses the existing `useAuth().logout()` (the same
`POST /auth/logout` call, no new endpoint):

```tsx
try {
  await logout();
} finally {
  navigate('/login', { replace: true });
}
```

`AuthProvider.logout()` clears the client session in a `finally`, so local state
is gone whether or not the request succeeds. Navigating in the same `finally`
matches that: keeping the user on a protected page would only make
`RequireAuth` bounce them a moment later. A failed request is swallowed
deliberately — the user *is* signed out locally, and there is nothing to retry.

Placement:

- **Desktop**: sidebar footer, directly under the account row. `AppShell` renders
  its `accountSlot` in both the desktop sidebar and the mobile drawer, so the
  same control serves both without a second implementation.
- **Mobile**: inside the navigation drawer (opened from the header's menu
  button), same position.
- **`/workspaces`**: this screen has its own chrome rather than the shell, so it
  gets its own visible button in the header (icon-only below `sm`, with
  `aria-label="Log out"`).

The dropdown item remains. The button only renders where a user is signed in —
`AccountMenu` returns `null` without a user, and the button lives beside it.

Loading is the button's own `loading` state (`aria-busy` + spinner, label kept
for width stability). Errors cannot leave a half-signed-in UI because the
provider has already cleared the session.

---

## 3. How home page spacing was improved

Every marketing section was `px-4` at all widths — 16px from the edge of a
1440px canvas, which reads as cramped. There is now one gutter used by the
marketing page, the app shell and every page container:

```
px-4 sm:px-6 lg:px-8
```

applied to the hero, features, workflow, showcase, final CTA and footer, and to
`PageContainer` / `PageHeader` / the hand-written page headers. Content stays
inside `max-w-[1400px]` (`max-w-content` in the token set) and centred, so wide
screens gain margin rather than line length.

---

## 4. What caused the mobile 3D misalignment

Two independent bugs, both real:

**a) Fixed-pixel composition wider than a phone.** The cards are authored at
offsets up to ±140px and are 170–210px wide, so the scene needs ~504px of width
to sit inside its container. A 375px viewport leaves ~343px of content. The
left-most card started about 70px outside the container and the right-most about
45px past it; the section's `overflow-hidden` then cut them off.

Fix: a single `scale()` on the 3D stage, computed from a `ResizeObserver` on the
container (`width / 504`, clamped to `0.55–1`). Offsets, card widths and depth
are still authored once; the whole composition shrinks. Desktop stays at scale 1.

**b) The float keyframe double-applied the centring offset.** The cards are
centred with `translate(-50%, -50%)` in their inline `transform`, and a
`@keyframes` rule animated the *independent* `translate` property. Both applied,
so every card sat half its own size up and to the left of its intended position.
That is why the scene looked misaligned even on wide screens.

Fix: the float (`sin(t)` ±5px) is now computed in the same transform string the
parallax writes. The keyframe is gone.

Reduced motion is unchanged in intent: the loop never starts and the cards keep
their static composed arrangement (which is still scaled to fit).

---

## 5. How long task labels behave now

| Surface | Behaviour |
| --- | --- |
| Task list — title | One line, ellipsis at `min(26rem, 55vw)`. Full text in `title` (hover) and on the detail page. A long sentence no longer widens the Task column; an unbroken 140-char token no longer pushes the row sideways. |
| Task list — assignee | One line, ellipsis at `10rem`, full name in `title`. |
| Task list — labels | `LabelChip` is `max-w-full min-w-0` with a truncating child; the chip stops at the cell edge and keeps the full name in `title`. |
| Task detail — title | Wraps at word boundaries and breaks long unbroken tokens (`min-w-0 break-words`); the Edit button is `shrink-0` and stays put. |
| Task detail — description | `break-words` alongside `whitespace-pre-wrap`, so a pasted URL no longer overflows the card. |
| Subtasks | Text takes the remaining width and wraps; the delete button is `shrink-0`. |
| Comments | Author truncates, timestamp stays on one line and the row wraps; comment bodies break long tokens. |
| Properties | Assignee and "Created by" names break rather than overflow. |

Verified with a 180-character unbroken URL: it wrapped to 9 lines (252px tall),
`scrollWidth === clientWidth`, entirely inside its card.

---

## 6. Checks completed

Environment: production build served by `vite preview` on `:4173`, driving the
**real** Express app on `:5000` (the `boot-real-api` harness), headless Chrome
155 via CDP.

**21/21 checks passed:**

| Area | Checks |
| --- | --- |
| Homepage @ 320 / 390 / 834 / 1440 | No horizontal page scroll; all 5 3D cards inside their container; Log in + Get started present |
| Homepage landscape 844×390 | No horizontal scroll; 5 cards inside container |
| Desktop shell | Visible `Log out` button found and visible |
| Mobile shell | `Log out` visible inside the navigation drawer |
| Logout | Redirects to `/login`; `/workspaces` after logout redirects to `/login` |
| Task list @ 390 and 1440 | No horizontal page scroll; long titles truncated and inside their cell |
| Task detail @ 390 | 180-char unbroken title wraps inside the card; subtask text inside its row; no page scroll |
| Console | No errors and no uncaught exceptions |

Static checks: `tsc --noEmit` **0 errors**, `eslint` **0 errors** (16 pre-existing
`react-refresh` warnings), `prettier --check` clean on changed files, production
build exit 0.

The project's own `npm run qa` / `verify:fixes` suites were **not** run — they
need their own seeded fixture and a longer sweep. The targeted harness above
covers the changed surfaces against the same real API.

---

## 7. Remaining issues for your attention

1. **Mobile drawer logout requires opening the menu.** It is visible once the
   drawer is open; a permanently visible control in the top bar would compete
   with the notification bell on small screens. Say the word if you want it in
   the top bar instead.
2. **The task table still scrolls horizontally inside its wrapper on a phone.**
   Six columns do not fit 390px; that is the `TableWrapper` design, not page
   overflow. The page itself does not scroll sideways.
3. **The 3D scene scales rather than reflows.** Below ~500px it is a smaller
   version of the desktop composition, not a different one. It stays legible to
   the 0.55 floor; if you want a genuinely different mobile arrangement, that is
   a design decision rather than a bug fix.
4. **Not verified on physical iOS Safari.** `100dvh`, `backdrop-filter` and
   `ResizeObserver` behave correctly in headless Chrome, but the address-bar
   resize behaviour is worth one manual check on a real device.
5. **A failed logout still redirects.** This is intentional and matches the
   provider's contract, but if you want a "could not reach the server" message
   before redirecting, that needs a small change to `AuthProvider`.
