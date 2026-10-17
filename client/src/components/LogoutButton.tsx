import { SignOut } from '@phosphor-icons/react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/shell';
import { useAuth } from '@/lib/auth/AuthProvider';

/**
 * LogoutButton — the visible way out of a signed-in session.
 *
 * `AuthProvider.logout()` clears the client session in a `finally`, so local
 * state is gone whether or not the request succeeds. That makes the destination
 * the same in both cases: the user is signed out locally and `/login` is the
 * only honest place to send them. Keeping them on a protected page would just
 * make `RequireAuth` bounce them a moment later.
 *
 * The request can still fail — a lapsed session answers 401, the network can be
 * down — but there is nothing useful to retry: the cookie is either already
 * invalid or the API is unreachable, and the session this UI knows about is
 * cleared either way.
 *
 * `loading` on the button is the visible pending state; `aria-label` keeps the
 * accessible name when the text is collapsed on narrow screens.
 */
export const LogoutButton = ({
  className,
  variant = 'secondary',
  size = 'sm',
  /** Hide the text below `sm`, keeping the icon and its accessible name. */
  collapseOnMobile = false,
}: {
  className?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  collapseOnMobile?: boolean;
}) => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);

  const onClick = async () => {
    setPending(true);

    try {
      await logout();
    } catch {
      /*
       * Deliberately swallowed: `logout()` has already cleared the session in
       * its `finally`. Reporting "could not sign out" would be false — the user
       * is signed out here — and there is no retry that could help.
       */
    } finally {
      setPending(false);
      navigate('/login', { replace: true });
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      loading={pending}
      aria-label="Log out"
      iconLeft={<SignOut aria-hidden />}
      onClick={() => void onClick()}
    >
      <span className={collapseOnMobile ? 'hidden sm:inline' : undefined}>Log out</span>
    </Button>
  );
};
