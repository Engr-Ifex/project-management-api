import { Plus, SquaresFour } from '@phosphor-icons/react';
import { useLocation, useNavigate } from 'react-router-dom';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Skeleton,
} from '@/components/ui';
import { WorkspaceSwitcher } from '@/layouts/AppShell';
import { workspacesApi } from '@/lib/api';
import { useAsync } from '@/lib/hooks';

/**
 * The workspace switcher and its menu.
 *
 * Every path under `/workspaces/…` carries the workspace id, so "switching" is a
 * navigation, not a stored preference — there is no server-side notion of a
 * current workspace to change. That also means this menu must preserve the
 * *section* the user is in when it switches: dropping someone from
 * `/workspaces/a/projects` onto `/workspaces/b` loses their place for no reason.
 *
 * Depth *below* a section is deliberately not preserved. A project id from one
 * workspace cannot exist in another, so `/workspaces/a/projects/p/tasks/t`
 * switches to `/workspaces/b/projects` rather than to a guaranteed 404.
 */
export const WorkspaceMenu = ({
  currentWorkspace,
}: {
  currentWorkspace?: { id: string; name: string } | undefined;
}) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { data, loading } = useAsync(() => workspacesApi.list({ limit: 100 }), []);

  const workspaces = data?.workspaces ?? [];

  /**
   * The target href for switching to `workspaceId`, keeping the current section.
   *
   * The section is taken from the path itself rather than from a hardcoded list,
   * so it cannot drift from the route table. Anything unrecognised — including a
   * path that is not under the current workspace at all — falls back to the
   * workspace root, which is always a valid destination.
   */
  const hrefFor = (workspaceId: string) => {
    const base = `/workspaces/${workspaceId}`;
    if (!currentWorkspace) return base;

    const prefix = `/workspaces/${currentWorkspace.id}`;
    if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) return base;

    const section = pathname.slice(prefix.length).split('/').filter(Boolean)[0];

    return section ? `${base}/${section}` : base;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <WorkspaceSwitcher>
          {currentWorkspace?.name ?? (loading ? 'Loading…' : 'Select workspace')}
        </WorkspaceSwitcher>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>

        {loading && workspaces.length === 0 && (
          <div className="px-2 py-1.5">
            <Skeleton className="h-4 w-32" />
          </div>
        )}

        {!loading && workspaces.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-body-subtle">
            You are not in a workspace yet.
          </div>
        )}

        {workspaces.map((workspace) => (
          <DropdownMenuItem
            key={workspace.id}
            checked={workspace.id === currentWorkspace?.id}
            onSelect={() => navigate(hrefFor(workspace.id))}
          >
            {workspace.name}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuItem icon={<SquaresFour aria-hidden />} onSelect={() => navigate('/workspaces')}>
          All workspaces
        </DropdownMenuItem>

        <DropdownMenuItem icon={<Plus aria-hidden />} onSelect={() => navigate('/workspaces?new=1')}>
          New workspace
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
