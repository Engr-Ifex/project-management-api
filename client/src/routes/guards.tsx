import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

import { Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth/AuthProvider';
import { intendedDestination } from '@/lib/auth/redirect';

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
 *
 * It sends the user to the **same destination the form would**, rather than
 * always to the workspace list. Both fire when a session is established: the
 * form calls `navigate(from)` on success, and this guard re-renders as
 * `authenticated` and redirects. Whichever commits last wins, so if the two
 * disagreed the result would be a race — and the user, having just been told
 * "we will take you back to where you were", would land on a dashboard instead.
 * Agreeing on the destination makes the outcome the same either way.
 */
export const RequireAnonymous = ({ children }: { children: ReactNode }) => {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageLoader label="Checking your session" />;
  if (status === 'authenticated') {
    return <Navigate to={intendedDestination(location.state)} replace />;
  }

  return <>{children}</>;
};
