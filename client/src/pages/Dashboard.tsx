import {
  ArrowRight,
  Bell,
  Folders,
  Plus,
  UserPlus,
  WarningCircle,
} from '@phosphor-icons/react';
import { Link, useNavigate } from 'react-router-dom';

import { PageContainer } from '@/components/PageContainer';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  ProjectStatusBadge,
  Skeleton,
  SkeletonList,
  StatTile,
} from '@/components/ui';
import type { ProjectStatus } from '@/components/ui';
import { dashboardApi, notificationsApi, projectsApi, refName } from '@/lib/api';
import { PROJECT_STATUS_OPTIONS } from '@/lib/constants';
import { useAsync, useDocumentTitle, usePermission } from '@/lib/hooks';
import { cn } from '@/lib/utils/cn';
import { useWorkspace } from '@/lib/workspace/WorkspaceProvider';

/**
 * The workspace dashboard.
 *
 * Three independent requests, each with its own loading and error state, and
 * that is deliberate. The counts, the project list and the activity feed come
 * from different endpoints; letting one failure blank the whole screen would
 * mean a hiccup on the notification feed hides the user's overdue count. A panel
 * that cannot load degrades on its own.
 *
 * **The figures are never recomputed here.** Every number comes from
 * `GET …/dashboard`, which computes them with an aggregation over the whole
 * workspace. Deriving them from a page of tasks would produce a second, smaller
 * answer the moment pagination or a filter is involved — and the two would
 * disagree silently.
 *
 * On shape: the dashboard endpoints return **aggregates, not documents**.
 * `data.projects` is `{total, active, archived, byStatus}`, not a list of
 * projects — reading it as an array is what previously left the Projects panel
 * permanently blank (see `lib/api/types.ts`). The project *rows* below come from
 * `GET /projects`, which is the endpoint that actually returns records.
 *
 * Layout note: this is deliberately not a grid of equal cards. A stat strip of
 * divided cells, one wide list, one narrow summary and a full-width feed reads
 * as a page; six bordered boxes of the same size reads as a template.
 */
export const Dashboard = () => {
  const { workspaceId, workspace } = useWorkspace();
  const { can } = usePermission();
  const navigate = useNavigate();

  useDocumentTitle(workspace?.name ?? 'Dashboard');

  const stats = useAsync(() => dashboardApi.workspace(workspaceId), [workspaceId]);

  /*
   * The rows, not the counts. `limit: 5` because this is a summary panel with a
   * link to the full list — fetching all of them to show five would be waste.
   */
  const recentProjects = useAsync(
    () =>
      projectsApi
        .list(workspaceId, {
          limit: 5,
          sortBy: 'updatedAt',
          order: 'desc',
          isArchived: 'false',
        })
        .then((data) => data.projects),
    [workspaceId]
  );

  /*
   * Recent activity.
   *
   * There is no workspace-level audit endpoint — `…/activities` exists only per
   * project and per task — so a cross-project trail would cost one request per
   * project. The user's own notification feed is the one event stream the API
   * exposes in a single call, and it carries real events (assignment, comments,
   * role changes).
   *
   * It is per-recipient and spans every workspace, and the endpoint cannot filter
   * by workspace, so a wider page is fetched and narrowed here. That is why the
   * request asks for 20 to show 5.
   */
  const activity = useAsync(
    () =>
      notificationsApi
        .list({ limit: 20, sortBy: 'createdAt', order: 'desc' })
        .then((data) =>
          data.notifications.filter((entry) => entry.workspace === workspaceId).slice(0, 5)
        ),
    [workspaceId]
  );

  const myTasks = stats.data?.myTasks;
  const projectStats = stats.data?.projects;
  const projects = recentProjects.data ?? [];
  const feed = activity.data ?? [];

  const completion =
    myTasks && myTasks.assigned > 0
      ? Math.round((myTasks.completed / myTasks.assigned) * 100)
      : 0;

  /* --------------------------------------------------------------- panels */

  const statStrip = stats.error ? (
    <Card>
      <ErrorState
        title="Could not load your figures"
        description={stats.error.message}
        onRetry={stats.reload}
      />
    </Card>
  ) : (
    <Card className="overflow-hidden">
      {/*
        A hairline grid: the 1px gaps show the divider colour through, which
        gives a true ruled strip at every breakpoint. `divide-x` cannot do this —
        it is a one-dimensional utility and puts a border in the wrong cell as
        soon as the grid wraps to two rows.
      */}
      <div className="grid grid-cols-2 gap-px bg-line-subtle lg:grid-cols-4">
        <div className="bg-surface">
          <StatTile
            label="Assigned to you"
            value={stats.loading ? <Skeleton className="h-7 w-10" /> : (myTasks?.assigned ?? 0)}
            hint="Across every project"
          />
        </div>

        <div className="bg-surface">
          <StatTile
            label="Completed"
            value={stats.loading ? <Skeleton className="h-7 w-10" /> : (myTasks?.completed ?? 0)}
            tone="success"
            hint={myTasks && myTasks.assigned > 0 ? `${completion}% of your work` : undefined}
          />
        </div>

        <div className="bg-surface">
          <StatTile
            label="Overdue"
            value={stats.loading ? <Skeleton className="h-7 w-10" /> : (myTasks?.overdue ?? 0)}
            tone={myTasks && myTasks.overdue > 0 ? 'danger' : 'neutral'}
            hint={myTasks && myTasks.overdue > 0 ? 'Past their due date' : 'Nothing past due'}
          />
        </div>

        <div className="bg-surface">
          <StatTile
            label="Active projects"
            value={stats.loading ? <Skeleton className="h-7 w-10" /> : (projectStats?.active ?? 0)}
            hint={
              projectStats && projectStats.archived > 0
                ? `${projectStats.archived} archived`
                : 'All in this workspace'
            }
          />
        </div>
      </div>
    </Card>
  );

  const projectsPanel = (
    <Card className="flex flex-col">
      <CardHeader
        title="Projects"
        description={projectStats ? `${projectStats.active} active` : 'Recently updated first'}
        action={
          <Link to={`/workspaces/${workspaceId}/projects`}>
            <Button variant="ghost" size="sm" iconRight={<ArrowRight aria-hidden />}>
              All projects
            </Button>
          </Link>
        }
      />

      {recentProjects.loading && <SkeletonList rows={3} />}

      {!recentProjects.loading && recentProjects.error && (
        <ErrorState
          title="Could not load projects"
          description={recentProjects.error.message}
          onRetry={recentProjects.reload}
        />
      )}

      {!recentProjects.loading && !recentProjects.error && projects.length === 0 && (
        <EmptyState
          icon={<Folders aria-hidden />}
          title="No projects yet"
          description="A project holds the tasks, labels and files for one piece of work."
          action={
            can.manageProjects ? (
              <Link to={`/workspaces/${workspaceId}/projects?new=1`}>
                <Button variant="primary" size="sm" iconLeft={<Plus aria-hidden />}>
                  Create a project
                </Button>
              </Link>
            ) : undefined
          }
        />
      )}

      {!recentProjects.loading && !recentProjects.error && projects.length > 0 && (
        <ul className="flex flex-col divide-y divide-line-subtle">
          {projects.map((project) => (
            <li key={project._id}>
              <Link
                to={`/workspaces/${workspaceId}/projects/${project._id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors duration-[120ms] ease-standard hover:bg-surface-hover"
              >
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: project.color ?? 'var(--color-ink-300)' }}
                />

                <span className="min-w-0 flex-1 truncate text-sm text-body">{project.name}</span>

                <span className="hidden shrink-0 text-xs text-body-subtle sm:block" data-numeric>
                  {project.deadline
                    ? `Due ${new Date(project.deadline).toLocaleDateString()}`
                    : `Updated ${new Date(project.updatedAt).toLocaleDateString()}`}
                </span>

                <ProjectStatusBadge status={project.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/*
        The breakdown belongs with the projects, not with the personal summary —
        it is a fact about the workspace, and putting it here is also what keeps
        the two columns from being lopsided.
      */}
      {projectStats && projectStats.total > 0 && (
        <CardBody className="flex flex-col gap-3 border-t border-line-subtle">
          <span className="text-xs font-medium text-body-muted">By status</span>

          <ul className="flex flex-col gap-2.5">
            {PROJECT_STATUS_OPTIONS.map((option) => {
              const count = projectStats.byStatus[option.value as ProjectStatus] ?? 0;
              const share =
                projectStats.total > 0 ? Math.round((count / projectStats.total) * 100) : 0;

              return (
                <li key={option.value} className="flex items-center gap-2">
                  <span className="w-20 shrink-0 truncate text-xs text-body-muted">
                    {option.label}
                  </span>

                  {/*
                    Decorative: the count beside it is the accessible value. Five
                    progressbars here would announce five numbers with no context.
                  */}
                  <span
                    aria-hidden
                    className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-ink-100"
                  >
                    <span
                      className="block h-full rounded-full bg-ink-400"
                      style={{ width: `${share}%` }}
                    />
                  </span>

                  <span
                    className="w-5 shrink-0 text-right text-xs tabular-nums text-body"
                    data-numeric
                  >
                    {count}
                  </span>
                </li>
              );
            })}
          </ul>
        </CardBody>
      )}
    </Card>
  );

  const yourWorkPanel = (
    <Card className="flex flex-col">
      <CardHeader title="Your work" description="Only tasks assigned to you" />

      <CardBody className="flex flex-col gap-4">
        {stats.loading ? (
          <>
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-1.5 w-full" />
          </>
        ) : myTasks && myTasks.assigned > 0 ? (
          <>
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium text-body-muted">Completion</span>
                <span className="text-sm font-semibold text-body" data-numeric>
                  {completion}%
                </span>
              </div>

              <span
                role="progressbar"
                aria-valuenow={completion}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Share of your assigned tasks that are complete"
                className="block h-1.5 overflow-hidden rounded-full bg-ink-100"
              >
                <span
                  className="block h-full rounded-full bg-success-500"
                  style={{ width: `${completion}%` }}
                />
              </span>

              <p className="text-xs text-body-subtle" data-numeric>
                {myTasks.completed} of {myTasks.assigned} complete
              </p>
            </div>

            {myTasks.overdue > 0 && (
              <p className="flex items-start gap-2 rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-700">
                <WarningCircle aria-hidden weight="fill" className="mt-px size-3.5 shrink-0" />
                <span>
                  {myTasks.overdue === 1
                    ? '1 task is past its due date.'
                    : `${myTasks.overdue} tasks are past their due date.`}
                </span>
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-body-subtle">
            Nothing is assigned to you in this workspace right now.
          </p>
        )}
      </CardBody>
    </Card>
  );

  const activityPanel = (
    <Card className="flex flex-col">
      <CardHeader
        title="Recent activity"
        description="Assignments, comments and role changes involving you"
        action={
          <Link to={`/workspaces/${workspaceId}/notifications`}>
            <Button variant="ghost" size="sm" iconRight={<ArrowRight aria-hidden />}>
              All notifications
            </Button>
          </Link>
        }
      />

      {activity.loading && <SkeletonList rows={3} />}

      {!activity.loading && activity.error && (
        <ErrorState
          title="Could not load recent activity"
          description={activity.error.message}
          onRetry={activity.reload}
        />
      )}

      {!activity.loading && !activity.error && feed.length === 0 && (
        <EmptyState
          icon={<Bell aria-hidden />}
          title="Nothing recent"
          description="When someone assigns you a task or comments on your work, it will show up here."
        />
      )}

      {!activity.loading && !activity.error && feed.length > 0 && (
        <ul className="flex flex-col divide-y divide-line-subtle">
          {feed.map((entry) => {
            const href = entry.task
              ? `/workspaces/${workspaceId}/projects/${entry.project}/tasks/${entry.task}`
              : entry.project
                ? `/workspaces/${workspaceId}/projects/${entry.project}`
                : undefined;

            const body = (
              <>
                {/* A system-generated notification has no actor. */}
                <Avatar name={refName(entry.actor, 'System')} size="sm" />

                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        'truncate text-sm',
                        entry.isRead ? 'text-body-muted' : 'font-medium text-body'
                      )}
                    >
                      {entry.title}
                    </span>
                    {!entry.isRead && <Badge tone="accent">New</Badge>}
                  </span>

                  {entry.message && (
                    <span className="truncate text-xs text-body-subtle">{entry.message}</span>
                  )}

                  <time
                    dateTime={entry.createdAt}
                    className="text-2xs text-body-subtle"
                    data-numeric
                  >
                    {new Date(entry.createdAt).toLocaleString()}
                  </time>
                </span>
              </>
            );

            return (
              <li key={entry._id}>
                {href ? (
                  <Link
                    to={href}
                    className="flex items-start gap-3 px-4 py-3 transition-colors duration-[120ms] ease-standard hover:bg-surface-hover"
                  >
                    {body}
                  </Link>
                ) : (
                  // No destination — a dead link would be worse than plain text.
                  <span className="flex items-start gap-3 px-4 py-3">{body}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-4 py-4 lg:px-6">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-semibold text-body">{workspace?.name ?? 'Dashboard'}</h1>
          <p className="text-xs text-body-muted">
            Your work across this workspace, and the projects in it.
          </p>
        </div>

        {/*
          Quick actions start something, so they only appear when the caller can
          actually finish it — an action that leads to a 403 is worse than none.
        */}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {can.inviteMembers && (
            <Button
              variant="secondary"
              size="sm"
              iconLeft={<UserPlus aria-hidden />}
              onClick={() => navigate(`/workspaces/${workspaceId}/members?invite=1`)}
            >
              Invite someone
            </Button>
          )}

          {can.manageProjects && (
            <Button
              variant="primary"
              size="sm"
              iconLeft={<Plus aria-hidden />}
              onClick={() => navigate(`/workspaces/${workspaceId}/projects?new=1`)}
            >
              New project
            </Button>
          )}
        </div>
      </div>

      <PageContainer className="flex flex-col gap-5">
        {statStrip}

        {/*
          `items-start` so each panel is its natural height. The default
          `stretch` would pad the shorter one with dead space, which reads as a
          rendering fault rather than as a layout choice.
        */}
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          {projectsPanel}
          {yourWorkPanel}
        </div>

        {activityPanel}
      </PageContainer>
    </>
  );
};
