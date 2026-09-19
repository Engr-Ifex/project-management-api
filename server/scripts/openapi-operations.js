/*
 * Per-operation metadata for the OpenAPI document.
 *
 * Keyed by `METHOD /full/path`. Every route in `src/routes` must appear here —
 * `scripts/generate-openapi.js` fails loudly if one is missing, so a new
 * endpoint cannot be added without documenting it.
 *
 * Fields:
 *   tag     resource group (also the OpenAPI tag)
 *   summary one-line description
 *   returns resource key returned in `data`, or 'message' for a bare message
 *   body    'auto' (default) takes the request body from the route's Zod
 *           validator; set to null to force "no request body"
 *   status  success status code. Defaults to 201 for POST and 200 for
 *           everything else, which is the convention almost every route
 *           follows. The handful of POSTs that are not "create a resource"
 *           return 200 and declare it here; pass `undefined` for `body` to
 *           reach this field. Getting it wrong publishes a contract that
 *           disagrees with the running API.
 *
 * Everything else — path, method, guards, parameters, request schema, error
 * responses — is derived from the implementation.
 */
export const TAGS = [
  { name: 'System', description: 'Service metadata and health.' },
  { name: 'Authentication', description: 'Registration, login and session handling.' },
  { name: 'Users', description: 'The authenticated user’s own profile and settings.' },
  { name: 'Workspaces', description: 'Workspace lifecycle.' },
  { name: 'Team', description: 'Workspace membership, invitations and roles.' },
  { name: 'Projects', description: 'Projects and their membership.' },
  { name: 'Tasks', description: 'Tasks, their fields, and archiving.' },
  { name: 'Subtasks', description: 'Checklist items inside a task.' },
  { name: 'Comments', description: 'Task comments.' },
  { name: 'Labels', description: 'Project labels and their assignment to tasks.' },
  { name: 'Attachments', description: 'File upload and download.' },
  { name: 'Notifications', description: 'The authenticated user’s notifications.' },
  { name: 'Activity', description: 'The per-project and per-task audit trail.' },
  { name: 'Dashboard', description: 'Aggregated statistics.' },
];

export const OPERATIONS = {
  // ---- System ----
  'GET /api/v1/': ['System', 'API index and version', 'apiIndex'],
  'GET /api/v1/health': ['System', 'Liveness probe (does not touch the database)', 'health'],
  'GET /api/v1/health/ready': [
    'System',
    'Readiness probe (pings the database; 503 when unavailable)',
    'healthReady',
  ],
  'GET /api/v1/openapi.json': ['System', 'This OpenAPI document', 'openapi'],

  // ---- Authentication ----
  'POST /api/v1/auth/register': ['Authentication', 'Register a new account', 'auth'],
  'POST /api/v1/auth/login': [
    'Authentication',
    'Log in and receive a session cookie',
    'auth',
    undefined,
    '200',
  ],
  'POST /api/v1/auth/logout': [
    'Authentication',
    'Log out and clear the session cookie',
    'message',
    null,
    '200',
  ],

  // ---- Users ----
  'GET /api/v1/users/profile': ['Users', 'Get the authenticated user’s profile', 'user'],
  'PATCH /api/v1/users/profile': ['Users', 'Update the authenticated user’s profile', 'user'],
  'PATCH /api/v1/users/avatar': ['Users', 'Upload or replace the avatar', 'user', null],
  'PATCH /api/v1/users/change-password': [
    'Users',
    'Change the password and invalidate existing sessions',
    'message',
  ],
  'GET /api/v1/users/settings': ['Users', 'Get notification settings', 'settings'],
  'PATCH /api/v1/users/settings': ['Users', 'Update notification settings', 'settings'],
  'DELETE /api/v1/users/account': ['Users', 'Soft-delete the account', 'message', null],

  // ---- Workspaces ----
  'POST /api/v1/workspaces': ['Workspaces', 'Create a workspace', 'workspace'],
  'GET /api/v1/workspaces': ['Workspaces', 'List workspaces the caller belongs to', 'workspaces'],
  'GET /api/v1/workspaces/:workspaceId': ['Workspaces', 'Get a workspace', 'workspace'],
  'PATCH /api/v1/workspaces/:workspaceId': ['Workspaces', 'Update a workspace', 'workspace'],
  'PATCH /api/v1/workspaces/:workspaceId/archive': [
    'Workspaces',
    'Archive a workspace',
    'workspace',
  ],
  'PATCH /api/v1/workspaces/:workspaceId/restore': [
    'Workspaces',
    'Restore an archived workspace',
    'workspace',
  ],
  'DELETE /api/v1/workspaces/:workspaceId': ['Workspaces', 'Delete a workspace', 'message', null],

  // ---- Team ----
  'POST /api/v1/workspaces/:workspaceId/invitations': [
    'Team',
    'Invite someone to the workspace',
    'invitation',
  ],
  'PATCH /api/v1/invitations/:token/accept': ['Team', 'Accept an invitation', 'workspace'],
  'GET /api/v1/workspaces/:workspaceId/members': ['Team', 'List workspace members', 'members'],
  'DELETE /api/v1/workspaces/:workspaceId/members/:userId': [
    'Team',
    'Remove a workspace member',
    'message',
  ],
  'PATCH /api/v1/workspaces/:workspaceId/members/:userId/role': [
    'Team',
    'Change a workspace member’s role',
    'member',
  ],
  'PATCH /api/v1/workspaces/:workspaceId/transfer-ownership': [
    'Team',
    'Transfer workspace ownership',
    'workspace',
  ],

  // ---- Projects ----
  'POST /api/v1/workspaces/:workspaceId/projects': ['Projects', 'Create a project', 'project'],
  'GET /api/v1/workspaces/:workspaceId/projects': [
    'Projects',
    'List projects in a workspace',
    'projects',
  ],
  'GET /api/v1/workspaces/:workspaceId/projects/:projectId': [
    'Projects',
    'Get a project',
    'project',
  ],
  'PATCH /api/v1/workspaces/:workspaceId/projects/:projectId': [
    'Projects',
    'Update a project',
    'project',
  ],
  'PATCH /api/v1/workspaces/:workspaceId/projects/:projectId/archive': [
    'Projects',
    'Archive a project',
    'project',
  ],
  'PATCH /api/v1/workspaces/:workspaceId/projects/:projectId/restore': [
    'Projects',
    'Restore an archived project',
    'project',
  ],
  'PATCH /api/v1/workspaces/:workspaceId/projects/:projectId/status': [
    'Projects',
    'Change a project’s status',
    'project',
  ],
  'POST /api/v1/workspaces/:workspaceId/projects/:projectId/members': [
    'Projects',
    'Add a project member',
    'project',
    undefined,
    '200',
  ],
  'DELETE /api/v1/workspaces/:workspaceId/projects/:projectId/members/:userId': [
    'Projects',
    'Remove a project member',
    'project',
  ],
  'PATCH /api/v1/workspaces/:workspaceId/projects/:projectId/members/:userId/role': [
    'Projects',
    'Change a project member’s role',
    'project',
  ],

  // ---- Tasks ----
  'POST /api/v1/workspaces/:workspaceId/projects/:projectId/tasks': [
    'Tasks',
    'Create a task',
    'task',
  ],
  'GET /api/v1/workspaces/:workspaceId/projects/:projectId/tasks': [
    'Tasks',
    'List tasks in a project',
    'tasks',
  ],
  'GET /api/v1/workspaces/:workspaceId/projects/:projectId/tasks/:taskId': [
    'Tasks',
    'Get a task',
    'task',
  ],
  'PATCH /api/v1/workspaces/:workspaceId/projects/:projectId/tasks/:taskId': [
    'Tasks',
    'Update a task',
    'task',
  ],
  'PATCH /api/v1/workspaces/:workspaceId/projects/:projectId/tasks/:taskId/archive': [
    'Tasks',
    'Archive a task',
    'task',
  ],
  'PATCH /api/v1/workspaces/:workspaceId/projects/:projectId/tasks/:taskId/restore': [
    'Tasks',
    'Restore an archived task',
    'task',
  ],
  'PATCH /api/v1/workspaces/:workspaceId/projects/:projectId/tasks/:taskId/status': [
    'Tasks',
    'Change a task’s status',
    'task',
  ],
  'PATCH /api/v1/workspaces/:workspaceId/projects/:projectId/tasks/:taskId/priority': [
    'Tasks',
    'Change a task’s priority',
    'task',
  ],
  'PATCH /api/v1/workspaces/:workspaceId/projects/:projectId/tasks/:taskId/assignee': [
    'Tasks',
    'Assign or unassign a task',
    'task',
  ],
  'PATCH /api/v1/workspaces/:workspaceId/projects/:projectId/tasks/:taskId/due-date': [
    'Tasks',
    'Set or clear the due date',
    'task',
  ],
  'PATCH /api/v1/workspaces/:workspaceId/projects/:projectId/tasks/:taskId/start-date': [
    'Tasks',
    'Set or clear the start date',
    'task',
  ],

  // ---- Subtasks ----
  'POST /api/v1/workspaces/:workspaceId/projects/:projectId/tasks/:taskId/subtasks': [
    'Subtasks',
    'Add a subtask (returns the parent task)',
    'task',
  ],
  'GET /api/v1/workspaces/:workspaceId/projects/:projectId/tasks/:taskId/subtasks': [
    'Subtasks',
    'List a task’s subtasks',
    'subtasks',
  ],
  'PATCH /api/v1/workspaces/:workspaceId/projects/:projectId/tasks/:taskId/subtasks/:subtaskId': [
    'Subtasks',
    'Update a subtask',
    'subtask',
  ],
  'DELETE /api/v1/workspaces/:workspaceId/projects/:projectId/tasks/:taskId/subtasks/:subtaskId': [
    'Subtasks',
    'Delete a subtask',
    'message',
    null,
  ],

  // ---- Comments ----
  'POST /api/v1/workspaces/:workspaceId/projects/:projectId/tasks/:taskId/comments': [
    'Comments',
    'Add a comment',
    'comment',
  ],
  'GET /api/v1/workspaces/:workspaceId/projects/:projectId/tasks/:taskId/comments': [
    'Comments',
    'List a task’s comments',
    'comments',
  ],
  'GET /api/v1/workspaces/:workspaceId/projects/:projectId/tasks/:taskId/comments/:commentId': [
    'Comments',
    'Get a comment',
    'comment',
  ],
  'PATCH /api/v1/workspaces/:workspaceId/projects/:projectId/tasks/:taskId/comments/:commentId': [
    'Comments',
    'Edit a comment (author only)',
    'comment',
  ],
  'DELETE /api/v1/workspaces/:workspaceId/projects/:projectId/tasks/:taskId/comments/:commentId': [
    'Comments',
    'Delete a comment',
    'message',
    null,
  ],

  // ---- Labels ----
  'POST /api/v1/workspaces/:workspaceId/projects/:projectId/labels': [
    'Labels',
    'Create a label',
    'label',
  ],
  'GET /api/v1/workspaces/:workspaceId/projects/:projectId/labels': [
    'Labels',
    'List a project’s labels',
    'labels',
  ],
  'GET /api/v1/workspaces/:workspaceId/projects/:projectId/labels/:labelId': [
    'Labels',
    'Get a label',
    'label',
  ],
  'PATCH /api/v1/workspaces/:workspaceId/projects/:projectId/labels/:labelId': [
    'Labels',
    'Update a label',
    'label',
  ],
  'DELETE /api/v1/workspaces/:workspaceId/projects/:projectId/labels/:labelId': [
    'Labels',
    'Delete a label',
    'message',
    null,
  ],
  'POST /api/v1/workspaces/:workspaceId/projects/:projectId/tasks/:taskId/labels': [
    'Labels',
    'Assign a label to a task',
    'task',
    undefined,
    '200',
  ],
  'DELETE /api/v1/workspaces/:workspaceId/projects/:projectId/tasks/:taskId/labels/:labelId': [
    'Labels',
    'Remove a label from a task',
    'task',
  ],

  // ---- Attachments ----
  'POST /api/v1/workspaces/:workspaceId/projects/:projectId/attachments': [
    'Attachments',
    'Upload a file to a project',
    'attachment',
  ],
  'GET /api/v1/workspaces/:workspaceId/projects/:projectId/attachments': [
    'Attachments',
    'List a project’s attachments',
    'attachments',
  ],
  'POST /api/v1/workspaces/:workspaceId/projects/:projectId/tasks/:taskId/attachments': [
    'Attachments',
    'Upload a file to a task',
    'attachment',
  ],
  'GET /api/v1/workspaces/:workspaceId/projects/:projectId/tasks/:taskId/attachments': [
    'Attachments',
    'List a task’s attachments',
    'attachments',
  ],
  'POST /api/v1/workspaces/:workspaceId/projects/:projectId/tasks/:taskId/comments/:commentId/attachments':
    ['Attachments', 'Upload a file to a comment', 'attachment'],
  'GET /api/v1/workspaces/:workspaceId/projects/:projectId/tasks/:taskId/comments/:commentId/attachments':
    ['Attachments', 'List a comment’s attachments', 'attachments'],
  'GET /api/v1/workspaces/:workspaceId/projects/:projectId/attachments/:attachmentId/download': [
    'Attachments',
    'Download a file',
    'binary',
  ],
  'DELETE /api/v1/workspaces/:workspaceId/projects/:projectId/attachments/:attachmentId': [
    'Attachments',
    'Delete a file',
    'message',
    null,
  ],

  // ---- Notifications ----
  'GET /api/v1/notifications': ['Notifications', 'List notifications', 'notifications'],
  'GET /api/v1/notifications/unread': [
    'Notifications',
    'List unread notifications',
    'notifications',
  ],
  'GET /api/v1/notifications/unread/count': [
    'Notifications',
    'Count unread notifications',
    'count',
  ],
  'PATCH /api/v1/notifications/read-all': [
    'Notifications',
    'Mark every notification as read',
    'count',
    null,
  ],
  'PATCH /api/v1/notifications/:notificationId/read': [
    'Notifications',
    'Mark one notification as read',
    'notification',
    null,
  ],
  'DELETE /api/v1/notifications/:notificationId': [
    'Notifications',
    'Delete a notification',
    'message',
    null,
  ],

  // ---- Activity ----
  'GET /api/v1/workspaces/:workspaceId/projects/:projectId/activities': [
    'Activity',
    'List a project’s activity feed',
    'activities',
  ],
  'GET /api/v1/workspaces/:workspaceId/projects/:projectId/tasks/:taskId/activities': [
    'Activity',
    'List a task’s activity feed',
    'activities',
  ],

  // ---- Dashboard ----
  'GET /api/v1/workspaces/:workspaceId/dashboard': [
    'Dashboard',
    'Workspace statistics',
    'dashboard',
  ],
  'GET /api/v1/workspaces/:workspaceId/projects/:projectId/dashboard': [
    'Dashboard',
    'Project statistics',
    'dashboard',
  ],
};
