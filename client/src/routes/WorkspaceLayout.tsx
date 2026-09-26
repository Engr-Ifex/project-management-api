import { Bell, Folders, GearSix, SquaresFour, UsersThree } from '@phosphor-icons/react';
import { useMemo } from 'react';
import { Navigate, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';

import { AccountMenu } from '@/components/AccountMenu';
import { WorkspaceMenu } from '@/components/WorkspaceMenu';
import { AppShell } from '@/components/layout/AppShell';
import type { NavItem } from '@/components/layout/AppShell';
import { ErrorState, Skeleton } from '@/components/ui';
import { useUnreadCount } from '@/lib/hooks';
import { WorkspaceProvider, useWorkspace } from '@/lib/workspace/WorkspaceProvider';

/**
 * WorkspaceLayout — the shell every workspace-scoped screen mounts into.
 *
 * It exists because the workspace id is in the URL: the provider needs it before
 * any child can render, so the layout resolves it once and the children can
 * simply call `useWorkspace()`.
 *
 * `RequireAuth` has already run by the time this renders, so a missing user is
 * impossible here.
 */
export const WorkspaceLayout = () => {
  const { workspaceId } = useParams<{ workspaceId: string }>();

  if (!workspaceId) return <Navigate to="/workspaces" replace />;

  return (
    <WorkspaceProvider workspaceId={workspaceId}>
      <WorkspaceChrome />
    </WorkspaceProvider>
  );
};

const WorkspaceChrome = () => {
  const { workspaceId, workspace, loading, error, reload } = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();

  const navItems = useMemo<NavItem[]>(() => {
    const base = `/workspaces/${workspaceId}`;
    return [
      { href: base, label: 'Dashboard', icon: <SquaresFour aria-hidden /> },
      { href: `${base}/projects`, label: 'Projects', icon: <Folders aria-hidden /> },
      { href: `${base}/members`, label: 'Members', icon: <UsersThree aria-hidden /> },
      {
        href: `${base}/notifications`,
        label: 'Notifications',
        icon: <Bell aria-hidden />,
        count: unreadCount,
      },
      { href: `${base}/settings`, label: 'Settings', icon: <GearSix aria-hidden /> },
    ];
  }, [workspaceId, unreadCount]);

  /*
   * The shell compares the active item by equality, but a nested route
   * (`/workspaces/x/projects/y`) is not equal to its nav item's href. Resolving
   * to the longest matching prefix keeps "Projects" highlighted while the user is
   * inside a project — otherwise the sidebar goes blank on every detail screen.
   */
  const activeHref = useMemo(() => {
    const matches = navItems
      .map((item) => item.href)
      .filter((href) => location.pathname === href || location.pathname.startsWith(`${href}/`))
      .sort((a, b) => b.length - a.length);

    return matches[0] ?? location.pathname;
  }, [navItems, location.pathname]);

  if (error) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-canvas">
        <ErrorState
          variant="page"
          title={error.isNotFound ? 'Workspace not found' : 'Could not load this workspace'}
          description={
            error.isNotFound
              ? 'It may have been deleted, or you may not have access to it.'
              : error.message
          }
          onRetry={error.isNotFound ? undefined : reload}
          retryLabel="Try again"
        />
      </div>
    );
  }

  return (
    <AppShell
      navItems={navItems}
      currentPath={activeHref}
      onNavigate={(href) => navigate(href)}
      workspaceSlot={
        loading && !workspace ? (
          <div className="px-2">
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <WorkspaceMenu
            currentWorkspace={workspace ? { id: workspace.id, name: workspace.name } : undefined}
          />
        )
      }
      accountSlot={<AccountMenu settingsHref={`/workspaces/${workspaceId}/settings`} />}
      topbar={
        <span className="truncate text-sm font-medium text-body">
          {workspace?.name ?? 'Workspace'}
        </span>
      }
    >
      <Outlet />
    </AppShell>
  );
};
