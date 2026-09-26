import type { ReactNode } from 'react';
import { BrowserRouter } from 'react-router-dom';

import { ToastProvider, TooltipProvider } from '@/components/ui';
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
 *   1. `BrowserRouter` first, because everything inside may navigate.
 *   2. `AuthProvider` next. It owns the session, and the 401 broadcast it
 *      subscribes to is what tears the session down from anywhere in the tree.
 *   3. `TooltipProvider` — one shared delay for every tooltip. Without it each
 *      tooltip re-waits on its own, and moving along a row of icon buttons feels
 *      broken.
 *   4. `ToastProvider` last, so a toast fired while logging out still has a
 *      viewport to land in.
 *
 * Note what is *not* here: no query client, no global store. The API has no
 * websockets, no optimistic updates and 15-minute sessions, so data fetching is
 * `lib/hooks/useAsync` and per-screen.
 */
export const AppProviders = ({ children }: { children: ReactNode }) => (
  <BrowserRouter>
    <AuthProvider>
      <TooltipProvider>
        <ToastProvider>{children}</ToastProvider>
      </TooltipProvider>
    </AuthProvider>
  </BrowserRouter>
);
