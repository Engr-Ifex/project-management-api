import { Bell, Check, Trash } from '@phosphor-icons/react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { PageContainer } from '@/components/PageContainer';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Pagination,
  SegmentedControl,
  SkeletonList,
} from '@/components/ui';
import { notificationsApi } from '@/lib/api';
import { NOTIFICATION_SCOPE_OPTIONS } from '@/lib/constants';
import type { NotificationScope } from '@/lib/constants';
import { useAsync, useDocumentTitle, useMutation } from '@/lib/hooks';
import { useWorkspace } from '@/lib/workspace/WorkspaceProvider';

/**
 * Notifications.
 *
 * Scoped to the recipient: another user's notification is a **404**, not a 403,
 * so there is nothing to handle here beyond "gone". No permission or role is
 * involved at all.
 *
 * The list is not live — the API has no websocket or SSE — so this is a pull
 * screen. The sidebar badge polls the count separately.
 *
 * `unread` is the string `"true"`, not a boolean, which `toQueryString` handles.
 */
export const Notifications = () => {
  useDocumentTitle('Notifications');

  const { workspaceId } = useWorkspace();

  const [scope, setScope] = useState<NotificationScope>('all');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const { data, error, loading, reload } = useAsync(
    () =>
      notificationsApi.list({
        page,
        limit,
        sortBy: 'createdAt',
        order: 'desc',
        ...(scope === 'unread' ? { unread: true } : {}),
      }),
    [page, limit, scope]
  );

  const markRead = useMutation((id: string) => notificationsApi.markRead(id));
  const markAllRead = useMutation(() => notificationsApi.markAllRead());
  const remove = useMutation((id: string) => notificationsApi.remove(id));

  const notifications = data?.notifications ?? [];
  const pagination = data?.pagination;

  if (error) {
    return (
      <PageContainer>
        <ErrorState
          title="Could not load notifications"
          description={error.message}
          onRetry={reload}
        />
      </PageContainer>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-4 py-4 lg:px-6">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-semibold text-body">Notifications</h1>
          <p className="text-xs text-body-muted">
            {pagination ? `${pagination.total} in total` : 'Your activity feed'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <SegmentedControl
            value={scope}
            onValueChange={(value) => {
              setScope(value);
              setPage(1);
            }}
            options={NOTIFICATION_SCOPE_OPTIONS}
          />

          <Button
            variant="secondary"
            size="sm"
            iconLeft={<Check aria-hidden />}
            loading={markAllRead.loading}
            onClick={() => {
              void markAllRead.run().then((outcome) => {
                if (outcome.ok) reload();
              });
            }}
          >
            Mark all read
          </Button>
        </div>
      </div>

      <PageContainer>
        <Card>
          {loading && <SkeletonList rows={5} />}

          {!loading && notifications.length === 0 && (
            <EmptyState
              icon={<Bell aria-hidden />}
              variant={scope === 'unread' ? 'no-results' : 'empty'}
              title={scope === 'unread' ? 'Nothing unread' : 'No notifications yet'}
              description={
                scope === 'unread'
                  ? 'You have read everything.'
                  : 'Assignments, comments and invitations will appear here.'
              }
              action={
                scope === 'unread' ? (
                  <Button variant="secondary" size="sm" onClick={() => setScope('all')}>
                    Show all
                  </Button>
                ) : undefined
              }
            />
          )}

          {!loading && notifications.length > 0 && (
            <ul className="flex flex-col divide-y divide-line-subtle">
              {notifications.map((notification) => {
                /*
                 * A notification may point at a task, a project or neither.
                 * Only link when there is somewhere to go — a dead link is worse
                 * than plain text.
                 */
                const href = notification.task
                  ? `/workspaces/${workspaceId}/projects/${notification.project}/tasks/${notification.task}`
                  : notification.project
                    ? `/workspaces/${workspaceId}/projects/${notification.project}`
                    : undefined;

                const body = (
                  <>
                    <span
                      aria-hidden
                      className={
                        notification.isRead
                          ? 'mt-1.5 size-1.5 shrink-0 rounded-full bg-ink-200'
                          : 'mt-1.5 size-1.5 shrink-0 rounded-full bg-accent-500'
                      }
                    />

                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-center gap-2">
                        <span
                          className={
                            notification.isRead
                              ? 'text-sm text-body-muted'
                              : 'text-sm font-medium text-body'
                          }
                        >
                          {notification.title}
                        </span>
                        {!notification.isRead && <Badge tone="accent">New</Badge>}
                      </span>

                      {notification.message && (
                        <span className="text-xs text-body-subtle">
                          {notification.message}
                        </span>
                      )}

                      <time
                        dateTime={notification.createdAt}
                        className="text-2xs text-body-subtle"
                        data-numeric
                      >
                        {new Date(notification.createdAt).toLocaleString()}
                      </time>
                    </span>
                  </>
                );

                return (
                  <li key={notification._id} className="flex items-start gap-3 px-4 py-3">
                    {href ? (
                      <Link
                        to={href}
                        className="flex min-w-0 flex-1 items-start gap-3"
                        onClick={() => {
                          if (!notification.isRead) {
                            void markRead.run(notification._id).then((outcome) => {
                              if (outcome.ok) reload();
                            });
                          }
                        }}
                      >
                        {body}
                      </Link>
                    ) : (
                      <span className="flex min-w-0 flex-1 items-start gap-3">{body}</span>
                    )}

                    <span className="flex shrink-0 items-center gap-1">
                      {!notification.isRead && (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Mark as read"
                          iconLeft={<Check aria-hidden />}
                          onClick={() => {
                            void markRead.run(notification._id).then((outcome) => {
                              if (outcome.ok) reload();
                            });
                          }}
                        />
                      )}

                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="Delete notification"
                        iconLeft={<Trash aria-hidden />}
                        onClick={() => {
                          void remove.run(notification._id).then((outcome) => {
                            if (outcome.ok) reload();
                          });
                        }}
                      />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          {pagination && pagination.total > 0 && (
            <Pagination
              {...pagination}
              onPageChange={setPage}
              onLimitChange={(next) => {
                setLimit(next);
                setPage(1);
              }}
            />
          )}
        </Card>
      </PageContainer>
    </>
  );
};
