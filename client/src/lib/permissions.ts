import type { ProjectRole, WorkspaceRole } from '@/components/ui';

/*
 * Capability tables.
 *
 * These decide what to **show**. The API decides what is **allowed**, and it is
 * the only authority — a 403 means the client was wrong. So this file exists to
 * avoid offering an action that will certainly fail, not to enforce anything.
 *
 * Transcribed from `client/API-INTEGRATION.md` §15, which was read from the
 * running backend. Two rules are easy to get wrong and are commented where they
 * bite:
 *
 * - Workspace owner/admin override every project in their workspace (Policy A),
 *   so project-level checks are only consulted when the caller has no workspace
 *   elevation.
 * - Object-level exceptions are NOT role-based: editing a comment is author-only
 *   and no role overrides it.
 */

export const workspaceCan = {
  view: (_role: WorkspaceRole) => true,

  updateWorkspace: (role: WorkspaceRole) => role === 'owner' || role === 'admin',
  inviteMembers: (role: WorkspaceRole) => role === 'owner' || role === 'admin',
  removeMembers: (role: WorkspaceRole) => role === 'owner' || role === 'admin',

  /** Create, update, archive, restore a project, and manage its members. */
  manageProjects: (role: WorkspaceRole) => role === 'owner' || role === 'admin',
  manageProjectMembers: (role: WorkspaceRole) => role === 'owner' || role === 'admin',

  /** Owner only. */
  changeMemberRole: (role: WorkspaceRole) => role === 'owner',
  archiveWorkspace: (role: WorkspaceRole) => role === 'owner',
  deleteWorkspace: (role: WorkspaceRole) => role === 'owner',
  transferOwnership: (role: WorkspaceRole) => role === 'owner',
};

export const projectCan = {
  /** Tasks, subtasks, comments, labels, attachments, dashboard, activity. */
  view: (_role: ProjectRole) => true,

  createTask: (role: ProjectRole) => role !== 'viewer',
  updateTask: (role: ProjectRole) => role !== 'viewer',
  assignTask: (role: ProjectRole) => role !== 'viewer',
  comment: (role: ProjectRole) => role !== 'viewer',
  manageSubtasks: (role: ProjectRole) => role !== 'viewer',
  assignLabels: (role: ProjectRole) => role !== 'viewer',
  uploadAttachments: (role: ProjectRole) => role !== 'viewer',

  /** Owner and admin are identical here. */
  archiveTask: (role: ProjectRole) => role === 'owner' || role === 'admin',
  manageLabels: (role: ProjectRole) => role === 'owner' || role === 'admin',
  manageMembers: (role: ProjectRole) => role === 'owner' || role === 'admin',
  changeMemberRole: (role: ProjectRole) => role === 'owner' || role === 'admin',

  /** `comment:moderate` / `attachment:moderate`. */
  moderate: (role: ProjectRole) => role === 'owner' || role === 'admin',
};

/**
 * Whether the caller may act on a project at all.
 *
 * A workspace owner/admin does not need to be a project member — that is Policy
 * A, and forgetting it hides the whole project from the people who administer it.
 * `projectRole` is `null` when the caller is not a member.
 */
export const canActOnProject = (
  workspaceRole: WorkspaceRole | null,
  projectRole: ProjectRole | null
): boolean => {
  if (workspaceRole === 'owner' || workspaceRole === 'admin') return true;
  return projectRole !== null;
};

/**
 * Whether the caller may edit a specific comment.
 *
 * Author-only. No role overrides this — not a project owner, not a workspace
 * owner. Deletion is different: it also honours `comment:moderate`, so this
 * function must not be reused for the delete affordance.
 */
export const canEditComment = (currentUserId: string | null, authorId: string | null): boolean =>
  Boolean(currentUserId) && currentUserId === authorId;

/** Whether the caller may delete a comment: the author, or anyone who can moderate. */
export const canDeleteComment = (
  currentUserId: string | null,
  authorId: string | null,
  projectRole: ProjectRole | null,
  workspaceRole: WorkspaceRole | null
): boolean => {
  if (canEditComment(currentUserId, authorId)) return true;
  if (workspaceRole === 'owner' || workspaceRole === 'admin') return true;
  return projectRole !== null && projectCan.moderate(projectRole);
};
