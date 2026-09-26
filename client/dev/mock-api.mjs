/*
 * A throwaway stand-in for the API, used ONLY to render the authenticated
 * screens in a browser.
 *
 * Why this exists: the real backend was not running, so every route behind the
 * login had never been rendered. Starting the real server would mean writing to
 * the production Atlas cluster in `.env`, which is not something to do
 * uninvited. This serves the handful of endpoints those screens read, on the
 * port the Vite proxy already targets (:5000), so the built app behaves as if
 * the backend were up.
 *
 * WHAT THIS PROVES: that each screen mounts, handles the real payload *shape*,
 * and renders without a runtime error.
 * WHAT IT DOES NOT PROVE: that the real API returns these shapes. The payloads
 * below were written from `client/API-INTEGRATION.md` and the server's models —
 * they are a claim about the API, not evidence of it. Treat a clean run here as
 * "the UI is sound given the contract", nothing more.
 *
 * No dependencies: plain node:http.
 */

import { createServer } from 'node:http';

const PORT = 5000;
const MODE = process.env.MOCK_MODE ?? 'default';

/*
 * Empties only the TOP-LEVEL arrays, leaving nested objects intact. That is
 * deliberate: it exercises the list empty states without also emptying
 * `workspace.members`, which would change the caller's role and turn an empty
 * list into a different screen entirely.
 */
const emptyTopLevelArrays = (data) => {
  if (!data || typeof data !== 'object') return data;

  const out = { ...data };
  for (const [key, value] of Object.entries(out)) {
    if (Array.isArray(value)) out[key] = [];
  }

  if (out.pagination) {
    out.pagination = {
      ...out.pagination,
      total: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPrevPage: false,
    };
  }

  return out;
};

/* ------------------------------------------------------------------ fixtures */

const USER = {
  id: '64a1f0000000000000000001',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  role: 'user',
  avatar: null,
  createdAt: '2026-08-01T09:00:00.000Z',
  updatedAt: '2026-09-20T09:00:00.000Z',
};

const USER_REF = { id: USER.id, name: USER.name, email: USER.email, avatar: null };

const COLLEAGUE = {
  id: '64a1f0000000000000000002',
  name: 'Grace Hopper',
  email: 'grace@example.com',
  avatar: null,
};

const WORKSPACE_ID = '64b2a0000000000000000001';
const PROJECT_ID = '64c3b0000000000000000001';
const PROJECT_ID_2 = '64c3b0000000000000000002';
const TASK_ID = '64d4c0000000000000000001';
const TASK_ID_2 = '64d4c0000000000000000002';
const LABEL_ID = '64e5d0000000000000000001';

/*
 * `members[].user` is deliberately a bare id here, because that is what
 * `GET /workspaces/:id` really returns — it is unpopulated. The app derives the
 * caller's role from this array, so a mock that populated it would hide a bug.
 */
const workspace = {
  id: WORKSPACE_ID,
  name: 'Northwind',
  description: 'Platform and infrastructure work.',
  owner: USER.id,
  members: [
    { user: USER.id, role: 'owner', joinedAt: '2026-08-01T09:00:00.000Z' },
    { user: COLLEAGUE.id, role: 'member', joinedAt: '2026-08-04T09:00:00.000Z' },
  ],
  isArchived: false,
  archivedAt: null,
  createdAt: '2026-08-01T09:00:00.000Z',
  updatedAt: '2026-09-20T09:00:00.000Z',
};

const project = {
  _id: PROJECT_ID,
  workspace: WORKSPACE_ID,
  createdBy: USER_REF,
  name: 'Ledger migration',
  description: 'Move the ledger off the legacy store without a customer-visible cutover.',
  status: 'active',
  deadline: '2026-11-30T00:00:00.000Z',
  color: '#348579',
  members: [
    { user: USER_REF, role: 'owner', joinedAt: '2026-08-02T09:00:00.000Z' },
    { user: COLLEAGUE, role: 'member', joinedAt: '2026-08-05T09:00:00.000Z' },
  ],
  isArchived: false,
  archivedAt: null,
  archivedBy: null,
  createdAt: '2026-08-02T09:00:00.000Z',
  updatedAt: '2026-09-24T09:00:00.000Z',
};

const projectTwo = {
  ...project,
  _id: PROJECT_ID_2,
  name: 'Onboarding refresh',
  status: 'planning',
  color: '#c2793f',
  deadline: null,
};

const label = { _id: LABEL_ID, project: PROJECT_ID, name: 'backend', color: '#348579' };
const labelTwo = { _id: '64e5d0000000000000000002', project: PROJECT_ID, name: 'urgent', color: '#c0392b' };

/* `subtasks` is embedded (real subdocuments); `labels` is populated. */
const task = {
  _id: TASK_ID,
  project: PROJECT_ID,
  createdBy: USER_REF,
  assignee: USER_REF,
  title: 'Backfill the 2024 ledger rows',
  description: 'Replay the 2024 journal entries into the new schema and reconcile the totals.',
  subtasks: [
    {
      _id: '64f600000000000000000001',
      title: 'Write the backfill script',
      isCompleted: true,
      completedAt: '2026-09-22T10:00:00.000Z',
      createdAt: '2026-09-20T10:00:00.000Z',
      updatedAt: '2026-09-22T10:00:00.000Z',
    },
    {
      _id: '64f600000000000000000002',
      title: 'Reconcile against the legacy totals',
      isCompleted: false,
      completedAt: null,
      createdAt: '2026-09-20T10:05:00.000Z',
      updatedAt: '2026-09-20T10:05:00.000Z',
    },
  ],
  labels: [label, labelTwo],
  status: 'in_progress',
  priority: 'high',
  startDate: '2026-09-20T00:00:00.000Z',
  dueDate: '2026-10-04T00:00:00.000Z',
  estimatedTime: 240,
  position: 1,
  isArchived: false,
  archivedAt: null,
  archivedBy: null,
  createdAt: '2026-09-20T09:30:00.000Z',
  updatedAt: '2026-09-24T09:30:00.000Z',
};

const taskTwo = {
  ...task,
  _id: TASK_ID_2,
  title: 'Cut over the read path',
  status: 'todo',
  priority: 'urgent',
  assignee: null,
  subtasks: [],
  labels: [label],
  dueDate: null,
  estimatedTime: null,
  position: 2,
};

const comments = [
  {
    _id: '650700000000000000000001',
    task: TASK_ID,
    project: PROJECT_ID,
    author: USER_REF,
    content: 'The replay is idempotent, so a re-run is safe if the job dies partway.',
    editedAt: null,
    isDeleted: false,
    createdAt: '2026-09-22T11:00:00.000Z',
    updatedAt: '2026-09-22T11:00:00.000Z',
  },
  {
    _id: '650700000000000000000002',
    task: TASK_ID,
    project: PROJECT_ID,
    author: COLLEAGUE,
    content: 'Reconciliation numbers look right. I will leave the legacy view up for a week.',
    editedAt: '2026-09-23T09:00:00.000Z',
    isDeleted: false,
    createdAt: '2026-09-23T08:30:00.000Z',
    updatedAt: '2026-09-23T09:00:00.000Z',
  },
];

const activities = [
  {
    _id: '651800000000000000000001',
    workspace: WORKSPACE_ID,
    project: PROJECT_ID,
    user: USER_REF,
    action: 'task_created',
    metadata: { title: task.title },
    createdAt: '2026-09-20T09:30:00.000Z',
  },
  {
    _id: '651800000000000000000002',
    workspace: WORKSPACE_ID,
    project: PROJECT_ID,
    user: COLLEAGUE,
    action: 'label_assigned',
    metadata: { label: 'urgent' },
    createdAt: '2026-09-21T14:10:00.000Z',
  },
  {
    _id: '651800000000000000000003',
    workspace: WORKSPACE_ID,
    project: PROJECT_ID,
    user: USER_REF,
    action: 'subtask_updated',
    metadata: { title: 'Write the backfill script' },
    createdAt: '2026-09-22T10:00:00.000Z',
  },
];

const attachments = [
  {
    _id: '652900000000000000000001',
    originalFilename: 'reconciliation-2024.csv',
    storedFilename: 'a1b2c3.csv',
    mimeType: 'text/csv',
    size: 184320,
    uploader: USER_REF,
    project: PROJECT_ID,
    task: TASK_ID,
    comment: null,
    scope: 'task',
    createdAt: '2026-09-22T12:00:00.000Z',
    updatedAt: '2026-09-22T12:00:00.000Z',
  },
];

const notifications = [
  {
    _id: '653a00000000000000000001',
    recipient: USER.id,
    actor: COLLEAGUE,
    type: 'task_comment_added',
    title: 'Grace Hopper commented on a task',
    message: 'Reconciliation numbers look right.',
    workspace: WORKSPACE_ID,
    project: PROJECT_ID,
    task: TASK_ID,
    comment: '650700000000000000000002',
    isRead: false,
    readAt: null,
    createdAt: '2026-09-23T08:30:00.000Z',
  },
  {
    _id: '653a00000000000000000002',
    recipient: USER.id,
    actor: USER_REF,
    type: 'task_assigned',
    title: 'You were assigned a task',
    message: 'Backfill the 2024 ledger rows',
    workspace: WORKSPACE_ID,
    project: PROJECT_ID,
    task: TASK_ID,
    comment: null,
    isRead: true,
    readAt: '2026-09-21T09:00:00.000Z',
    createdAt: '2026-09-20T09:31:00.000Z',
  },
];

/* ------------------------------------------------------------------- routing */

const pagination = (total, page = 1, limit = 20) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
  hasNextPage: page * limit < total,
  hasPrevPage: page > 1,
});

const routes = [
  ['GET', /^\/api\/v1\/users\/profile$/, () => ({ user: USER })],
  ['GET', /^\/api\/v1\/users\/settings$/, () => ({
    settings: { emailNotifications: true, marketingEmails: false },
  })],
  ['GET', /^\/api\/v1\/notifications\/unread\/count$/, () => ({ count: 1 })],
  ['GET', /^\/api\/v1\/notifications$/, () => ({
    notifications,
    pagination: pagination(notifications.length),
  })],
  ['GET', /^\/api\/v1\/workspaces$/, () => ({
    workspaces: [workspace],
    pagination: pagination(1),
  })],
  ['GET', /^\/api\/v1\/workspaces\/([^/]+)\/members$/, () => ({
    members: [
      { user: USER_REF, role: 'owner', joinedAt: '2026-08-01T09:00:00.000Z' },
      { user: COLLEAGUE, role: 'member', joinedAt: '2026-08-04T09:00:00.000Z' },
    ],
  })],
  ['GET', /^\/api\/v1\/workspaces\/([^/]+)\/dashboard$/, () => ({
    workspace,
    projects: [project, projectTwo],
    myTasks: { assigned: 4, completed: 2, overdue: 1 },
  })],
  ['GET', /^\/api\/v1\/workspaces\/([^/]+)\/projects$/, () => ({
    projects: [project, projectTwo],
    pagination: pagination(2),
  })],
  ['GET', /^\/api\/v1\/workspaces\/([^/]+)\/projects\/([^/]+)\/dashboard$/, () => ({
    project,
    tasks: [task, taskTwo],
    myTasks: { assigned: 2, completed: 1, overdue: 0 },
  })],
  ['GET', /^\/api\/v1\/workspaces\/([^/]+)\/projects\/([^/]+)\/tasks$/, () => ({
    tasks: [task, taskTwo],
    pagination: pagination(2),
  })],
  ['GET', /^\/api\/v1\/workspaces\/([^/]+)\/projects\/([^/]+)\/tasks\/([^/]+)\/comments$/, () => ({
    comments,
    pagination: pagination(comments.length),
  })],
  ['GET', /^\/api\/v1\/workspaces\/([^/]+)\/projects\/([^/]+)\/tasks\/([^/]+)\/subtasks$/, () => ({
    subtasks: task.subtasks,
  })],
  ['GET', /^\/api\/v1\/workspaces\/([^/]+)\/projects\/([^/]+)\/tasks\/([^/]+)\/activities$/, () => ({
    activities,
    pagination: pagination(activities.length),
  })],
  ['GET', /^\/api\/v1\/workspaces\/([^/]+)\/projects\/([^/]+)\/tasks\/([^/]+)\/attachments$/, () => ({
    attachments,
    pagination: pagination(attachments.length),
  })],
  ['GET', /^\/api\/v1\/workspaces\/([^/]+)\/projects\/([^/]+)\/tasks\/([^/]+)$/, () => ({ task })],
  ['GET', /^\/api\/v1\/workspaces\/([^/]+)\/projects\/([^/]+)\/labels$/, () => ({
    labels: [label, labelTwo],
    pagination: pagination(2),
  })],
  ['GET', /^\/api\/v1\/workspaces\/([^/]+)\/projects\/([^/]+)\/activities$/, () => ({
    activities,
    pagination: pagination(activities.length),
  })],
  ['GET', /^\/api\/v1\/workspaces\/([^/]+)\/projects\/([^/]+)\/attachments$/, () => ({
    attachments,
    pagination: pagination(attachments.length),
  })],
  ['GET', /^\/api\/v1\/workspaces\/([^/]+)\/projects\/([^/]+)$/, () => ({ project })],
  ['GET', /^\/api\/v1\/workspaces\/([^/]+)$/, () => ({ workspace })],
];

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const send = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  /*
   * MOCK_MODE lets the same fixture serve the states that are otherwise
   * impossible to see without manipulating a database:
   *
   *   default  normal data
   *   empty    every list comes back empty, so the *empty* states render
   *   error    every endpoint 500s, so the *error* states render
   *
   * The API masks unexpected 5xx to "Internal Server Error", so that is what
   * this returns — a mock that leaked a helpful message would let the UI depend
   * on detail the real API never provides.
   */
  if (MODE === 'error') {
    send(500, { success: false, statusCode: 500, message: 'Internal Server Error' });
    return;
  }

  for (const [method, pattern, handler] of routes) {
    if (req.method === method && pattern.test(url.pathname)) {
      const data = handler(url.pathname.match(pattern).slice(1));
      send(200, {
        success: true,
        statusCode: 200,
        message: 'OK',
        data: MODE === 'empty' ? emptyTopLevelArrays(data) : data,
      });
      return;
    }
  }

  // Anything else is a 404 in the API's own envelope, so the app's error paths
  // are exercised honestly rather than against a generic error page.
  send(404, {
    success: false,
    statusCode: 404,
    message: 'Not found',
  });
});

server.listen(PORT, () => {
  console.log(`mock api on http://localhost:${PORT} (MOCK_MODE=${MODE})`);
});
