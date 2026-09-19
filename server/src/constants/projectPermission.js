/*
 * Project permission vocabulary.
 *
 * A name defined here is not automatically enforced. `PROJECT_ROLE_PERMISSIONS`
 * is the enforcement contract — it lists what each project role can actually
 * do — and this file is the vocabulary those grants are written in.
 *
 * The entries marked RESERVED below are defined for completeness but are **not
 * granted to any project role**, because the capability is enforced at the
 * workspace layer instead (project lifecycle and membership management require
 * `WORKSPACE_PERMISSIONS.UPDATE_WORKSPACE`) or does not exist in this API
 * (`task:delete` — tasks are archived, never deleted). Do not grant them to a
 * project role without also gating the matching route on it.
 */
export const PROJECT_PERMISSIONS = Object.freeze({
  // Project
  VIEW_PROJECT: 'project:view',

  // RESERVED — enforced by workspace `update_workspace`, not by a project role.
  UPDATE_PROJECT: 'project:update',
  ARCHIVE_PROJECT: 'project:archive',
  RESTORE_PROJECT: 'project:restore',

  // Tasks
  CREATE_TASK: 'task:create',
  UPDATE_TASK: 'task:update',

  // RESERVED — no delete endpoint exists; tasks are archived.
  DELETE_TASK: 'task:delete',

  ARCHIVE_TASK: 'task:archive',
  RESTORE_TASK: 'task:restore',
  ASSIGN_TASK: 'task:assign',

  // Subtasks
  CREATE_SUBTASK: 'subtask:create',
  UPDATE_SUBTASK: 'subtask:update',
  DELETE_SUBTASK: 'subtask:delete',

  // Project members
  // RESERVED — viewing members comes with the project read; adding and removing
  // them is enforced by workspace `update_workspace`.
  VIEW_PROJECT_MEMBERS: 'project:view_members',
  ADD_PROJECT_MEMBER: 'project:add_member',
  REMOVE_PROJECT_MEMBER: 'project:remove_member',

  // Enforced — the only project-level guard on a member operation.
  CHANGE_PROJECT_ROLE: 'project:change_role',

  // Comments
  CREATE_COMMENT: 'comment:create',
  UPDATE_COMMENT: 'comment:update',
  DELETE_COMMENT: 'comment:delete',

  /*
   * Elevated capability: modify (delete) comments authored by
   * other project members. Never granted to MEMBER or VIEWER.
   */
  MODERATE_COMMENT: 'comment:moderate',

  // Labels
  CREATE_LABEL: 'label:create',
  UPDATE_LABEL: 'label:update',
  DELETE_LABEL: 'label:delete',
  ASSIGN_LABEL: 'label:assign',

  // Attachments
  CREATE_ATTACHMENT: 'attachment:create',
  DELETE_ATTACHMENT: 'attachment:delete',

  /*
   * Elevated capability: delete attachments uploaded by other project
   * members. Never granted to MEMBER or VIEWER.
   */
  MODERATE_ATTACHMENT: 'attachment:moderate',
});

export default PROJECT_PERMISSIONS;
