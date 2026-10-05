import { Link } from 'react-router-dom';

import {
  Avatar,
  Card,
  CardBody,
  ErrorState,
  Pagination,
  Select,
  SkeletonList,
} from '@/components/ui';
import type { Project } from '@/lib/api';
import { activityApi, refName } from '@/lib/api';
import { describeActivity } from '@/lib/activity';
import { ACTIVITY_ACTION_FILTER_OPTIONS } from '@/lib/constants';
import { useAsync } from '@/lib/hooks';
import { groupByDay } from '@/lib/notifications';
import { useSearchParams } from 'react-router-dom';
import { useWorkspace } from '@/lib/workspace/WorkspaceProvider';

/**
 * The project's activity trail.
 *
 * Read-only, and deliberately so: the trail is **append-only and written by the
 * service layer**, so it only ever contains changes made through the API. There
 * is nothing here to edit, and a direct database write would not appear — which
 * is worth knowing before treating this as a complete audit log.
 *
 * Each row names the actor, says what they did, and names the thing they did it
 * to — with a link when the metadata identifies a task. `describeActivity` owns
 * that mapping, including the fallback for an action this build has never heard
 * of, since `ActivityAction` is an open union.
 *
 * The filter and page live in the query string so a filtered trail survives a
 * reload, matching the task list.
 */
export const ActivityTab = ({ project }: { project: Project }) => {
  const { workspaceId } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Math.max(1, Number(searchParams.get('aPage') ?? '1') || 1);
  const limit = Number(searchParams.get('aLimit') ?? '20') || 20;
  const action = searchParams.get('aAction') ?? 'all';

  const setParams = (patch: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(searchParams);

    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === '' || value === 'all') next.delete(key);
      else next.set(key, String(value));
    }

    setSearchParams(next, { replace: true });
  };

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
  const groups = groupByDay(activities);

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
            onValueChange={(value) => setParams({ aAction: value, aPage: undefined })}
            options={ACTIVITY_ACTION_FILTER_OPTIONS}
            className="w-48"
          />
        </div>

        {loading && <SkeletonList rows={5} />}

        {!loading && activities.length === 0 && (
          <p className="py-8 text-center text-sm text-body-muted">
            {action === 'all'
              ? 'Nothing has been recorded yet.'
              : 'Nothing matches that action.'}
          </p>
        )}

        {!loading &&
          groups.map((group) => (
            <section key={group.key} className="flex flex-col gap-1">
              <h3 className="text-2xs uppercase tracking-wide text-body-subtle">
                {group.label}
              </h3>

              <ol className="flex flex-col divide-y divide-line-subtle">
                {group.items.map((entry) => {
                  const actor = refName(entry.user, 'Someone');
                  const { text, resource, href } = describeActivity(
                    entry,
                    workspaceId,
                    project._id
                  );

                  const body = (
                    <>
                      <Avatar name={actor} size="sm" />

                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <p className="text-sm text-body">
                          <span className="font-medium">{actor}</span>{' '}
                          <span className="text-body-muted">{text}</span>
                          {resource && (
                            <>
                              {' '}
                              <span className="font-medium text-body">{resource}</span>
                            </>
                          )}
                        </p>

                        <time
                          dateTime={entry.createdAt}
                          className="text-2xs text-body-subtle"
                          data-numeric
                        >
                          {new Date(entry.createdAt).toLocaleString()}
                        </time>
                      </div>
                    </>
                  );

                  return (
                    <li key={entry._id}>
                      {href ? (
                        <Link
                          to={href}
                          className="-mx-2 flex items-start gap-3 rounded-md px-2 py-3 transition-colors duration-[120ms] ease-standard hover:bg-surface-hover"
                        >
                          {body}
                        </Link>
                      ) : (
                        <div className="flex items-start gap-3 py-3">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}

        {pagination && pagination.total > 0 && (
          <Pagination
            {...pagination}
            onPageChange={(next) => setParams({ aPage: next })}
            onLimitChange={(next) => setParams({ aLimit: next, aPage: undefined })}
          />
        )}
      </CardBody>
    </Card>
  );
};
