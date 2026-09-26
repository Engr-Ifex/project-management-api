import { PaintBrush, SignOut, User as UserIcon } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui';
import { AccountMenuTrigger } from '@/layouts/AppShell';
import { useAuth } from '@/lib/auth/AuthProvider';

/**
 * The account menu at the foot of the sidebar.
 *
 * `AccountMenuTrigger` is the design system's own row component — this only
 * supplies the menu behind it. Logging out is a server call (it clears the
 * cookie), so the state is cleared in the provider's `finally` rather than here;
 * a failed logout request must not leave the UI believing it is still signed in.
 */
export const AccountMenu = ({ settingsHref }: { settingsHref?: string }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <AccountMenuTrigger name={user.name} email={user.email} avatar={user.avatar} />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>{user.email}</DropdownMenuLabel>

        <DropdownMenuItem
          icon={<UserIcon aria-hidden />}
          onSelect={() => {
            if (settingsHref) navigate(settingsHref);
          }}
          disabled={!settingsHref}
        >
          Profile and settings
        </DropdownMenuItem>

        <DropdownMenuItem icon={<PaintBrush aria-hidden />} onSelect={() => navigate('/design')}>
          Design system
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          icon={<SignOut aria-hidden />}
          destructive
          onSelect={() => {
            void logout().then(() => navigate('/login', { replace: true }));
          }}
        >
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
