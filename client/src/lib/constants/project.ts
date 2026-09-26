import type { ProjectRole, ProjectStatus } from '@/components/ui';

/*
 * Project option lists.
 *
 * Note what is *not* here: a "project role" option list for adding a member. A
 * project's creator is its owner, so `owner` is never assignable through the UI —
 * offering it would imply you can promote someone to owner of a project, which
 * the API does not allow. `ASSIGNABLE_PROJECT_ROLE_OPTIONS` reflects that.
 */

export const PROJECT_STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: 'planning', label: 'Planning' },
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const PROJECT_STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  ...PROJECT_STATUS_OPTIONS,
];

export const PROJECT_ARCHIVE_FILTER_OPTIONS = [
  { value: 'false', label: 'Active projects' },
  { value: 'true', label: 'Archived only' },
];

/** `owner` is deliberately absent — ownership is set at creation, not granted. */
export const ASSIGNABLE_PROJECT_ROLE_OPTIONS: { value: ProjectRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
  { value: 'viewer', label: 'Viewer' },
];
