import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

import { Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth/AuthProvider';

/**
 * A full-page loader.
 *
 * Deliberately a spinner rather than a skeleton here: this is shown while we do
 * not yet know *what* the page will be, so there is no shape to imitate. A
 * skeleton would be a guess at a layout that may never render.
 */
export const FullPageLoader = ({ label = 'Loading' }: { label?: string }) => (
  <div className="flex min-h-[100dvh] items-center justify-center bg-canvas">
    <Spinner size="lg" label={label} />
  </div>
);

/**
 * RequireAuth — gates a subtree on a valid session.
 *
 * `status` is three-valued on purpose. Collapsing `loading` into `anonymous`
 * would bounce a logged-in user to the login screen on every hard refresh, for
 * as long as the session probe takes — which looks exactly like being logged out
 * and is the most common way this pattern is got wrong.
 *
 * The attempted location is carried in router state so login can return the user
 * to where they were headed rather than dumping them on a dashboard.
 */
export const RequireAuth = ({ children }: { children: ReactNode }) => {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageLoader label="Checking your session" />;

  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  return <>{children}</>;
};

/**
 * RequireAnonymous — the inverse, for login and register.
 *
 * Without it, an authenticated user can sit on /login and submit a second
 * session, which is confusing rather than harmful — but the redirect is cheap
 * and the state is impossible to reason about otherwise.
 */
export const RequireAnonymous = ({ children }: { children: ReactNode }) => {
  const { status } = useAuth();

  if (status === 'loading') return <FullPageLoader label="Checking your session" />;
  if (status === 'authenticated') return <Navigate to="/workspaces" replace />;

  return <>{children}</>;
};
