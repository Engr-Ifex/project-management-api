import { Bell, Check } from '@phosphor-icons/react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Badge, Button, DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui';
import { notificationsApi } from '@/lib/api';
import { useAsync, useMutation, useUnreadCount } from '@/lib/hooks';
import { groupByDay, notificationHref } from '@/lib/notifications';
import { useWorkspace } from '@/lib/workspace/WorkspaceProvider';

/*
 * How many to show before sending the reader to the full page. A dropdown is a
 * glance, not a list — past roughly this many the panel needs its own scrollbar
 * and stops being faster than the page it links to.
 */
const PREVIEW_LIMIT = 8;

/**
 * The notification bell and its dropdown.
 *
 * The page was previously reachable only through the sidebar, which meant
 * "is there anything new?" cost a navigation. The dropdown answers that in
 * place, and the count it shows is the same polled source the sidebar badge
 * uses — one hook, so the two can never disagree.
 *
 * Marking read refreshes the count immediately rather than waiting for the next
 * poll: a badge that lags behind the click that cleared it reads as broken.
 */
export const NotificationBell = () => {
  const { workspaceId } = useWorkspace();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const { count, refresh: refreshCount } = useUnreadCount();

  // Refetched whenever the panel opens, so the preview is not stale from an
  // earlier glance in the same session.
  const recent = useAsync(
    () =>
      notificationsApi
        .list({ limit: PREVIEW_LIMIT, sortBy: 'createdAt', order: 'desc' })
        .then((data) => data.notifications),
    [open]
  );

  const markRead = useMutation((id: string) => notificationsApi.markRead(id));
  const markAllRead = useMutation(() => notificationsApi.markAllRead());

  const notifications = recent.data ?? [];
  const groups = groupByDay(notifications);

  const onMarkRead = (id: string) => {
    void markRead.run(id).then((outcome) => {
      if (outcome.ok) {
        recent.reload();
        void refreshCount();
      }
    });
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={
            count > 0 ? `Notifications, ${count} unread` : 'Notifications'
          }
          className="relative flex size-8 items-center justify-center rounded-md text-body-muted transition-colors duration-[120ms] ease-standard hover:bg-surface-active hover:text-body"
        >
          <Bell aria-hidden className="pointer-events-none size-4" />

          {count > 0 && (
            <span
              aria-hidden
              data-numeric
              className="pointer-events-none absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-accent-500 px-1 text-2xs font-medium text-body-inverse"
            >
              {count > 99 ? '99+' : count}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between gap-2 border-b border-line-subtle px-3 py-2">
          <span className="text-sm font-medium text-body">Notifications</span>

          {count > 0 && (
            <Button
              variant="ghost"
              size="sm"
              iconLeft={<Check aria-hidden />}
              loading={markAllRead.loading}
              onClick={() => {
                void markAllRead.run().then((outcome) => {
                  if (outcome.ok) {
                    recent.reload();
                    void refreshCount();
                  }
                });
              }}
            >
              Mark all read
            </Button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto scrollbar-thin">
          {recent.loading && (
            <p className="px-3 py-6 text-center text-xs text-body-subtle">Loading…</p>
          )}

          {!recent.loading && recent.error && (
            <p className="px-3 py-6 text-center text-xs text-body-subtle">
              Could not load notifications.
            </p>
          )}

          {!recent.loading && !recent.error && notifications.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-body-subtle">
              Nothing yet. Assignments and comments land here.
            </p>
          )}

          {groups.map((group) => (
            <div key={group.key}>
              <p className="px-3 pb-1 pt-2 text-2xs uppercase tracking-wide text-body-subtle">
                {group.label}
              </p>

              <ul>
                {group.items.map((notification) => {
                  const href = notificationHref(workspaceId, notification);

                  const row = (
                    <span className="flex items-start gap-2">
                      <span
                        aria-hidden
                        className={
                          notification.isRead
                            ? 'mt-1.5 size-1.5 shrink-0 rounded-full bg-ink-200'
                            : 'mt-1.5 size-1.5 shrink-0 rounded-full bg-accent-500'
                        }
                      />

                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span
                          className={
                            notification.isRead
                              ? 'text-xs text-body-muted'
                              : 'text-xs font-medium text-body'
                          }
                        >
                          {notification.title}
                        </span>

                        {notification.message && (
                          <span className="truncate text-2xs text-body-subtle">
                            {notification.message}
                          </span>
                        )}
                      </span>

                      {!notification.isRead && <Badge tone="accent">New</Badge>}
                    </span>
                  );

                  return (
                    <li key={notification._id}>
                      {href ? (
                        <Link
                          to={href}
                          className="flex px-3 py-2 transition-colors duration-[120ms] ease-standard hover:bg-surface-hover"
                          onClick={() => {
                            setOpen(false);
                            if (!notification.isRead) onMarkRead(notification._id);
                          }}
                        >
                          {row}
                        </Link>
                      ) : (
                        <button
                          type="button"
                          className="flex w-full px-3 py-2 text-left transition-colors duration-[120ms] ease-standard hover:bg-surface-hover"
                          onClick={() => {
                            if (!notification.isRead) onMarkRead(notification._id);
                          }}
                        >
                          {row}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-line-subtle p-2">
          <Button
            variant="secondary"
            size="sm"
            className="w-full justify-center"
            onClick={() => {
              setOpen(false);
              navigate(`/workspaces/${workspaceId}/notifications`);
            }}
          >
            View all
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
