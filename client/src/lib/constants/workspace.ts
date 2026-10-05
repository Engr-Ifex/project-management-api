import type { WorkspaceRole } from '@/components/ui';

/*
 * Workspace option lists.
 *
 * The role distinction here is not cosmetic. A workspace role can be `owner`,
 * but **ownership is transferred, never invited** — so the invitation form offers
 * only `admin` and `member`. Exporting one list for both would let the invite
 * form offer a role the API rejects, and a UI that offers an impossible choice
 * is worse than one that offers fewer.
 */

export const WORKSPACE_ROLE_OPTIONS: { value: WorkspaceRole; label: string }[] = [
  { value: 'owner', label: 'Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
];

/** For invitations and role changes: `owner` is excluded on purpose. */
export const ASSIGNABLE_WORKSPACE_ROLE_OPTIONS: { value: 'admin' | 'member'; label: string }[] = [
  { value: 'member', label: 'Member' },
  { value: 'admin', label: 'Admin' },
];

/**
 * The archived filter on the workspace list.
 *
 * An archived workspace is invisible to every other read — `GET /workspaces/:id`
 * answers 404 once it is archived — so this list is the only place it can be
 * found, and therefore the only place it can be restored from.
 */
export const WORKSPACE_ARCHIVE_FILTER_OPTIONS = [
  { value: 'false', label: 'Active workspaces' },
  { value: 'true', label: 'Archived only' },
];

/**
 * The notification scope toggle.
 *
 * Typed as a union rather than `string` on purpose: `SegmentedControl` is
 * generic over its option values, so a `string[]` here would widen the control
 * and force a cast at every call site.
 */
export type NotificationScope = 'all' | 'unread';

export const NOTIFICATION_SCOPE_OPTIONS: { value: NotificationScope; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
];
