import { useState } from 'react';

import {
  Card,
  CardBody,
  ErrorState,
  Pagination,
  Select,
  SkeletonList,
} from '@/components/ui';
import type { Project } from '@/lib/api';
import { activityApi, refName } from '@/lib/api';
import { ACTIVITY_ACTION_FILTER_OPTIONS } from '@/lib/constants';
import { useAsync } from '@/lib/hooks';
import { humaniseEnum } from '@/lib/utils';
import { useWorkspace } from '@/lib/workspace/WorkspaceProvider';

/**
 * The project's activity trail.
 *
 * Read-only, and deliberately so: the trail is **append-only and written by the
 * service layer**, so it only ever contains changes made through the API. There
 * is nothing here to edit, and a direct database write would not appear — which
 * is worth knowing before treating this as a complete audit log.
 */
export const ActivityTab = ({ project }: { project: Project }) => {
  const { workspaceId } = useWorkspace();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [action, setAction] = useState('all');

  const { data, error, loading, reload } = useAsync(
    () =>
      activityApi.forProject(workspaceId, project._id, {
        page,
        limit,
        sortBy: 'createdAt',
        order: 'desc',
        action: action === 'all' ? undefined : action,
      }),
    [workspaceId, project._id, page, limit, action]
  );

  const activities = data?.activities ?? [];
  const pagination = data?.pagination;

  if (error) {
    return (
      <ErrorState title="Could not load activity" description={error.message} onRetry={reload} />
    );
  }

  return (
    <Card>
      <CardBody className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-sm font-semibold text-body">Activity</h2>
            <p className="text-xs text-body-subtle">
              Recorded by the server when something changes through the API.
            </p>
          </div>

          <Select
            aria-label="Filter by action"
            size="sm"
            value={action}
            onValueChange={(value) => {
              setAction(value);
              setPage(1);
            }}
            options={ACTIVITY_ACTION_FILTER_OPTIONS}
            className="w-48"
          />
        </div>

        {loading && <SkeletonList rows={5} />}

        {!loading && activities.length === 0 && (
          <p className="py-8 text-center text-sm text-body-muted">
            Nothing has been recorded yet.
          </p>
        )}

        {!loading && activities.length > 0 && (
          <ol className="flex flex-col divide-y divide-line-subtle">
            {activities.map((entry) => (
              <li key={entry._id} className="flex items-start gap-3 py-3">
                <span
                  aria-hidden
                  className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ink-300"
                />

                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="text-sm text-body">
                    <span className="font-medium">{refName(entry.user, 'Someone')}</span>{' '}
                    <span className="text-body-muted">{humaniseEnum(entry.action)}</span>
                  </p>

                  <time
                    dateTime={entry.createdAt}
                    className="text-2xs text-body-subtle"
                    data-numeric
                  >
                    {new Date(entry.createdAt).toLocaleString()}
                  </time>
                </div>
              </li>
            ))}
          </ol>
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
      </CardBody>
    </Card>
  );
};
