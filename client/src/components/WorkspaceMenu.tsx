import { Plus, SquaresFour } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Skeleton,
} from '@/components/ui';
import { WorkspaceSwitcher } from '@/components/layout/AppShell';
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
 */
export const WorkspaceMenu = ({
  currentWorkspace,
}: {
  currentWorkspace?: { id: string; name: string } | undefined;
}) => {
  const navigate = useNavigate();
  const { data, loading } = useAsync(() => workspacesApi.list({ limit: 100 }), []);

  const workspaces = data?.workspaces ?? [];

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
            onSelect={() => navigate(`/workspaces/${workspace.id}`)}
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
