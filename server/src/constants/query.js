/*
 * Query whitelists.
 *
 * Every sortable and searchable field is declared once here and shared by the
 * validators (which reject anything else) and the services (which build the
 * query). Declaring them in one place means a whitelist can never drift away
 * from the query it is meant to constrain, and — critically — no user-supplied
 * string can ever reach MongoDB as a field name or operator.
 */

export const SORT_ORDERS = Object.freeze(['asc', 'desc']);

/*
 * Sorting `_id` is always safe and is used as the tiebreaker that keeps
 * pagination stable. It is not offered as a user-selectable sort field.
 */

export const WORKSPACE_SORT_FIELDS = Object.freeze(['name', 'createdAt', 'updatedAt']);

export const WORKSPACE_SEARCH_FIELDS = Object.freeze(['name', 'description']);

export const WORKSPACE_DEFAULT_SORT = Object.freeze({ createdAt: -1 });

export const PROJECT_SORT_FIELDS = Object.freeze([
  'name',
  'status',
  'deadline',
  'createdAt',
  'updatedAt',
]);

export const PROJECT_SEARCH_FIELDS = Object.freeze(['name', 'description']);

export const PROJECT_DEFAULT_SORT = Object.freeze({ createdAt: -1 });

export const TASK_SORT_FIELDS = Object.freeze([
  'title',
  'status',
  'priority',
  'dueDate',
  'startDate',
  'position',
  'createdAt',
  'updatedAt',
]);

export const TASK_SEARCH_FIELDS = Object.freeze(['title', 'description']);

// Matches the ordering the task list has always used.
/*
 * `_id` is the final tie-break, and it is not decorative.
 *
 * A task's `position` is assigned by reading the current maximum and adding
 * one. Two concurrent creates can read the same maximum and therefore share a
 * position — a benign collision, because `position` is an ordering hint rather
 * than an identifier, and a unique index would turn it into a failed request
 * instead. `createdAt` breaks most of those ties, but two requests can land in
 * the same millisecond.
 *
 * Without a total order, a paginated read can return the same task on two
 * pages, or skip one, purely because the database chose a different order for
 * equal keys. `_id` is unique, so the order is total and pagination is stable.
 */
export const TASK_DEFAULT_SORT = Object.freeze({ position: 1, createdAt: 1, _id: 1 });

export const COMMENT_SORT_FIELDS = Object.freeze(['createdAt', 'updatedAt']);

export const COMMENT_SEARCH_FIELDS = Object.freeze(['content']);

export const COMMENT_DEFAULT_SORT = Object.freeze({ createdAt: 1 });

export const LABEL_SORT_FIELDS = Object.freeze(['name', 'createdAt', 'updatedAt']);

export const LABEL_SEARCH_FIELDS = Object.freeze(['name']);

export const LABEL_DEFAULT_SORT = Object.freeze({ createdAt: 1 });

export const NOTIFICATION_SORT_FIELDS = Object.freeze(['createdAt', 'readAt', 'type']);

export const NOTIFICATION_DEFAULT_SORT = Object.freeze({ createdAt: -1 });

export const ACTIVITY_SORT_FIELDS = Object.freeze(['createdAt', 'action']);

export const ACTIVITY_DEFAULT_SORT = Object.freeze({ createdAt: -1 });

export const ATTACHMENT_SORT_FIELDS = Object.freeze(['originalFilename', 'size', 'createdAt']);

export const ATTACHMENT_DEFAULT_SORT = Object.freeze({ createdAt: -1 });

/*
 * Default direction applied when a caller supplies `sortBy` but omits `order`.
 * Lists ordered by recency read best newest-first; board-ordered lists
 * (tasks by position) read best ascending.
 */
export const DEFAULT_ORDER = 'desc';

export const TASK_DEFAULT_ORDER = 'asc';
