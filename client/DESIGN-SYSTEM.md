# Design System

**Phase 2 deliverable.** The visual system, its tokens and its primitives —
established before any application page exists. No application pages are built
yet; the design system is verified through the showcase route.

Stack: **React 19 + Vite + Tailwind CSS v4 + TypeScript**. Run `npm run dev` and
open the app to see every token and component rendered.

---

## 1. Decisions

Every choice below was made deliberately. The ones marked **[judgement]** are
where a different call was plausible and the reasoning matters more than the
outcome.

### 1.1 The design dials, and why they are low

The brief asked for a professional project-management product, and the skill's
defaults are tuned for marketing pages. They are wrong here, so they are set
explicitly:

| Dial | Skill default | **Set here** | Why |
| --- | --- | --- | --- |
| `DESIGN_VARIANCE` | 8 (asymmetric) | **2** | This is an application shell. Alignment and repetition are what make a dense table scannable; asymmetry in a data grid is noise. |
| `MOTION_INTENSITY` | 6 (fluid) | **2** | The brief says "subtle interactions, purposeful animation only". At level 2 that means CSS transitions and nothing else — **no Framer Motion dependency at all**. |
| `VISUAL_DENSITY` | 4 (airy) | **6** | A task list, a sidebar and a table have to coexist. Airy spacing here means scrolling to see eight rows. |

**[judgement] No animation library.** At intensity 2 the entire motion
vocabulary is background-colour, border-colour, opacity and a 1px press. That is
~2 kB of CSS versus ~35 kB of Framer Motion for no visible gain. It is added
when something needs shared-layout animation, which nothing does yet.

### 1.2 Colour: the accent is not the primary button

The palette is one neutral ramp, one accent, and four semantic hues.

**[judgement] Primary buttons are graphite, not the accent.** This is the single
most consequential decision in the system. In this product colour carries
meaning — teal is "in progress", red is "urgent", amber is "in review". A
saturated primary button sitting next to a status column would compete with the
data the user is trying to read, and the status colours would stop registering.

The accent is therefore restricted to exactly four uses:

1. Focus rings
2. The selected navigation item
3. Links
4. The "in progress" status

Anything else that reaches for teal is a bug.

**[judgement] A warm neutral, not slate.** The blue-grey that every dashboard
template ships with is the strongest single signal of an unconsidered UI, and it
fights the teal. The `ink` ramp is neutral with a trace of warmth, so surfaces
read as paper rather than as a screen.

**No purple. No blue accent.** The brief rules both out, and neither is needed —
the four semantic hues cover status, priority and risk on their own.

**Semantic hues are muted, and always used as tints.** A chip is the hue at ~8%
on a light surface with the hue itself as text and a 20% border. A solid
coloured chip in a table of forty rows turns the table into a colour field and
the status stops being readable. The one exception is `StatusDot`, a 6px solid
dot — the most compact carrier of status in a dense list.

### 1.3 Typography: 14px base, and no oversized headings

Geist for interface text, Geist Mono for ids, counts and figures. Both
self-hosted through `@fontsource-variable` — no external font CDN, because a
blocked request to a third-party host silently falls back to a system font and
changes every metric on the page.

**Base size is 14px, not 16px.** This is a dense application; 16px base makes a
task list feel like a blog post. The scale stops at **30px**, and a page title is
**20px** — a title in an application is a label for where you are, not a
headline. The brief's "no oversized headings everywhere" is enforced by the
scale simply not having anything larger.

Body copy is capped at ~65 characters where it runs to a paragraph.

**Tabular figures everywhere numbers align.** `font-variant-numeric:
tabular-nums` is applied to `th`, `td`, `time` and `[data-numeric]`. Without it
every column of figures jitters by a pixel and the table looks loose.

### 1.4 Radius and elevation: restrained

| Token | Value | Used for |
| --- | --- | --- |
| `xs` | 4px | badges, checkboxes |
| `sm` | 6px | small buttons |
| `md` | 8px | buttons, inputs, selects |
| `lg` | 10px | cards, panels, menus |
| `xl` | 14px | modals |
| `full` | 9999px | pills, avatars |

**[judgement] The ceiling for a panel is 10px.** The brief rules out "excessive
rounded cards", and a 20px+ radius on a card is the second-most reliable
template tell after blue-grey. Only pills and avatars go fully round.

Shadows are warm-tinted (`rgb(28 27 24 / …)`), low-opacity and layered. They
communicate **stacking order**, not decoration. There is no coloured shadow, no
glow, and no neon ring anywhere in the system.

### 1.5 Structure over decoration

Three rules that keep the UI from looking generated:

- **Lists are divided by hairlines, not boxed.** Forty bordered cards stacked
  vertically is noise; forty rows separated by a `divide-y` line is a table.
  `Card` is for a genuine panel, not for every item in a collection.
- **A table row is separated by a border between rows, never by a border around
  every cell.** A grid of 1px boxes is what makes a data table look like a
  spreadsheet from 2004.
- **Every state exists.** Loading, empty, error and no-results are components,
  not afterthoughts. See §4.

### 1.6 TypeScript, and why

**[judgement]** The brief specified React + Vite + Tailwind and did not mention
types. TypeScript is used because the API has exactly the shape of contract
where types prevent real bugs — `User` and `Workspace` serialize `id` while
every other resource uses `_id`, `members` is **optional** on a project
depending on the caller's access, and the status enums must match the server.
The domain badges in `StatusBadge.tsx` are keyed by those enums, so a status
added server-side becomes a compile error rather than a silently unstyled chip.

Strict mode is on, including `noUncheckedIndexedAccess`.

### 1.7 Light theme only, for now

**[judgement]** Dark mode was not requested and is not built. It is, however,
**additive rather than a rewrite**: no component references a raw ramp value —
they reference the semantic layer (`bg-surface`, `text-body-muted`,
`border-line`). A dark theme is a `[data-theme='dark']` block that redefines
those ~12 variables and a `color-scheme` switch. Nothing else changes.

---

## 2. Tokens

Defined once, in `src/styles/index.css`, under Tailwind v4's `@theme`. No
component hardcodes a hex value, a pixel radius or a duration.

### Colour

```
ink-25 … ink-950          warm neutral ramp — 13 steps
accent-50 … accent-900    desaturated teal — interactive state only
success-50/100/200/500/600/700
warning-…                 amber — in review, medium priority
caution-…                 orange — high priority
danger-…                  red — urgent, destructive
```

**Semantic layer** — what components actually use:

| Token | Meaning |
| --- | --- |
| `canvas` | the page behind everything |
| `surface` | panels, cards, tables |
| `surface-sunken` | wells, inset areas, disabled controls |
| `surface-hover` / `surface-active` | row and item states |
| `line` / `line-strong` / `line-subtle` | default border, input border, internal divider |
| `body` / `body-muted` / `body-subtle` / `body-inverse` | primary, secondary, meta, on-graphite |

### Type scale

`2xs` 11 · `xs` 12 · `sm` 13 · **`base` 14** · `md` 15 · `lg` 16 · `xl` 20 ·
`2xl` 24 · `3xl` 30. Line heights are paired with each size.

### Spacing

A 4px base step, Tailwind's default scale. Two named layout tokens exist because
they are referenced in several places and would otherwise drift: `--spacing-sidebar`
(15rem) and `--spacing-topbar` (3.5rem).

### Motion

Two easings and three durations: **120ms** for micro-interactions (hover, press),
**180ms** for a state change, **240ms** for an overlay entrance. Only
`transform`, `opacity`, `background-color`, `border-color` and `box-shadow` are
ever transitioned.

`prefers-reduced-motion: reduce` is honoured globally in the base layer — it
collapses every animation and transition to 0.01ms, so no component has to
remember.

---

## 3. Components

All exported from `@/components/ui`. **Pages import from the barrel and never
from a component file directly**, so an internal rename never touches a page.

### Primitives

| Component | Notes |
| --- | --- |
| `Button` | 5 variants × 3 sizes. `loading` keeps the label for width stability. |
| `IconButton` | `label` is required — it becomes the accessible name. |
| `Input` / `Textarea` | Label, hint and error built in, with the ARIA wiring done for you. |
| `Select` | Radix listbox: arrow keys, type-ahead, focus returns on close. |
| `Checkbox` | Radix, with an indeterminate state and a clickable label. |
| `FieldShell` / `useFieldControl` | For a control that is not one of the built-ins. |
| `Badge` / `StatusDot` | 6 tones × soft/outline × 2 sizes. |
| `Avatar` / `AvatarGroup` | Initials fallback, deterministic tint, `+N` overflow. |
| `Card` / `CardHeader` / `CardBody` / `CardFooter` / `StatTile` | |
| `Table` + 8 sub-components | Sortable headers with `aria-sort`, density, skeleton rows. |
| `Tabs` / `SegmentedControl` | Tabs change *what*; a segmented control changes *how*. |
| `Tooltip` | Shared 300ms delay via one provider. |
| `DropdownMenu` + 9 sub-components | Row actions, account menu, submenus. |
| `Modal` / `ConfirmDialog` | Focus trap, Escape, scroll containment. |
| `ToastProvider` / `useToast` | `success` / `error` / `warning` / `info`. |
| `Skeleton` / `SkeletonText` / `SkeletonList` / `Spinner` / `LoadingOverlay` | |
| `EmptyState` / `ErrorState` | Two empty variants — see §4. |
| `Pagination` | Takes the API's `pagination` object directly. |

### Domain components

`TaskStatusBadge`, `TaskPriorityBadge`, `ProjectStatusBadge`,
`WorkspaceRoleBadge`, `ProjectRoleBadge`, `LabelChip` — and the mapping tables
behind them.

These live in the design system rather than in each page because the mapping is
a product decision that must be identical everywhere. A status that is amber on
the board and teal in the list is a bug the user cannot report.

`LabelChip` is the one component that takes a colour from data rather than from
the palette — labels carry a user-chosen hex in the API. It derives a 14% tint
and an 82% text colour from it, so a user who picks pure red gets a readable
chip rather than a solid block.

### Layout

`AppShell`, `PageHeader`, `AccountMenuTrigger`, `NavItem`.

The shell is a fixed sidebar (240px) on desktop and a slide-over drawer on
mobile. **The content region owns its own scrolling**, so the nav and the
workspace switcher stay reachable from anywhere in a long list — the single
biggest structural difference between a tool and a document.

---

## 4. States

The brief lists loading, empty and error states separately. They are treated as
a first-class part of every list-bearing component.

**[judgement] Empty and no-results are different states.** This is the detail
that most products get wrong. "No tasks yet" with a Create button is correct
when there is genuinely nothing. "No tasks match these filters" with a Clear
filters button is correct when there is plenty but none of it matches. Showing
the first when the second is true tells the user their data is gone.

`EmptyState` takes `variant="empty" | "no-results"` and the copy follows.

**Loading uses skeletons shaped like the content, not spinners.** A centred
spinner says "something is happening"; a skeleton says what, and stops the
layout jumping when the data lands. `TableSkeletonRows` and `SkeletonList` are
provided so a list does not have to invent its own.

**Errors are recoverable.** `ErrorState` takes an `onRetry`, because the common
failure in this API is transient.

---

## 5. Responsive behaviour

| Breakpoint | Shell | Tables | Forms |
| --- | --- | --- | --- |
| `< 640px` | Drawer nav, topbar with a menu button | Horizontal scroll inside the wrapper — never the page | Single column |
| `640–1024px` | Drawer nav | Horizontal scroll | 2 columns where it fits |
| `≥ 1024px` | Fixed 240px sidebar | Full width | 2 columns |

Rules that hold at every size:

- `min-h-[100dvh]`, never `h-screen`. On mobile Safari the viewport shrinks as
  the address bar appears, and `100vh` leaves a strip of the page permanently
  behind it.
- **Tables scroll inside their own wrapper.** A wide table must not push the
  whole layout sideways.
- Content is capped at `max-w-content` (1400px) and centred, so a task list does
  not stretch to 3000px on an ultrawide monitor.
- Tap targets are at least 28px; icon buttons are square and never smaller.

---

## 6. Accessibility

Not a later pass — built into the primitives:

- **Focus is always visible**, as a 2px accent `outline` with a 2px offset.
  `outline` rather than `box-shadow`, so it survives `overflow: hidden` and is
  never clipped by a rounded ancestor.
- **Every control is labelled.** `IconButton` requires a `label` prop; form
  controls generate `id`/`htmlFor` pairs and set `aria-describedby` and
  `aria-invalid` themselves, so the error message is announced rather than only
  drawn.
- **Sortable table headers set `aria-sort`.**
- **Overlays come from Radix**, which is where the focus trap, the Escape
  handling, the background inert-ing and the `aria-modal` wiring come from.
- **A skip link** is the first tab stop in the shell.
- **Toasts are `aria-live` regions** that pause on hover, so a message is not
  dismissed while it is being read.
- **Contrast**: body text is `ink-900` on white (≈15:1). Muted text is
  `ink-600` (≈7:1). Every semantic chip is the 700 step on its own 50 step
  (≥4.5:1).

---

## 7. Deliberately not included

- **No dark mode** — see §1.7. Additive when wanted.
- **No animation library** — see §1.1.
- **No routing, no API client, no auth context** — Phase 3. `App.tsx` mounts
  only the providers every future page will need, so no page has to remember
  them.
- **No generated imagery or illustration.** Nothing in this system needs it; an
  empty state is one sentence and one action, not a drawing.
- **No `shadcn/ui`.** Radix supplies unstyled behaviour and every visual
  decision here is ours — which is the point, since dropping in a component
  library's defaults is how a product ends up looking like every other one.

---

## 8. Using it

```tsx
import { Button, Card, CardHeader, CardBody, TaskStatusBadge } from '@/components/ui';

<Card>
  <CardHeader
    title="Sprint 24"
    action={<Button size="sm">Open</Button>}
  />
  <CardBody>
    <TaskStatusBadge status="in_progress" />
  </CardBody>
</Card>
```

Rules for adding to the system:

1. **Never hardcode a colour, radius, duration or font size.** If a value is
   missing, add a token — that is how the ramp stays coherent.
2. **Every component takes `className`** and merges it through `cn()`, so a
   caller can adjust spacing without editing the component.
3. **A new domain enum gets a mapping in `StatusBadge.tsx`**, not an inline
   conditional at the call site.
4. **A new component gets an entry in the showcase.** The showcase is how a
   regression in a shared component is caught in one place instead of on
   whichever page happens to use it.

---

## 9. Verification

```
npx tsc --noEmit     clean (strict mode)
npx vite build       ✓ built — CSS 42 kB (8.7 kB gzip), JS 493 kB (149 kB gzip)
```

The bundle figure is the **whole design system imported at once** by the
showcase, with no route splitting. Unused icons tree-shake correctly (verified:
icons not imported are absent from the output). Code splitting arrives with the
router in Phase 3.

Token emission was verified in the built CSS: the custom colour, radius, text
and spacing tokens are present, and the shadow values are inlined into the
`shadow-*` utilities by Tailwind v4. `skeleton-shimmer` and `scrollbar-thin`
emit as custom utilities.

### Browser verification (2026-09-26)

Verified against the **production build** (`client/dist`, served statically on
`127.0.0.1:5173`) and driven by headless Chrome over CDP. The dev server was not
used, so what is confirmed is the shipped artifact rather than the dev pipeline.

| Check | Result |
| --- | --- |
| Whole page renders | 1440 × 6169 px — colour, type, spacing, radius, elevation, buttons, forms, badges, avatars, cards, stats, tables, pagination, tabs, dialogs, empty / no-results / error, skeletons |
| `≥ 1024px` | Fixed 240px sidebar, content region scrolls independently — confirmed at 1024 and 1440 |
| `768–1024px` | Sidebar collapses to the drawer, hamburger in the topbar; swatch grid reflows 9 → 7 per row |
| `< 640px` (390) | Drawer nav, single column, 2-up swatch grid; the table scrolls **inside its wrapper** and the page itself never scrolls sideways |
| Modal | Opens over a dimmed backdrop, focus lands inside, Escape closes and returns focus |
| Dropdown menu | Opens with a section label (`TASK`), a shortcut (`⌘E`), and the destructive item in red |
| Toasts | Stack bottom-right; success and error variants, each with a dismiss control |

Three things the browser run settled that the build could not:

- **The self-hosted faces load.** `document.fonts` reports `Geist Variable` and
  `Geist Mono Variable` as `loaded`, and the computed family is
  `"Geist Variable", ui-sans-serif, …` — no silent fallback.
- **The base size is 14px** as specified, and **`font-variant-numeric:
  tabular-nums` is actually applied** to `td` — the Estimate column aligns.
- **The page makes six requests and none fail**, apart from
  `/favicon.ico` → 404. There is no favicon in the project; a browser will
  always ask for it. Worth adding one, but it is cosmetic.

Not verified: keyboard-only traversal of every control, and Safari / Firefox.
Both need a non-headless session.
