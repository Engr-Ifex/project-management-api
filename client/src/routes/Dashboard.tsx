import { ArrowRight, Folders } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';

import { PageContainer } from '@/components/PageContainer';
import {
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
import { dashboardApi } from '@/lib/api';
import { useAsync, useDocumentTitle } from '@/lib/hooks';
import { useWorkspace } from '@/lib/workspace/WorkspaceProvider';

/**
 * The workspace dashboard.
 *
 * One request. The counts come from `GET …/dashboard`, which computes them
 * server-side — deliberately not recomputed here from a task list, because a
 * client-side count is a second opinion about the user's data and the two will
 * disagree the moment a filter or a page boundary is involved.
 */
export const Dashboard = () => {
  const { workspaceId, workspace } = useWorkspace();
  useDocumentTitle(workspace?.name ?? 'Dashboard');

  const { data, error, loading, reload } = useAsync(
    () => dashboardApi.workspace(workspaceId),
    [workspaceId]
  );

  if (error) {
    return (
      <PageContainer>
        <ErrorState
          title="Could not load the dashboard"
          description={error.message}
          onRetry={reload}
        />
      </PageContainer>
    );
  }

  const myTasks = data?.myTasks;
  const projects = data?.projects ?? [];

  return (
    <>
      <div className="border-b border-line px-4 py-4 lg:px-6">
        <h1 className="text-xl font-semibold text-body">{workspace?.name ?? 'Dashboard'}</h1>
        <p className="mt-0.5 text-xs text-body-muted">
          Your work across this workspace, and the projects in it.
        </p>
      </div>

      <PageContainer className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Card>
            <StatTile
              label="Assigned to you"
              value={loading ? <Skeleton className="h-7 w-10" /> : (myTasks?.assigned ?? 0)}
              hint="Across every project"
            />
          </Card>

          <Card>
            <StatTile
              label="Completed"
              value={loading ? <Skeleton className="h-7 w-10" /> : (myTasks?.completed ?? 0)}
              tone="success"
            />
          </Card>

          <Card>
            <StatTile
              label="Overdue"
              value={loading ? <Skeleton className="h-7 w-10" /> : (myTasks?.overdue ?? 0)}
              tone={myTasks && myTasks.overdue > 0 ? 'danger' : 'neutral'}
              hint={myTasks && myTasks.overdue > 0 ? 'Past their due date' : 'Nothing past due'}
            />
          </Card>
        </div>

        <Card>
          <CardHeader
            title="Projects"
            description={loading ? undefined : `${projects.length} in this workspace`}
            action={
              <Link to={`/workspaces/${workspaceId}/projects`}>
                <Button variant="ghost" size="sm" iconRight={<ArrowRight aria-hidden />}>
                  All projects
                </Button>
              </Link>
            }
          />

          {loading && <SkeletonList rows={3} />}

          {!loading && projects.length === 0 && (
            <EmptyState
              icon={<Folders aria-hidden />}
              title="No projects yet"
              description="Create a project to start tracking work in this workspace."
              action={
                <Link to={`/workspaces/${workspaceId}/projects`}>
                  <Button variant="primary" size="sm">
                    Go to projects
                  </Button>
                </Link>
              }
            />
          )}

          {!loading && projects.length > 0 && (
            <>
              <ul className="flex flex-col divide-y divide-line-subtle">
                {projects.slice(0, 6).map((project) => (
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
                      <span className="min-w-0 flex-1 truncate text-sm text-body">
                        {project.name}
                      </span>
                      <ProjectStatusBadge status={project.status} />
                    </Link>
                  </li>
                ))}
              </ul>

              <CardBody className="border-t border-line-subtle py-2">
                <Link
                  to={`/workspaces/${workspaceId}/projects`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-accent-600 hover:text-accent-700"
                >
                  View all projects
                  <ArrowRight aria-hidden className="size-3" />
                </Link>
              </CardBody>
            </>
          )}
        </Card>
      </PageContainer>
    </>
  );
};
