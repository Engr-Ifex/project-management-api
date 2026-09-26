import { useMemo } from 'react';

import { useAuth } from '@/lib/auth/AuthProvider';
import { workspaceCan } from '@/lib/permissions';
import { useWorkspace } from '@/lib/workspace/WorkspaceProvider';

/**
 * Resolves the caller's workspace capabilities for the active workspace.
 *
 * A convenience over `workspaceCan.*(role)` so a page can write
 * `can.inviteMembers` instead of threading the role through every call site. The
 * underlying rule still lives in `@/lib/permissions` — this only reads it.
 *
 * These answers decide what to **show**. The API decides what is **allowed**; a
 * 403 means this was wrong, and the correct response is to hide the affordance,
 * not to retry.
 */
export const usePermission = () => {
  const { user } = useAuth();
  const { role } = useWorkspace();

  return useMemo(
    () => ({
      userId: user?.id ?? null,
      workspaceRole: role,
      isOwner: role === 'owner',
      isElevated: role === 'owner' || role === 'admin',
      can: {
        updateWorkspace: role !== null && workspaceCan.updateWorkspace(role),
        inviteMembers: role !== null && workspaceCan.inviteMembers(role),
        removeMembers: role !== null && workspaceCan.removeMembers(role),
        manageProjects: role !== null && workspaceCan.manageProjects(role),
        manageProjectMembers: role !== null && workspaceCan.manageProjectMembers(role),
        changeMemberRole: role !== null && workspaceCan.changeMemberRole(role),
        archiveWorkspace: role !== null && workspaceCan.archiveWorkspace(role),
        deleteWorkspace: role !== null && workspaceCan.deleteWorkspace(role),
        transferOwnership: role !== null && workspaceCan.transferOwnership(role),
      },
    }),
    [user, role]
  );
};
