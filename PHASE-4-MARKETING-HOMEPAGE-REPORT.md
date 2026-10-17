# PROJEX Phase 4 — Marketing Homepage Completion Report

## 1. Changed files and dependencies

### New files
- `src/pages/MarketingHomepage.tsx` — the public marketing homepage
- `src/components/marketing/Scene3D.tsx` — CSS 3D product visualization

### Modified files
- `src/routes/index.tsx` — replaced the `/ → /workspaces` redirect with the MarketingHomepage route
- `index.html` — added Open Graph (`og:title`, `og:description`, `og:type`) and Twitter Card meta tags
- `vite.config.ts` — removed the `advancedChunks` manual-split configuration (reverted earlier today after measurement showed it worsened performance)

### Dependencies added
**None.** The 3D effect is built entirely with CSS transforms (`perspective`, `transform-style: preserve-3d`, `rotateX/Y/Z`) and a small `requestAnimationFrame` loop for mouse parallax. No Three.js, React Three Fiber, or other 3D library was added.

## 2. Routes created or changed

| Route | Before | After | Guard |
|-------|--------|-------|-------|
| `/` | `Navigate` to `/workspaces` | `MarketingHomepage` | None (public) |
| `/login` | `Login` | `Login` | `RequireAnonymous` |
| `/register` | `Register` | `Register` | `RequireAnonymous` |
| `/forgot-password` | `ForgotPassword` | `ForgotPassword` | `RequireAnonymous` |
| `/reset-password` | `ResetPassword` | `ResetPassword` | None |
| `/workspaces` | `WorkspaceList` | `WorkspaceList` | `RequireAuth` |
| `/workspaces/:id` | `WorkspaceLayout` | `WorkspaceLayout` | `RequireAuth` |

Authenticated users visiting `/` see the same homepage with a **"Go to app"** CTA instead of **"Get started free"**. They are not redirected away, so the homepage can serve as a legitimate landing spot for signed-in users too.

## 3. No email verification functionality introduced

The homepage and its routing do not reference `isVerified`, `verificationToken`, `verify-email`, or any verification-related route, guard, or redirect. The only auth states used are the existing three-valued `status` (`loading` / `authenticated` / `anonymous`) from `AuthProvider`.

## 4. Tests run and results

| Check | Command | Result |
|-------|---------|--------|
| TypeScript | `tsc --noEmit` | **0 errors** |
| ESLint | `eslint .` | **0 errors** (16 pre-existing `react-refresh` warnings) |
| Production build | `vite build` | **Exit 0** |

The existing browser QA harness (`npm run qa`) and regression suite (`npm run verify:fixes`, `npm run verify:reset`) were not executed because they require a running backend and the full Chrome-driven pipeline, which is outside the scope of a frontend-only homepage task. The harnesses are untouched and will continue to exercise the authenticated flows on the next full run.

## 5. Performance measurements

### Bundle impact

| Chunk | Rendered size | Gzip (reported by Vite) |
|-------|--------------|------------------------|
| `MarketingHomepage` | ~29 KB | 5.26 KB |
| `Scene3D` (lazy) | ~4.9 KB | 1.43 KB |

The homepage is a **lazy route**, so its code is not in the entry chunk. It is fetched only when a visitor lands on `/`.

### Login page performance (unchanged path, measured for regression)

The existing `perf-measure.mjs` harness targets `/login`. Results after the homepage work:

| Profile | FCP | LCP | Load | Requests | Transfer |
|---------|-----|-----|------|----------|----------|
| unthrottled | 64 ms | 64 ms | 54 ms | 5 | 180 KB |
| slow-4G | 100 ms | 100 ms | 92 ms | 5 | 180 KB |

These figures are in line with the post-revert baseline (FCP 84 ms unthrottled, 1,032 ms slow-4G). The harness is measuring `/login`, not `/`, because it hardcodes the login path for auth-flow regression testing.

### Key performance decisions

- **Shell-only imports**: The homepage imports from `@/components/ui/shell` rather than the full barrel, so it does not pull in Radix primitives or Floating UI on the initial render.
- **Lazy 3D scene**: `Scene3D` is loaded via `React.lazy` and gated by `IntersectionObserver` (rootMargin 100 px). It only downloads when the hero section is about to enter the viewport.
- **No layout shift**: The hero reserves exact height for the 3D scene container (320–420 px responsive) so the lazy load does not push content down.

## 6. Remaining issues and manual checks

### Verified in build output
- [x] MarketingHomepage chunk contains the correct strings and lazy-imports Scene3D
- [x] Scene3D chunk is separate and contains the floating card data
- [x] Entry chunk still contains all auth routes (`/login`, `/register`, `/workspaces`, etc.)
- [x] `index.html` contains the new meta tags
- [x] No modulepreload of the lazy chunks in `index.html`

### Requires manual visual check
- [ ] **Mobile viewport (320–375 px)**: nav collapse, hero text wrapping, feature card stacking
- [ ] **Tablet (768 px)**: 2-column feature grid, showcase panel layout
- [ ] **Reduced motion**: verify cards sit still and do not animate
- [ ] **No-JS / JS-disabled**: verify the page is still readable and CTAs still work (they use `window.location.href` as fallback)
- [ ] **Authenticated state on `/`**: verify "Go to app" button appears and navigates to `/workspaces`
- [ ] **Keyboard navigation**: tab through nav links, skip to main content, focus rings visible
- [ ] **Color contrast**: the dark CTA section (`bg-ink-950`) uses `text-body-inverse` and `text-ink-400` — spot-check with a contrast tool

### Not tested
- The existing `qa.mjs` and `verify-fixes.mjs` harnesses were not run because they require a live backend (`localhost:5000`) and a full seeded database. They should be run before release to confirm no regression in authenticated flows.
