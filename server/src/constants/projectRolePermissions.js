import PROJECT_ROLES from './projectRoles.js';
import PROJECT_PERMISSIONS from './projectPermission.js';

/*
 * What a project role can actually do.
 *
 * This table is the enforcement contract, not a wish list: every entry here is
 * consulted by `requireProjectPermission` (or by the comment/attachment
 * services for the `*:moderate` capabilities). Anything a route does not check
 * is deliberately absent, because a permission table that disagrees with the
 * guards is read as the authorization answer and is wrong.
 *
 * Two groups are therefore missing on purpose:
 *
 *   1. Project lifecycle and membership management.
 *      Creating, updating, archiving, restoring and re-status-ing a project,
 *      and adding or removing project members, are **workspace-level**
 *      operations. Those routes require `WORKSPACE_PERMISSIONS.UPDATE_WORKSPACE`
 *      (workspace owner/admin) rather than a project role — see
 *      `src/routes/project.routes.js`. Project roles govern the work *inside* a
 *      project, not the project's existence or its membership.
 *
 *      Changing a member's *role* is the exception: `PATCH
 *      …/members/:userId/role` is gated by `project:change_role`, which is why
 *      that permission is present below.
 *
 *   2. `task:delete`. No delete endpoint is exposed — tasks are archived and
 *      restored — so the capability does not exist to grant.
 *
 * `PROJECT_PERMISSIONS` still defines the names for group 1; they are the
 * vocabulary for a capability that is enforced at the workspace layer.
 */
export const PROJECT_ROLE_PERMISSIONS = Object.freeze({
  [PROJECT_ROLES.OWNER]: [
    // Project
    PROJECT_PERMISSIONS.VIEW_PROJECT,

    // Tasks
    PROJECT_PERMISSIONS.CREATE_TASK,
    PROJECT_PERMISSIONS.UPDATE_TASK,
    PROJECT_PERMISSIONS.ARCHIVE_TASK,
    PROJECT_PERMISSIONS.RESTORE_TASK,
    PROJECT_PERMISSIONS.ASSIGN_TASK,

    // Subtasks
    PROJECT_PERMISSIONS.CREATE_SUBTASK,
    PROJECT_PERMISSIONS.UPDATE_SUBTASK,
    PROJECT_PERMISSIONS.DELETE_SUBTASK,

    // Members
    PROJECT_PERMISSIONS.CHANGE_PROJECT_ROLE,

    // Comments
    PROJECT_PERMISSIONS.CREATE_COMMENT,
    PROJECT_PERMISSIONS.UPDATE_COMMENT,
    PROJECT_PERMISSIONS.DELETE_COMMENT,
    PROJECT_PERMISSIONS.MODERATE_COMMENT,

    // Labels
    PROJECT_PERMISSIONS.CREATE_LABEL,
    PROJECT_PERMISSIONS.UPDATE_LABEL,
    PROJECT_PERMISSIONS.DELETE_LABEL,
    PROJECT_PERMISSIONS.ASSIGN_LABEL,

    // Attachments
    PROJECT_PERMISSIONS.CREATE_ATTACHMENT,
    PROJECT_PERMISSIONS.DELETE_ATTACHMENT,
    PROJECT_PERMISSIONS.MODERATE_ATTACHMENT,
  ],

  [PROJECT_ROLES.ADMIN]: [
    PROJECT_PERMISSIONS.VIEW_PROJECT,

    PROJECT_PERMISSIONS.CREATE_TASK,
    PROJECT_PERMISSIONS.UPDATE_TASK,
    PROJECT_PERMISSIONS.ARCHIVE_TASK,
    PROJECT_PERMISSIONS.RESTORE_TASK,
    PROJECT_PERMISSIONS.ASSIGN_TASK,

    PROJECT_PERMISSIONS.CREATE_SUBTASK,
    PROJECT_PERMISSIONS.UPDATE_SUBTASK,
    PROJECT_PERMISSIONS.DELETE_SUBTASK,

    PROJECT_PERMISSIONS.CHANGE_PROJECT_ROLE,

    PROJECT_PERMISSIONS.CREATE_COMMENT,
    PROJECT_PERMISSIONS.UPDATE_COMMENT,
    PROJECT_PERMISSIONS.DELETE_COMMENT,
    PROJECT_PERMISSIONS.MODERATE_COMMENT,

    PROJECT_PERMISSIONS.CREATE_LABEL,
    PROJECT_PERMISSIONS.UPDATE_LABEL,
    PROJECT_PERMISSIONS.DELETE_LABEL,
    PROJECT_PERMISSIONS.ASSIGN_LABEL,

    // Attachments
    PROJECT_PERMISSIONS.CREATE_ATTACHMENT,
    PROJECT_PERMISSIONS.DELETE_ATTACHMENT,
    PROJECT_PERMISSIONS.MODERATE_ATTACHMENT,
  ],

  [PROJECT_ROLES.MEMBER]: [
    PROJECT_PERMISSIONS.VIEW_PROJECT,

    PROJECT_PERMISSIONS.CREATE_TASK,
    PROJECT_PERMISSIONS.UPDATE_TASK,
    PROJECT_PERMISSIONS.ASSIGN_TASK,

    PROJECT_PERMISSIONS.CREATE_SUBTASK,
    PROJECT_PERMISSIONS.UPDATE_SUBTASK,
    PROJECT_PERMISSIONS.DELETE_SUBTASK,

    PROJECT_PERMISSIONS.CREATE_COMMENT,
    PROJECT_PERMISSIONS.UPDATE_COMMENT,
    PROJECT_PERMISSIONS.DELETE_COMMENT,

    PROJECT_PERMISSIONS.ASSIGN_LABEL,

    // Attachments (members may upload, and delete their own uploads)
    PROJECT_PERMISSIONS.CREATE_ATTACHMENT,
    PROJECT_PERMISSIONS.DELETE_ATTACHMENT,
  ],

  [PROJECT_ROLES.VIEWER]: [PROJECT_PERMISSIONS.VIEW_PROJECT],
});

export const hasProjectPermission = (role, permission) => {
  return PROJECT_ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
};

export default PROJECT_ROLE_PERMISSIONS;
