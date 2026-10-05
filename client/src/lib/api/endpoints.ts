/*
 * Typed endpoint functions, one per operation in the API.
 *
 * Every path is written out in full, including the ancestor chain. The API has
 * no "current workspace" concept and requires the whole chain in the path — a
 * comment needs `workspaceId/projectId/taskId/commentId`, and a mismatch is a
 * 404 rather than a helpful error. Building paths from parts is the only way to
 * keep that honest.
 *
 * Return types name the key the payload sits under, because the API nests single
 * resources one level deeper than lists: `data.task`, `data.projects`.
 */

import { request, uploadWithProgress } from './client';
import type { ProjectRole, WorkspaceRole } from '@/components/ui';
import type {
  Attachment,
  Comment,
  Invitation,
  Label,
  Notification,
  PagedList,
  Project,
  ProjectActivity,
  ProjectDashboard,
  Subtask,
  Task,
  User,
  UserSettings,
  Workspace,
  WorkspaceDashboard,
} from './types';

/* ------------------------------------------------------------------- paths */

const ws = (workspaceId: string) => `/workspaces/${workspaceId}`;
const project = (workspaceId: string, projectId: string) =>
  `${ws(workspaceId)}/projects/${projectId}`;
const task = (workspaceId: string, projectId: string, taskId: string) =>
  `${project(workspaceId, projectId)}/tasks/${taskId}`;
const comment = (workspaceId: string, projectId: string, taskId: string, commentId: string) =>
  `${task(workspaceId, projectId, taskId)}/comments/${commentId}`;

/* -------------------------------------------------------------------- auth */

export const authApi = {
  register: (body: { name: string; email: string; password: string }) =>
    request<{ user: User }>('/auth/register', { method: 'POST', body }),

  login: (body: { email: string; password: string }) =>
    request<{ user: User }>('/auth/login', { method: 'POST', body }),

  logout: () => request<unknown>('/auth/logout', { method: 'POST' }),
};

/* ------------------------------------------------------------------- users */

export const usersApi = {
  /** The session probe. A 401 here means logged out — there is no `/me`. */
  profile: () => request<{ user: User }>('/users/profile'),

  updateProfile: (body: { name?: string }) =>
    request<{ user: User }>('/users/profile', { method: 'PATCH', body }),

  changePassword: (body: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  }) => request<unknown>('/users/change-password', { method: 'PATCH', body }),

  uploadAvatar: (file: File) => {
    const formData = new FormData();
    formData.append('avatar', file);
    return request<{ user: User }>('/users/avatar', { method: 'PATCH', formData });
  },

  getSettings: () => request<{ settings: UserSettings }>('/users/settings'),

  updateSettings: (body: { emailNotifications?: boolean; marketingEmails?: boolean }) =>
    request<{ settings: UserSettings }>('/users/settings', { method: 'PATCH', body }),

  deleteAccount: () => request<unknown>('/users/account', { method: 'DELETE' }),
};

/* -------------------------------------------------------------- workspaces */

export const workspacesApi = {
  list: (query?: Record<string, unknown>) =>
    request<PagedList<Workspace, 'workspaces'>>('/workspaces', { query }),

  create: (body: { name: string; description?: string }) =>
    request<{ workspace: Workspace }>('/workspaces', { method: 'POST', body }),

  get: (workspaceId: string) =>
    request<{ workspace: Workspace }>(ws(workspaceId)),

  update: (workspaceId: string, body: { name?: string; description?: string }) =>
    request<{ workspace: Workspace }>(ws(workspaceId), { method: 'PATCH', body }),

  /** Owner only. */
  archive: (workspaceId: string) =>
    request<{ workspace: Workspace }>(`${ws(workspaceId)}/archive`, { method: 'PATCH' }),

  /** Owner only, and the workspace must already be archived. */
  restore: (workspaceId: string) =>
    request<{ workspace: Workspace }>(`${ws(workspaceId)}/restore`, { method: 'PATCH' }),

  /** Owner only. */
  remove: (workspaceId: string) =>
    request<unknown>(ws(workspaceId), { method: 'DELETE' }),

  members: (workspaceId: string) =>
    request<{ members: Workspace['members'] }>(`${ws(workspaceId)}/members`),

  invite: (workspaceId: string, body: { email: string; role?: 'admin' | 'member' }) =>
    request<{ invitation: Invitation }>(`${ws(workspaceId)}/invitations`, {
      method: 'POST',
      body,
    }),

  /** The invitee accepts with the token from the invitation response. */
  acceptInvitation: (token: string) =>
    request<{ workspace: Workspace }>(`/invitations/${token}/accept`, { method: 'PATCH' }),

  removeMember: (workspaceId: string, userId: string) =>
    request<unknown>(`${ws(workspaceId)}/members/${userId}`, { method: 'DELETE' }),

  /** Owner only. */
  changeMemberRole: (workspaceId: string, userId: string, role: WorkspaceRole) =>
    request<unknown>(`${ws(workspaceId)}/members/${userId}/role`, {
      method: 'PATCH',
      body: { role },
    }),

  /** Owner only. */
  transferOwnership: (workspaceId: string, userId: string) =>
    request<{ workspace: Workspace }>(`${ws(workspaceId)}/transfer-ownership`, {
      method: 'PATCH',
      body: { userId },
    }),
};

/* ---------------------------------------------------------------- projects */

export const projectsApi = {
  list: (workspaceId: string, query?: Record<string, unknown>) =>
    request<PagedList<Project, 'projects'>>(`${ws(workspaceId)}/projects`, { query }),

  create: (
    workspaceId: string,
    body: { name: string; description?: string; deadline?: string; color?: string }
  ) => request<{ project: Project }>(`${ws(workspaceId)}/projects`, { method: 'POST', body }),

  get: (workspaceId: string, projectId: string) =>
    request<{ project: Project }>(project(workspaceId, projectId)),

  /**
   * Partial update. `deadline` and `color` accept `null` to clear the field —
   * the validator is `.nullable()`, and omitting a key means "leave it alone",
   * so `null` is the only way to remove one.
   */
  update: (
    workspaceId: string,
    projectId: string,
    body: {
      name?: string;
      description?: string;
      deadline?: string | null;
      color?: string | null;
    }
  ) => request<{ project: Project }>(project(workspaceId, projectId), { method: 'PATCH', body }),

  setStatus: (workspaceId: string, projectId: string, status: Project['status']) =>
    request<{ project: Project }>(`${project(workspaceId, projectId)}/status`, {
      method: 'PATCH',
      body: { status },
    }),

  archive: (workspaceId: string, projectId: string) =>
    request<{ project: Project }>(`${project(workspaceId, projectId)}/archive`, {
      method: 'PATCH',
    }),

  restore: (workspaceId: string, projectId: string) =>
    request<{ project: Project }>(`${project(workspaceId, projectId)}/restore`, {
      method: 'PATCH',
    }),

  addMember: (workspaceId: string, projectId: string, userId: string) =>
    request<{ project: Project }>(`${project(workspaceId, projectId)}/members`, {
      method: 'POST',
      body: { userId },
    }),

  removeMember: (workspaceId: string, projectId: string, userId: string) =>
    request<{ project: Project }>(`${project(workspaceId, projectId)}/members/${userId}`, {
      method: 'DELETE',
    }),

  changeMemberRole: (
    workspaceId: string,
    projectId: string,
    userId: string,
    role: ProjectRole
  ) =>
    request<{ project: Project }>(`${project(workspaceId, projectId)}/members/${userId}/role`, {
      method: 'PATCH',
      body: { role },
    }),

  dashboard: (workspaceId: string, projectId: string, upcomingDueDays?: number) =>
    request<ProjectDashboard>(`${project(workspaceId, projectId)}/dashboard`, {
      query: { upcomingDueDays },
    }),
};

/* ------------------------------------------------------------------- tasks */

export const tasksApi = {
  list: (workspaceId: string, projectId: string, query?: Record<string, unknown>) =>
    request<PagedList<Task, 'tasks'>>(`${project(workspaceId, projectId)}/tasks`, { query }),

  create: (
    workspaceId: string,
    projectId: string,
    body: {
      title: string;
      description?: string;
      assignee?: string;
      startDate?: string;
      dueDate?: string;
      estimatedTime?: number;
      priority?: Task['priority'];
    }
  ) => request<{ task: Task }>(`${project(workspaceId, projectId)}/tasks`, { method: 'POST', body }),

  get: (workspaceId: string, projectId: string, taskId: string) =>
    request<{ task: Task }>(task(workspaceId, projectId, taskId)),

  update: (
    workspaceId: string,
    projectId: string,
    taskId: string,
    body: {
      title?: string;
      description?: string;
      startDate?: string | null;
      dueDate?: string | null;
      estimatedTime?: number;
    }
  ) => request<{ task: Task }>(task(workspaceId, projectId, taskId), { method: 'PATCH', body }),

  setStatus: (workspaceId: string, projectId: string, taskId: string, status: Task['status']) =>
    request<{ task: Task }>(`${task(workspaceId, projectId, taskId)}/status`, {
      method: 'PATCH',
      body: { status },
    }),

  setPriority: (
    workspaceId: string,
    projectId: string,
    taskId: string,
    priority: Task['priority']
  ) =>
    request<{ task: Task }>(`${task(workspaceId, projectId, taskId)}/priority`, {
      method: 'PATCH',
      body: { priority },
    }),

  /** `assignee: null` unassigns. A non-member assignee is a 400. */
  setAssignee: (
    workspaceId: string,
    projectId: string,
    taskId: string,
    assignee: string | null
  ) =>
    request<{ task: Task }>(`${task(workspaceId, projectId, taskId)}/assignee`, {
      method: 'PATCH',
      body: { assignee },
    }),

  setDueDate: (workspaceId: string, projectId: string, taskId: string, dueDate: string | null) =>
    request<{ task: Task }>(`${task(workspaceId, projectId, taskId)}/due-date`, {
      method: 'PATCH',
      body: { dueDate },
    }),

  setStartDate: (workspaceId: string, projectId: string, taskId: string, startDate: string | null) =>
    request<{ task: Task }>(`${task(workspaceId, projectId, taskId)}/start-date`, {
      method: 'PATCH',
      body: { startDate },
    }),

  archive: (workspaceId: string, projectId: string, taskId: string) =>
    request<{ task: Task }>(`${task(workspaceId, projectId, taskId)}/archive`, {
      method: 'PATCH',
    }),

  restore: (workspaceId: string, projectId: string, taskId: string) =>
    request<{ task: Task }>(`${task(workspaceId, projectId, taskId)}/restore`, {
      method: 'PATCH',
    }),

  /* Subtasks are embedded in the task, but the endpoints still exist. */

  subtasks: (workspaceId: string, projectId: string, taskId: string) =>
    request<{ subtasks: Subtask[] }>(`${task(workspaceId, projectId, taskId)}/subtasks`),

  /**
   * CONTRACT QUIRK: this returns the **parent task** under `data.subtask`, not
   * the new subtask. Read the new id from the list response, not from here.
   */
  createSubtask: (workspaceId: string, projectId: string, taskId: string, title: string) =>
    request<{ subtask: Task }>(`${task(workspaceId, projectId, taskId)}/subtasks`, {
      method: 'POST',
      body: { title },
    }),

  updateSubtask: (
    workspaceId: string,
    projectId: string,
    taskId: string,
    subtaskId: string,
    body: { title?: string; isCompleted?: boolean }
  ) =>
    request<{ subtask: Subtask }>(
      `${task(workspaceId, projectId, taskId)}/subtasks/${subtaskId}`,
      { method: 'PATCH', body }
    ),

  deleteSubtask: (
    workspaceId: string,
    projectId: string,
    taskId: string,
    subtaskId: string
  ) =>
    request<unknown>(`${task(workspaceId, projectId, taskId)}/subtasks/${subtaskId}`, {
      method: 'DELETE',
    }),

  /** Attaches an existing project label to a task. */
  assignLabel: (workspaceId: string, projectId: string, taskId: string, labelId: string) =>
    request<{ task: Task }>(`${task(workspaceId, projectId, taskId)}/labels`, {
      method: 'POST',
      body: { labelId },
    }),

  removeLabel: (workspaceId: string, projectId: string, taskId: string, labelId: string) =>
    request<{ task: Task }>(`${task(workspaceId, projectId, taskId)}/labels/${labelId}`, {
      method: 'DELETE',
    }),

  activity: (workspaceId: string, projectId: string, taskId: string, query?: Record<string, unknown>) =>
    request<PagedList<ProjectActivity, 'activities'>>(
      `${task(workspaceId, projectId, taskId)}/activities`,
      { query }
    ),
};

/* ---------------------------------------------------------------- comments */

export const commentsApi = {
  list: (
    workspaceId: string,
    projectId: string,
    taskId: string,
    query?: Record<string, unknown>
  ) =>
    request<PagedList<Comment, 'comments'>>(`${task(workspaceId, projectId, taskId)}/comments`, {
      query,
    }),

  get: (workspaceId: string, projectId: string, taskId: string, commentId: string) =>
    request<{ comment: Comment }>(comment(workspaceId, projectId, taskId, commentId)),

  create: (workspaceId: string, projectId: string, taskId: string, content: string) =>
    request<{ comment: Comment }>(`${task(workspaceId, projectId, taskId)}/comments`, {
      method: 'POST',
      body: { content },
    }),

  /** Author only — no role overrides this, not even a workspace owner. */
  update: (
    workspaceId: string,
    projectId: string,
    taskId: string,
    commentId: string,
    content: string
  ) =>
    request<{ comment: Comment }>(comment(workspaceId, projectId, taskId, commentId), {
      method: 'PATCH',
      body: { content },
    }),

  /** Author, or anyone holding `comment:moderate`. */
  remove: (workspaceId: string, projectId: string, taskId: string, commentId: string) =>
    request<unknown>(comment(workspaceId, projectId, taskId, commentId), { method: 'DELETE' }),
};

/* ------------------------------------------------------------------ labels */

export const labelsApi = {
  /**
   * SPEC GAP: `openapi.json` claims `data = { labels }`, but the service also
   * returns `pagination` and accepts `page`/`limit`. Typed for reality.
   */
  list: (workspaceId: string, projectId: string, query?: Record<string, unknown>) =>
    request<PagedList<Label, 'labels'>>(`${project(workspaceId, projectId)}/labels`, { query }),

  get: (workspaceId: string, projectId: string, labelId: string) =>
    request<{ label: Label }>(`${project(workspaceId, projectId)}/labels/${labelId}`),

  create: (workspaceId: string, projectId: string, body: { name: string; color: string }) =>
    request<{ label: Label }>(`${project(workspaceId, projectId)}/labels`, {
      method: 'POST',
      body,
    }),

  /** Names are unique within a project — a duplicate is a 409. */
  update: (
    workspaceId: string,
    projectId: string,
    labelId: string,
    body: { name?: string; color?: string }
  ) =>
    request<{ label: Label }>(`${project(workspaceId, projectId)}/labels/${labelId}`, {
      method: 'PATCH',
      body,
    }),

  remove: (workspaceId: string, projectId: string, labelId: string) =>
    request<unknown>(`${project(workspaceId, projectId)}/labels/${labelId}`, {
      method: 'DELETE',
    }),
};

/* ----------------------------------------------------------- notifications */

export const notificationsApi = {
  list: (query?: Record<string, unknown>) =>
    request<PagedList<Notification, 'notifications'>>('/notifications', { query }),

  unread: (query?: Record<string, unknown>) =>
    request<PagedList<Notification, 'notifications'>>('/notifications/unread', { query }),

  /** The badge source. There is no websocket, so this is polled. */
  unreadCount: () => request<{ count: number }>('/notifications/unread/count'),

  markRead: (notificationId: string) =>
    request<{ notification: Notification }>(`/notifications/${notificationId}/read`, {
      method: 'PATCH',
    }),

  markAllRead: () => request<unknown>('/notifications/read-all', { method: 'PATCH' }),

  remove: (notificationId: string) =>
    request<unknown>(`/notifications/${notificationId}`, { method: 'DELETE' }),
};

/* -------------------------------------------------------------- attachments */

export const attachmentsApi = {
  listForProject: (workspaceId: string, projectId: string, query?: Record<string, unknown>) =>
    request<PagedList<Attachment, 'attachments'>>(
      `${project(workspaceId, projectId)}/attachments`,
      { query }
    ),

  /** `onProgress` receives 0–100. Uploads go through XHR — `fetch` cannot report progress. */
  uploadToProject: (
    workspaceId: string,
    projectId: string,
    file: File,
    onProgress?: (percent: number) => void
  ) => {
    const formData = new FormData();
    formData.append('file', file);
    return uploadWithProgress<{ attachment: Attachment }>(
      `${project(workspaceId, projectId)}/attachments`,
      formData,
      onProgress
    );
  },

  listForTask: (
    workspaceId: string,
    projectId: string,
    taskId: string,
    query?: Record<string, unknown>
  ) =>
    request<PagedList<Attachment, 'attachments'>>(
      `${task(workspaceId, projectId, taskId)}/attachments`,
      { query }
    ),

  uploadToTask: (
    workspaceId: string,
    projectId: string,
    taskId: string,
    file: File,
    onProgress?: (percent: number) => void
  ) => {
    const formData = new FormData();
    formData.append('file', file);
    return uploadWithProgress<{ attachment: Attachment }>(
      `${task(workspaceId, projectId, taskId)}/attachments`,
      formData,
      onProgress
    );
  },

  listForComment: (
    workspaceId: string,
    projectId: string,
    taskId: string,
    commentId: string,
    query?: Record<string, unknown>
  ) =>
    request<PagedList<Attachment, 'attachments'>>(
      `${comment(workspaceId, projectId, taskId, commentId)}/attachments`,
      { query }
    ),

  uploadToComment: (
    workspaceId: string,
    projectId: string,
    taskId: string,
    commentId: string,
    file: File,
    onProgress?: (percent: number) => void
  ) => {
    const formData = new FormData();
    formData.append('file', file);
    return uploadWithProgress<{ attachment: Attachment }>(
      `${comment(workspaceId, projectId, taskId, commentId)}/attachments`,
      formData,
      onProgress
    );
  },

  /** The path for `downloadBlob` — authenticated, never a public URL. */
  downloadPath: (workspaceId: string, projectId: string, attachmentId: string) =>
    `${project(workspaceId, projectId)}/attachments/${attachmentId}/download`,

  remove: (workspaceId: string, projectId: string, attachmentId: string) =>
    request<unknown>(`${project(workspaceId, projectId)}/attachments/${attachmentId}`, {
      method: 'DELETE',
    }),
};

/* --------------------------------------------------------------- dashboard */

export const dashboardApi = {
  workspace: (workspaceId: string) =>
    request<WorkspaceDashboard>(`${ws(workspaceId)}/dashboard`),

  project: (workspaceId: string, projectId: string, upcomingDueDays?: number) =>
    request<ProjectDashboard>(`${project(workspaceId, projectId)}/dashboard`, {
      query: { upcomingDueDays },
    }),
};

/* ---------------------------------------------------------------- activity */

export const activityApi = {
  forProject: (workspaceId: string, projectId: string, query?: Record<string, unknown>) =>
    request<PagedList<ProjectActivity, 'activities'>>(
      `${project(workspaceId, projectId)}/activities`,
      { query }
    ),
};

/* ------------------------------------------------------------------- health */

export const healthApi = {
  /** Liveness. Never touches the database. */
  live: () => request<unknown>('/health'),

  /** Readiness. Returns 503 when the database is unreachable. */
  ready: () => request<unknown>('/health/ready'),
};
