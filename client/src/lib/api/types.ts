/*
 * Domain types.
 *
 * Read from `client/API-INTEGRATION.md`, which was itself derived from the
 * generated OpenAPI spec — but the spec's *response schemas* are hand-authored
 * and understate reality in two places, so where the document flags a
 * discrepancy, the document wins. Those spots are marked `SPEC GAP` below.
 *
 * The shapes that actually bite:
 *
 * - **`User` and `Workspace` serialize `id`. Everything else serializes `_id`.**
 *   That is not a typo and not a migration in progress; it is the current
 *   contract, and code that assumes one convention breaks on the other.
 * - **`members` is optional on a `Project`.** It is omitted entirely for a
 *   caller who is neither a project member nor a workspace owner/admin. The
 *   field is optional in the type so the compiler enforces the check.
 * - **`subtasks` is embedded; `labels` is a reference.** Subtasks are real
 *   subdocuments stored inside the task (so they are always present and always
 *   objects), while labels are ObjectIds populated to `{_id, name, color}`.
 *   Two different shapes in one document.
 */

import type { ProjectRole, ProjectStatus, TaskPriority, TaskStatus, WorkspaceRole } from '@/components/ui';

export type Id = string;
/** An ISO-8601 timestamp. */
export type IsoDate = string;

/** A field that may arrive as an id or as a populated document. */
export type Ref<T> = Id | T;

/* ------------------------------------------------------------------ envelope */

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

/** The `data` of any paginated list response: a named array plus `pagination`. */
export type PagedList<T, K extends string> = { [P in K]: T[] } & {
  pagination: Pagination;
};

export interface ApiFieldError {
  field?: string;
  message: string;
}

/* --------------------------------------------------------------- query input */

/**
 * Query values the API accepts. Booleans must be sent as the strings `"true"` /
 * `"false"` — `1`/`0` and real booleans are rejected by the validators.
 */
export type QueryValue = string | number | boolean | undefined | null;

export interface ListQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  order?: 'asc' | 'desc';
  search?: string;
}

/** Serialises a query object, dropping empties and stringifying booleans. */
export type Query = Record<string, QueryValue>;

/* --------------------------------------------------------------------- user */

export interface UserSettings {
  emailNotifications: boolean;
  marketingEmails: boolean;
}

export interface User {
  /** `User` serializes `_id` as `id`. */
  id: Id;
  name: string;
  email: string;
  /** Platform role, not a workspace role. */
  role: 'user' | 'admin';
  avatar?: string | null;
  settings?: UserSettings;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

/** The populated subset the API returns for a nested user reference. */
export interface UserRef {
  id: Id;
  name: string;
  email?: string;
  avatar?: string | null;
}

/* ---------------------------------------------------------------- workspace */

export interface WorkspaceMember {
  user: Ref<UserRef>;
  role: WorkspaceRole;
  joinedAt?: IsoDate;
  addedBy?: Ref<UserRef> | null;
}

export interface Workspace {
  /** `Workspace` serializes `_id` as `id`. */
  id: Id;
  name: string;
  description?: string;
  owner: Ref<UserRef>;
  members: WorkspaceMember[];
  settings?: Record<string, unknown>;
  isArchived: boolean;
  archivedAt?: IsoDate | null;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

/**
 * The invitation as the API really returns it.
 *
 * SPEC GAP: `openapi.json` omits `token` from the `Invitation` schema, but the
 * endpoint returns it — a 64-character hex string, and the only way the invitee
 * can accept, because this API sends no email. Typed here by hand; do not
 * "correct" this from the spec.
 */
export interface Invitation {
  _id: Id;
  workspace: Id;
  email: string;
  role: WorkspaceRole;
  invitedBy: Ref<UserRef>;
  token: string;
  status?: string;
  expiresAt?: IsoDate;
  createdAt: IsoDate;
}

/* ------------------------------------------------------------------- project */

export interface ProjectMember {
  user: Ref<UserRef>;
  role: ProjectRole;
  joinedAt?: IsoDate;
  addedBy?: Ref<UserRef> | null;
}

export interface Project {
  _id: Id;
  workspace: Id;
  /** Reduced to an id unless the caller has access to the project. */
  createdBy: Ref<UserRef>;
  name: string;
  description?: string;
  status: ProjectStatus;
  deadline?: IsoDate | null;
  color?: string | null;
  /**
   * Absent — not empty — unless the caller is a project member or a workspace
   * owner/admin. Never read this without a guard.
   */
  members?: ProjectMember[];
  isArchived: boolean;
  archivedAt?: IsoDate | null;
  archivedBy?: Ref<UserRef> | null;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

/* ---------------------------------------------------------------------- task */

export interface Subtask {
  /** Subtasks are embedded subdocuments, so they always carry an `_id`. */
  _id: Id;
  title: string;
  isCompleted: boolean;
  completedAt?: IsoDate | null;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

/** A label as it appears on a task — populated, never a bare id. */
export interface LabelRef {
  _id: Id;
  name: string;
  color: string;
}

export interface Task {
  _id: Id;
  project: Id;
  createdBy: Ref<UserRef>;
  assignee?: Ref<UserRef> | null;
  title: string;
  description?: string;
  /** Embedded, so always present and always objects — never ids. */
  subtasks: Subtask[];
  /** Referenced, and populated on every task response. */
  labels: LabelRef[];
  status: TaskStatus;
  priority: TaskPriority;
  startDate?: IsoDate | null;
  dueDate?: IsoDate | null;
  /** Minutes. */
  estimatedTime?: number | null;
  /** An ordering hint, not a unique key — duplicates are possible. */
  position: number;
  isArchived: boolean;
  archivedAt?: IsoDate | null;
  archivedBy?: Ref<UserRef> | null;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

/* ------------------------------------------------------------------- comment */

export interface Comment {
  _id: Id;
  task: Id;
  project: Id;
  author: Ref<UserRef>;
  content: string;
  editedAt?: IsoDate | null;
  isDeleted: boolean;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

/* --------------------------------------------------------------------- label */

export interface Label {
  _id: Id;
  project: Id;
  name: string;
  color: string;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

/* ---------------------------------------------------------------- attachment */

export interface Attachment {
  _id: Id;
  originalFilename: string;
  storedFilename: string;
  mimeType: string;
  size: number;
  uploader: Ref<UserRef>;
  project: Id;
  task?: Id | null;
  comment?: Id | null;
  scope?: string;
  createdAt: IsoDate;
  updatedAt: IsoDate;
}

/* -------------------------------------------------------------- notification */

export type NotificationType =
  | 'task_assigned'
  | 'task_reassigned'
  | 'task_due_soon'
  | 'task_comment_added'
  | 'project_member_added'
  | 'project_role_changed'
  | 'workspace_invitation';

export interface Notification {
  _id: Id;
  recipient: Id;
  actor?: Ref<UserRef> | null;
  type: NotificationType;
  title: string;
  message?: string;
  workspace?: Id | null;
  project?: Id | null;
  task?: Id | null;
  comment?: Id | null;
  isRead: boolean;
  readAt?: IsoDate | null;
  createdAt: IsoDate;
}

/* ------------------------------------------------------------------ activity */

export type ActivityAction =
  | 'task_created'
  | 'subtask_created'
  | 'subtask_updated'
  | 'subtask_deleted'
  | 'label_assigned'
  | 'label_removed'
  | (string & {});

export interface ProjectActivity {
  _id: Id;
  workspace: Id;
  project: Id;
  user: Ref<UserRef>;
  action: ActivityAction;
  metadata?: Record<string, unknown>;
  createdAt: IsoDate;
}

/* ----------------------------------------------------------------- dashboard */

/** Counts, computed server-side. Do not recompute these on the client. */
export interface MyTasks {
  assigned: number;
  completed: number;
  overdue: number;
}

export interface WorkspaceDashboard {
  workspace: Workspace;
  projects: Project[];
  myTasks: MyTasks;
}

export interface ProjectDashboard {
  project: Project;
  tasks: Task[];
  myTasks: MyTasks;
}
