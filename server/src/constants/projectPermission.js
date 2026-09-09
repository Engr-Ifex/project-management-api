export const PROJECT_PERMISSIONS = Object.freeze({
  // Project
  VIEW_PROJECT: 'project:view',
  UPDATE_PROJECT: 'project:update',
  ARCHIVE_PROJECT: 'project:archive',
  RESTORE_PROJECT: 'project:restore',

  // Tasks
  CREATE_TASK: 'task:create',
  UPDATE_TASK: 'task:update',
  DELETE_TASK: 'task:delete',
  ARCHIVE_TASK: 'task:archive',
  RESTORE_TASK: 'task:restore',
  ASSIGN_TASK: 'task:assign',

  // Subtasks
  CREATE_SUBTASK: 'subtask:create',
  UPDATE_SUBTASK: 'subtask:update',
  DELETE_SUBTASK: 'subtask:delete',

  // Project members
  VIEW_PROJECT_MEMBERS: 'project:view_members',
  ADD_PROJECT_MEMBER: 'project:add_member',
  REMOVE_PROJECT_MEMBER: 'project:remove_member',
  CHANGE_PROJECT_ROLE: 'project:change_role',

  // Comments
  CREATE_COMMENT: 'comment:create',
  UPDATE_COMMENT: 'comment:update',
  DELETE_COMMENT: 'comment:delete',

  // Labels
  CREATE_LABEL: 'label:create',
  UPDATE_LABEL: 'label:update',
  DELETE_LABEL: 'label:delete',
  ASSIGN_LABEL: 'label:assign',
});

export default PROJECT_PERMISSIONS;