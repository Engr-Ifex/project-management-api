import { WORKSPACE_ROLES } from './workspaceRoles.js';
import { WORKSPACE_PERMISSIONS } from './workspacePermissions.js';

export const ROLE_HIERARCHY = Object.freeze({
  [WORKSPACE_ROLES.OWNER]: 3,
  [WORKSPACE_ROLES.ADMIN]: 2,
  [WORKSPACE_ROLES.MEMBER]: 1,
});

export const ROLE_PERMISSIONS = Object.freeze({
  [WORKSPACE_ROLES.OWNER]: [
    WORKSPACE_PERMISSIONS.VIEW_WORKSPACE,
    WORKSPACE_PERMISSIONS.UPDATE_WORKSPACE,

    WORKSPACE_PERMISSIONS.VIEW_MEMBERS,
    WORKSPACE_PERMISSIONS.INVITE_MEMBERS,
    WORKSPACE_PERMISSIONS.REMOVE_MEMBERS,
    WORKSPACE_PERMISSIONS.CHANGE_ROLES,

    WORKSPACE_PERMISSIONS.ARCHIVE_WORKSPACE,
    WORKSPACE_PERMISSIONS.RESTORE_WORKSPACE,
    WORKSPACE_PERMISSIONS.DELETE_WORKSPACE,

    WORKSPACE_PERMISSIONS.TRANSFER_OWNERSHIP,
  ],

  [WORKSPACE_ROLES.ADMIN]: [
    WORKSPACE_PERMISSIONS.VIEW_WORKSPACE,
    WORKSPACE_PERMISSIONS.UPDATE_WORKSPACE,

    WORKSPACE_PERMISSIONS.VIEW_MEMBERS,
    WORKSPACE_PERMISSIONS.INVITE_MEMBERS,
    WORKSPACE_PERMISSIONS.REMOVE_MEMBERS,

    /*
     * Archive, restore, delete and transfer-ownership are deliberately absent.
     *
     * They are enforced by `requireWorkspaceRole(WORKSPACE_ROLES.OWNER)` on the
     * routes, which is stricter than this table. An admin previously held
     * `ARCHIVE_WORKSPACE` and `RESTORE_WORKSPACE` here — a grant no route
     * consults, so the table advertised a capability the API refuses. A table
     * that disagrees with the guards is worse than no table: it is read as the
     * authorization answer and is wrong.
     *
     * `ROLE_PERMISSIONS` now lists exactly what a role can actually do. If a
     * capability is added to a route, add the grant here in the same change.
     */
  ],

  [WORKSPACE_ROLES.MEMBER]: [
    WORKSPACE_PERMISSIONS.VIEW_WORKSPACE,
    WORKSPACE_PERMISSIONS.VIEW_MEMBERS,
  ],
});

export const hasPermission = (role, permission) => {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
};

export const hasHigherRole = (requesterRole, targetRole) => {
  return ROLE_HIERARCHY[requesterRole] > ROLE_HIERARCHY[targetRole];
};

export const hasEqualOrHigherRole = (requesterRole, targetRole) => {
  return ROLE_HIERARCHY[requesterRole] >= ROLE_HIERARCHY[targetRole];
};

export const isValidWorkspaceRole = (role) => {
  return Object.values(WORKSPACE_ROLES).includes(role);
};

/**
 * Does a workspace role carry project-level override authority?
 *
 * This is the single definition of "workspace elevated" for project purposes,
 * and the one place the policy is expressed.
 *
 * It was previously written out three times — in `requireProjectPermission`,
 * and again in the task-comment and attachment controllers — which is how the
 * middleware and the task service drifted into disagreeing about whether a
 * workspace admin may act on a project they are not a member of.
 *
 * The capability is deliberately borrowed from `UPDATE_WORKSPACE` rather than
 * declared as a separate constant: only workspace OWNER and ADMIN hold it, and
 * reusing it keeps the two role tables from drifting apart.
 */
export const hasProjectOverride = (workspaceRole) => {
  return hasPermission(workspaceRole, WORKSPACE_PERMISSIONS.UPDATE_WORKSPACE);
};
