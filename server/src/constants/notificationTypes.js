/*
 * Notification types.
 *
 * Only events the API can actually raise are listed here. Adding a type
 * without a corresponding emitter would create dead enum values.
 */
export const NOTIFICATION_TYPES = Object.freeze({
  TASK_ASSIGNED: 'task_assigned',
  TASK_REASSIGNED: 'task_reassigned',
  TASK_DUE_SOON: 'task_due_soon',
  TASK_COMMENT_ADDED: 'task_comment_added',
  PROJECT_MEMBER_ADDED: 'project_member_added',
  PROJECT_ROLE_CHANGED: 'project_role_changed',

  /*
   * The existing invitation system is workspace-level (email based),
   * so this is a workspace invitation, not a project invitation.
   */
  WORKSPACE_INVITATION: 'workspace_invitation',
});

export default NOTIFICATION_TYPES;
