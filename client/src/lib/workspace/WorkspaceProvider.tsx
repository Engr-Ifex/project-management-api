import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';

import type { ProjectRole, WorkspaceRole } from '@/components/ui';
import type { ApiError, Workspace } from '@/lib/api';
import { refId, workspacesApi } from '@/lib/api';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useAsync } from '@/lib/hooks/useAsync';

/*
 * WorkspaceProvider
 *
 * Every endpoint under `/workspaces/…` requires a `workspaceId` in the path —
 * there is no "current workspace" concept on the server. So the active workspace
 * is a property of the URL, and this provider simply resolves the one the route
 * names.
 *
 * The caller's role is read from the workspace's own `members` array. That array
 * arrives **unpopulated** (`members[].user` is a raw ObjectId), which is exactly
 * what is needed here: the `role` field sits on the member entry itself, so the
 * role costs nothing extra to obtain. The members *screen* needs names and
 * avatars, so it calls `GET …/members`, which does populate them — a different
 * concern with a different request.
 *
 * Policy A lives here: a workspace `owner`/`admin` has authority over every
 * project in the workspace, so `canActOnProject` short-circuits on this role
 * rather than requiring project membership.
 */

export interface WorkspaceContextValue {
  workspaceId: string;
  workspace: Workspace | undefined;
  /** The caller's role, or `null` if they are somehow not a member. */
  role: WorkspaceRole | null;
  loading: boolean;
  error: ApiError | undefined;
  reload: () => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export const WorkspaceProvider = ({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: ReactNode;
}) => {
  const { user } = useAuth();

  const state = useAsync(
    () => workspacesApi.get(workspaceId).then((data) => data.workspace),
    [workspaceId]
  );

  const role = useMemo<WorkspaceRole | null>(() => {
    const members = state.data?.members;
    if (!members || !user) return null;

    const entry = members.find((member) => refId(member.user) === user.id);
    return entry?.role ?? null;
  }, [state.data, user]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspaceId,
      workspace: state.data,
      role,
      loading: state.loading,
      error: state.error,
      reload: state.reload,
    }),
    [workspaceId, state.data, state.loading, state.error, state.reload, role]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};

export const useWorkspace = (): WorkspaceContextValue => {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace must be used inside a WorkspaceProvider');
  return context;
};

/**
 * The role a project-scoped screen should use for the caller.
 *
 * Project responses only include `members` for a caller who has access, and the
 * project member list is what tells us the caller's project role. When it is
 * absent, the caller is a workspace member without project access — in which case
 * a workspace owner/admin still has authority (Policy A) and anyone else has
 * none.
 */
export const useProjectRole = (
  projectMembers: { user: unknown; role: string }[] | undefined
) => {
  const { user } = useAuth();
  const { role: workspaceRole } = useWorkspace();

  return useMemo(() => {
    const entry = projectMembers?.find((member) => refId(member.user) === user?.id);
    const projectRole = (entry?.role ?? null) as ProjectRole | null;

    return {
      projectRole,
      workspaceRole,
      /** True when the caller may act on the project at all. */
      hasAccess:
        workspaceRole === 'owner' || workspaceRole === 'admin' || projectRole !== null,
    };
  }, [projectMembers, user, workspaceRole]);
};
