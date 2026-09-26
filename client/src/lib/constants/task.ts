import type { TaskPriority, TaskStatus } from '@/components/ui';

/*
 * Task option lists.
 *
 * These were previously declared in three separate files (the project layout,
 * the tasks tab and the task detail), which meant a status added on the server
 * could be wired into one screen and silently missing from the others. They live
 * here so there is exactly one place to change.
 *
 * The `*_FILTER_OPTIONS` variants add an "all" entry, because a filter control
 * has a genuine "no filter" state while a create/edit form does not. Keeping
 * them as separate exports makes it impossible to accidentally offer "All
 * statuses" as a value you can *save* a task as.
 */

export const TASK_STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'in_review', label: 'In review' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const TASK_PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

/** Sentinel used by every filter control for "no value chosen". */
export const FILTER_ALL = 'all';

export const TASK_STATUS_FILTER_OPTIONS = [
  { value: FILTER_ALL, label: 'All statuses' },
  ...TASK_STATUS_OPTIONS,
];

export const TASK_PRIORITY_FILTER_OPTIONS = [
  { value: FILTER_ALL, label: 'Any priority' },
  ...TASK_PRIORITY_OPTIONS,
];

export const TASK_ASSIGNMENT_FILTER_OPTIONS = [
  { value: FILTER_ALL, label: 'Anyone' },
  { value: 'unassigned', label: 'Unassigned' },
];

/** Archived is not a status — it is a separate axis, so it gets its own control. */
export const TASK_ARCHIVE_FILTER_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];
