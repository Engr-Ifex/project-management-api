import type { Notification } from '@/lib/api';

/*
 * Notification presentation, shared by the page and the bell dropdown.
 *
 * Both surfaces render the same records, so the grouping rule and the "where
 * does this point" rule live here rather than being written twice and drifting.
 */

/**
 * Where a notification points, or `undefined` when there is nowhere to go.
 *
 * A notification may reference a task, a project, or neither (an invitation has
 * no project yet). Linking to a task requires **both** ids — a task link built
 * from a missing project id is a dead route, and a dead link is worse than plain
 * text.
 */
export const notificationHref = (
  workspaceId: string,
  notification: Notification
): string | undefined => {
  if (notification.task && notification.project) {
    return `/workspaces/${workspaceId}/projects/${notification.project}/tasks/${notification.task}`;
  }

  if (notification.project) {
    return `/workspaces/${workspaceId}/projects/${notification.project}`;
  }

  return undefined;
};

export interface NotificationGroup<T> {
  /** Stable key for React — the day, in `yyyy-mm-dd`. */
  key: string;
  label: string;
  items: T[];
}

/** Midnight local time, so "today" matches the reader's calendar, not UTC. */
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const dayLabel = (date: Date, now: Date): string => {
  const days = Math.round((startOfDay(now).getTime() - startOfDay(date).getTime()) / 86_400_000);

  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';

  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
};

/**
 * Group by calendar day, newest first.
 *
 * Preserves the order it is given within each day, so the caller's sort (the API
 * returns `createdAt` descending) is what decides the sequence — this only
 * buckets, it does not re-sort.
 *
 * Generic over anything carrying a `createdAt`, because the activity feed groups
 * the same way and a second copy of this would drift.
 */
export const groupByDay = <T extends { createdAt: string }>(
  items: T[],
  now: Date = new Date()
): NotificationGroup<T>[] => {
  const groups = new Map<string, NotificationGroup<T>>();

  for (const item of items) {
    const created = new Date(item.createdAt);

    if (Number.isNaN(created.getTime())) continue;

    const key = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}-${String(
      created.getDate()
    ).padStart(2, '0')}`;

    const existing = groups.get(key);

    if (existing) {
      existing.items.push(item);
    } else {
      groups.set(key, { key, label: dayLabel(created, now), items: [item] });
    }
  }

  return [...groups.values()];
};
