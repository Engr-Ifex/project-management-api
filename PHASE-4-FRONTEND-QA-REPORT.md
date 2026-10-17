# Phase 4 — Frontend Quality Assurance and Release Polish Report

Scope: Phase 4 §1–§7. **No commit was made. No deployment was begun.**

Everything below was *executed*, not inferred. Where something could not be
verified it is listed under **Not verified** rather than reported as working.

---

## 1. Build and static checks

Every script below is one that actually exists in `client/package.json`. No
script name was invented, and no check was disabled, skipped, or made
non-blocking to produce a green result.

| What | Command | Result |
| --- | --- | --- |
| TypeScript | `npm run typecheck` (`tsc --noEmit`) | **exit 0**, no output |
| Lint | `npm run lint` (`eslint .`) | **0 errors, 16 warnings** |
| Formatting | `npm run format:check` (`prettier --check .`) | **"All matched files use Prettier code style!"** |
| Production build | `npm run build` (`tsc --noEmit && vite build`) | **exit 0**, built in 3.90 s |
| Frontend tests | *(no such script)* | **does not exist** — see below |

The 16 warnings are all `react-refresh/only-export-components`, the pattern
`eslint.config.js` documents as intentional (a module exporting both a component
and a helper). Every other rule is configured as an error. Nothing was
suppressed to reach this state.

### The frontend has no test script

`client/package.json` defines `dev`, `build`, `preview`, `typecheck`, `mock`,
`lint`, `format`, `format:check` — and nothing else. There is no test runner in
`devDependencies` and none in `node_modules`: no vitest, jest, playwright,
cypress or testing-library. This is stated rather than glossed over: §1 asks for
"frontend tests" and the honest answer is that the repository does not have any,
so none were run.

Rather than report that and stop, §5 and §6 were satisfied by building a real
browser harness that exercises the running application — see §5.

### One defect found and fixed in §1

`format` and `format:check` both invoked `prettier`, but **prettier was not in
`client/devDependencies` and not in `client/node_modules`**. Both scripts failed
with `'prettier' is not recognized as an internal or external command`. The
`server/` half of the repo *does* declare prettier (`^3.9.6`) and ships a
`.prettierrc`, so the client was simply missing it.

Fixed by adding `prettier: ^3.9.6` to the client (matching the server),
mirroring `server/.prettierrc` as `client/.prettierrc`, and adding
`client/.prettierignore`. `npm install`, then `npx prettier --write .` to apply
the style for the first time — **47 files changed**.

Because a 47-file diff from a formatter is worth not taking on faith, the change
was verified as cosmetic *before* being applied: a `diff -w` comparison showed
only line-joining and argument-wrapping differences (multi-line `className={cn(…)}`
collapsed to one line, and so on), with no token added, removed or reordered.
`tsc` and `eslint` were re-run afterwards and were unchanged.

---

## 2. Visual and responsive verification

Rather than inspect the pages by eye, every major page was rendered in **real
Chrome** at three viewports and measured.

| Page | Viewports |
| --- | --- |
| Workspace list, Dashboard, Project list, Project overview, Members, Notifications, Settings, Task detail, Design system | 1440×900 desktop, 834×1112 tablet, 390×844 mobile (DPR 2) |

Checks per page per viewport: horizontal overflow, clipped content, control
names, image `alt` and error association, WCAG AA text contrast, plus console
errors across the whole sweep.

**Result: all nine pages clean at all three viewports — no horizontal overflow,
no clipped content, no unreadable text.** Across the sweep: **145 passed, 0
failed**.

Two confirmed defects were found and fixed:

### 2.1 The toast viewport made every page scroll sideways on mobile

`Toast.tsx`'s `ToastPrimitive.Viewport` is `fixed`, so `w-full` resolves against
the initial containing block and already accounts for the viewport's own
scrollbar. Combined with `right-0` and 16px of padding, the box measured **434px
wide in a 390px viewport** — 44px of horizontal document scroll on every page,
including pages that render no toast at all. Because it is invisible until a
toast fires, it survives a visual review completely.

Fixed by deriving the width from the available space instead of 100% of it:
`inset-x-0 … w-auto max-w-full` in place of `w-full … right-0`.

### 2.2 The tab row overflowed on narrow screens

`TabsList` was a plain non-scrolling flex row. Five tabs do not fit 390px, so the
row pushed the document wide. Fixed in the shared primitive with
`overflow-x-auto` plus `shrink-0` on each trigger: the row scrolls, the underline
styling is preserved, and no page-level behaviour changed.

### Design-system page

`/design` is a developer showcase, not a product screen (its own copy says so,
and it is absent from the navigation). It exposed a real contrast problem that
turned out to be **systemic**, covered in §3.

---

## 3. Accessibility

### 3.1 Every keyboard focus ring in the product was invisible — fixed

This is the most serious defect found in this phase.

`src/styles/index.css` drew the focus ring with a bare `:focus-visible` rule. A
bare pseudo-class selector carries specificity (0,1,0), which **loses to a
Tailwind utility like `.focus-visible\:outline-none:focus-visible` (0,2,0)**.
`Input`, `PasswordInput`, `Select`, `Checkbox` and `Tabs` all pair a visible ring
with `outline-none` on the same element, so the utility won and the ring was
stripped.

Measured in Chrome before the fix: pressing Tab twice on `/login` gave

```
first Tab  → INPUT  … outlineStyle: "none"   ← no ring
second Tab → BUTTON … outlineStyle: "none"   ← no ring
```

The application had shipped with **no visible keyboard focus on any primary form
control**. This is invisible to a mouse user and to a screenshot.

Fixed by wrapping the global rules in `:where()`, which contributes **zero**
specificity, so the rule sits below the utilities and cannot be overridden by a
single class again. The components keep their `outline-none`; they no longer
need it removed, because the ring is drawn by the global rule and only the
browser default is being suppressed.

After the fix, measured the same way:

```
focused control paints a visible ring — 2px rgb(52, 133, 121)
```

### 3.2 The skip link could appear with no visible indicator — fixed

`[data-skip-link]` was revealed by `:focus` but the ring was gated on
`:focus-visible`, so the two could disagree: a mouse click made the link fly into
view with its outline stripped by the `:focus:not(:focus-visible)` rule. Changed
the reveal to `:focus-visible` so both conditions match, and the link no longer
appears on a mouse click.

Verified with a real Tab keypress on an authenticated page:

```
skip link is the first tab stop and becomes visible — PASS
```

### 3.3 Low-contrast meta text — fixed at the token level

`--color-body-subtle`, the token behind meta text, timestamps, placeholders and
field hints, was `#7c7871`. Measured against the surfaces the app actually uses:

| Surface | Ratio | AA (4.5:1) |
| --- | --- | --- |
| canvas `#fcfcfb` | 4.28:1 | **fail** |
| panel `#ffffff` | 4.39:1 | **fail** |
| sunken well `#f8f7f5` | 4.10:1 | **fail** |
| ink-100 chip `#f1f0ec` | 3.85:1 | **fail** |

This token is used almost exclusively at 11–12px, where AA requires the full
4.5:1 — so every timestamp and helper line in the product was failing. Changed to
`#6e6a63`, which measures 5.24 / 5.38 / 5.02 / 4.72 on the same four surfaces
while staying clearly lighter than `body-muted` (`#5a5750`), so the three-step
text hierarchy still reads.

Two smaller fixes in the same area: `Badge`'s neutral tone used `ink-600`
(4.28:1 at 12px, a fail) → `ink-700` (10.06:1); and `StatusDot`'s neutral state
used `ink-400`, a 6px dot barely distinguishable from the hairline above it →
`ink-500`. The dot carries no text and owes no ratio; this is a legibility fix,
not a compliance one.

### 3.4 Unnamed controls — fixed

`Checkbox` renders a Radix `<button>`, not an `<input>`. Its adjacent
`<label htmlFor>` therefore does **not** name it, because a `<label for>` only
labels labelable elements. Ten checkboxes on `/design` announced as bare
"button" with no indication of which row they belonged to.

Fixed in the primitive with an `aria-label` that falls back to the visible label
text when the label is a string, plus an explicit `aria-label` prop for the
table-header and row-selection cases the component cannot infer. The showcase's
checkboxes now pass names.

### 3.5 A `<label for>` pointing at nothing — fixed

`/design` composed `FieldShell` with `controlId="custom"` around a plain `<div>`,
producing a dangling label reference: it looks wired up and is not. Added a
`labelAsText` prop to `FieldShell` that renders the heading as a `<span>` and
drops the association, used where the wrapper is a visual grouping rather than a
real label.

### 3.6 Verified clean (no change needed)

Semantic HTML; `aria-current` on nav; `scope="col"` and `aria-sort` on table
headers; `aria-busy` on loading buttons with the label retained; `role="alert"`
on field errors with `aria-describedby` pointing at both hint and error; Radix
focus trap, Escape and `aria-modal` on dialogs; `prefers-reduced-motion`
zeroing animation durations; `alt` on the only two `<img>` elements (decorative
avatar, meaningful preview); `TableWrapper` scrolling the table rather than the
page; `min-h-[100dvh]` rather than `h-screen`.

No non-semantic clickable element exists: a search for `onClick` on `div|span|li|td|tr`
without a `role` returned zero results. No `overflow-x-hidden` is used to mask a
layout problem anywhere.

---

## 4. Interaction and state verification

Nine interactions, all executed against the running application and the real
backend:

| Interaction | Result |
| --- | --- |
| Empty submit is blocked and errors are associated | PASS — 2 fields, each with a resolvable `aria-describedby` |
| Failed login shows an error and does not navigate | PASS |
| Valid credentials navigate into the app | PASS |
| Protected route survives a hard refresh | PASS |
| Search actually changes the result set | PASS — 4 → 1 → 4 |
| Destructive action confirms, and Escape dismisses | PASS |
| Skip link is the first tab stop and becomes visible | PASS |
| A keyboard-focused control paints a visible ring | PASS — 2px |
| No success message appears without a successful request | PASS |

The last one is the anti-false-success check: a rejected submit must not raise a
success toast. It produced none.

---

## 5. Browser verification performed

**Browser automation was not installed — so it was built, rather than reported
as unavailable.** §5 permits reporting the limitation and supplying a manual
checklist. A suitable environment was available: real Chrome, the real backend
on `:5000` against **real MongoDB**, and a production build served by
`vite preview` on `:4173` with a working `/api` proxy. Reporting a limitation in
that situation would have been the wrong answer.

What was **not** done is add Playwright. §6 warns against adding a large testing
framework without clear reason, and the need here — a tab keypress, a computed
colour, a bounding box — is small. Node 22 ships a global `WebSocket`, and Chrome
speaks the DevTools Protocol over one, so the harness needs **no new
dependencies at all**.

Two files, both new, both in `client/dev/`:

- **`cdp.mjs`** — the driver. A `Cdp` class over `WebSocket`, `evaluate`,
  `waitFor` (the auto-wait that stops a check racing the first render),
  `pressKey`, Chrome discovery, the three device profiles, and the injected check
  expressions. `pressKey` exists because `element.focus()` is **not** a
  substitute for a real key event: it moves focus without the browser treating it
  as keyboard-originated, so `:focus-visible` never matches and a correct page
  reads as a failure. That distinction is what made defect 3.1 visible.
- **`qa.mjs`** — seeds a user, workspace, project, tasks, label and invitation
  through the **real API**, then audits every page at all three viewports and runs
  the nine interaction checks. Writes `qa-results.json`. Exits non-zero on any
  failure, so it can gate a release.

Wired into the real scripts as `npm run qa` and `npm run qa:quick`. Final run:

```
===== 145 passed, 0 failed, 0 skipped =====
```

Reproduce with the backend and preview running:

```
MONGOMS_VERSION=6.0.14 TEST_DB=mongodb node client/dev/boot-real-api.mjs   # :5000
cd client && npx vite preview --port 4173                                  # :4173
cd client && npm run qa
```

### Two harness bugs found and fixed while building it

Both mattered, because each produced a *false* result rather than a missing one:

1. **The harness reported a correct page as broken.** It drove the login form
   with `element.focus()` and then asserted the skip link was visible. Because
   script-driven focus never satisfies `:focus-visible`, the link stayed parked
   off-screen and the check failed against a page that was fine. Replaced with
   real Tab key events.
2. **The harness excused errors it should not have.** Console errors were
   filtered by matching the message text for `401`, which would also have hidden
   a genuine 401 from an unrelated request. Replaced with per-phase attribution:
   only the wrong-password and anonymous-probe windows may excuse a 401, and only
   while their flag is set.

### A false positive that was investigated and dismissed

The sweep flagged eight `span`s as clipped content on `/design`. Rather than
assume, the live DOM was probed and the offending element identified: it is the
`sr-only` span itself — a deliberate 1×1px box whose content is clipped **by
design**, which is the standard way to give a control an accessible name without
painting text. Its `scrollHeight` will always exceed its `clientHeight`. The
first two attempts to filter it inferred invisibility from descendant styles and
both failed, because the clipped element *is* the sr-only span and has no
descendants. Excluded by the rule that defines it: clipped and 1px, or clipped
and out of flow. The avatar container was never involved; the names in the
message were its `textContent` showing through from the child.

---

## 6. Regression protection

No testing framework was added. The dependency-free harness is the regression
surface, wired in as `npm run qa`, and it covers the interactions that matter:
validation and error association, failed and successful login, session survival
across a refresh, search actually filtering, destructive confirmation including
Escape dismissal, keyboard reachability, the focus ring, absence of false
success, page geometry at three viewports, contrast, control names, and console
health.

It is a real regression test for the specific defects found in this phase: 3.1
would fail it immediately (the ring check asserts a painted outline), 2.1 would
fail it at mobile (the overflow check measures `scrollWidth` against
`clientWidth`), and 3.3 would fail it on `/design` (the contrast check computes
WCAG ratios against the nearest opaque ancestor background).

Its limits are stated rather than implied. It is not a unit-test suite: it cannot
test a component in isolation, it needs the app running, and ~30 s per sweep is
slower than a unit test. It is the right size for this repository, which has no
frontend test infrastructure to extend.

Separately noted, not changed: `client/qa-results.json` is a generated artefact
and is gitignored via `.prettierignore`. If the harness is kept, that file should
also be added to `.gitignore` — not done here, since it is a repository policy
decision rather than a defect.

---

## 7. Files changed

**Fixed (defects confirmed by measurement)**

| File | Change |
| --- | --- |
| `client/src/styles/index.css` | `:where()` on the focus rules so the ring is no longer overridden by `outline-none` utilities; skip link revealed on `:focus-visible`; `--color-body-subtle` `#7c7871` → `#6e6a63` for AA at 11–12px |
| `client/src/components/ui/Toast.tsx` | Viewport no longer 44px wider than the mobile viewport |
| `client/src/components/ui/Tabs.tsx` | Tab row scrolls instead of pushing the document wide |
| `client/src/components/ui/Checkbox.tsx` | `aria-label` for Radix buttons a `<label for>` cannot name |
| `client/src/components/ui/Field.tsx` | `labelAsText` to drop a dangling `htmlFor` |
| `client/src/components/ui/Badge.tsx` | Neutral text `ink-600` → `ink-700`; neutral dot `ink-400` → `ink-500` |
| `client/src/pages/DesignSystem.tsx` | Names on the selection checkboxes; dead label reference removed |

**Build/config**

| File | Change |
| --- | --- |
| `client/package.json` | Added missing `prettier` devDependency; added `qa` and `qa:quick` scripts |
| `client/.prettierrc` *(new)* | Mirrors `server/.prettierrc` |
| `client/.prettierignore` *(new)* | `dist`, `node_modules`, `public`, `package-lock.json`, `qa-results.json` |
| 47 client source files | Reformatted by prettier, verified layout-only before applying |

**New — browser QA harness**

| File | Change |
| --- | --- |
| `client/dev/cdp.mjs` *(new)* | Dependency-free Chrome DevTools Protocol driver and check expressions |
| `client/dev/qa.mjs` *(new)* | Seeder, per-page audit, interaction checks; exits non-zero on failure |

**Not done, deliberately:** no deployment was begun, and the design system was
not rewritten. Every change preserves the existing visual identity — one token
value darkened, one reveal condition aligned, two layout constraints corrected.

---

## Not verified

- **No frontend test suite exists**, so none was run. §1 asks for frontend tests;
  the repository has no test runner installed. The harness is the substitute.
- **Firefox and Safari were not tested.** The harness drives Chrome only.
- **Contrast was measured against the nearest opaque ancestor background.** It
  does not resolve gradients or background images, matching what a manual sweep
  achieves. No gradient or background image is used in the product, so nothing is
  believed missed.
- **`/design` is a developer showcase**, not a shipped screen. Its findings were
  fixed, and one of them (§3.3) proved to be product-wide.
- **The harness covers desktop interactions only** for the keyboard and state
  checks; geometry and contrast run at all three viewports.
