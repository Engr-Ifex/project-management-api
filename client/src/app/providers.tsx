import type { ReactNode } from 'react';
import { BrowserRouter } from 'react-router-dom';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AuthProvider } from '@/lib/auth/AuthProvider';

/*
 * The global provider stack.
 *
 * State management in this app is React context, not a store library. There are
 * exactly three pieces of cross-cutting state — the router, the session, and the
 * active workspace — and the third is *not* here on purpose: it is scoped to the
 * workspace routes and lives in `layouts/WorkspaceLayout.tsx`, because a
 * workspace id only exists in the URL.
 *
 * The order below is load-bearing:
 *
 *   1. `ErrorBoundary` outermost, so it also catches a throw *inside* a provider.
 *      It can safely sit outside them because `ErrorState` reads no context.
 *   2. `BrowserRouter` next, because everything inside may navigate.
 *   3. `AuthProvider`. It owns the session, and the 401 broadcast it subscribes
 *      to is what tears the session down from anywhere in the tree.
 *
 * Note what is *not* here: no query client, no global store. The API has no
 * websockets, no optimistic updates and 15-minute sessions, so data fetching is
 * `lib/hooks/useAsync` and per-screen.
 *
 * ## Why the toast and tooltip providers were removed from here
 *
 * They used to wrap the whole application, and they were expensive: mounting
 * `TooltipProvider` pulls in Radix's tooltip and the whole of `@floating-ui`
 * (~52 KB of rendered JavaScript), and `ToastProvider` pulls in Radix's toast
 * (~22 KB). Both were paid on **every page load**, including the sign-in screen.
 *
 * Measured, before moving them: the login page fetched 157.6 KB (gzip) of
 * JavaScript and Lighthouse reported 75 KiB of unused JavaScript on first load.
 *
 * The reason they could be moved is that neither had a consumer outside the
 * design-system showcase — `Tooltip` is rendered in exactly one file
 * (`pages/DesignSystem.tsx`) and `useToast` is called in exactly one file (the
 * same one). No product screen renders a tooltip; `IconButton` uses the native
 * `title` attribute, not `Tooltip`. So the application was paying ~74 KB of
 * JavaScript on every route to serve one dev-only page.
 *
 * Both providers now live in that page, next to their only consumer.
 *
 * **If a product feature ever needs a toast or a tooltip, mount the provider
 * there** — `useToast` throws outside a `ToastProvider`, and `<Tooltip>` needs
 * `TooltipProvider` for its shared open delay. Putting it back here is the right
 * call at that point, and the cost becomes justified.
 */
export const AppProviders = ({ children }: { children: ReactNode }) => (
  <ErrorBoundary variant="page">
    <BrowserRouter>
      <AuthProvider>{children}</AuthProvider>
    </BrowserRouter>
  </ErrorBoundary>
);
