import { Archive, ArrowCounterClockwise } from '@phosphor-icons/react';
import { useState } from 'react';
import { Link, Outlet, useOutletContext, useParams } from 'react-router-dom';

import { PageContainer } from '@/components/PageContainer';
import {
  Button,
  ConfirmDialog,
  ErrorState,
  ProjectStatusBadge,
  Select,
  Skeleton,
} from '@/components/ui';
import type { ProjectStatus } from '@/components/ui';
import type { Project } from '@/lib/api';
import { projectsApi } from '@/lib/api';
import { PROJECT_STATUS_OPTIONS } from '@/lib/constants';
import { useAsync, useDocumentTitle, useMutation, usePermission } from '@/lib/hooks';
import { useProjectRole, useWorkspace } from '@/lib/workspace/WorkspaceProvider';

/** What the project's child routes receive. */
export interface ProjectOutletContext {
  project: Project;
  reloadProject: () => void;
  setProject: (project: Project) => void;
}

/** Typed accessor for the outlet context — the project routes all need it. */
export const useProjectContext = () => useOutletContext<ProjectOutletContext>();

/**
 * ProjectLayout — the frame for a single project.
 *
 * It resolves the project once and hands it to its children through the outlet
 * context, so the overview, the task detail and the member tab do not each
 * re-fetch the same record.
 *
 * Note the split of authority in the header. Changing a project's **status** is
 * a project operation, but archiving it is a **workspace** operation — a project
 * owner cannot archive their own project. The two controls are therefore gated
 * on different roles, which looks inconsistent until you know why.
 */
export const ProjectLayout = () => {
  const { workspaceId } = useWorkspace();
  const { projectId } = useParams<{ projectId: string }>();
  const { can } = usePermission();

  const { data, error, loading, reload, setData } = useAsync(
    () => projectsApi.get(workspaceId, projectId ?? '').then((result) => result.project),
    [workspaceId, projectId]
  );

  useDocumentTitle(data?.name ?? 'Project');

  const { hasAccess } = useProjectRole(data?.members);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const setStatus = useMutation((status: ProjectStatus) =>
    projectsApi.setStatus(workspaceId, projectId ?? '', status)
  );
  const archive = useMutation(() => projectsApi.archive(workspaceId, projectId ?? ''));
  const restore = useMutation(() => projectsApi.restore(workspaceId, projectId ?? ''));

  if (error) {
    return (
      <PageContainer>
        <ErrorState
          variant="page"
          title={error.isNotFound ? 'Project not found' : 'Could not load this project'}
          description={
            error.isNotFound
              ? 'It may have been removed, or it may be in a workspace you do not have access to.'
              : error.message
          }
          onRetry={error.isNotFound ? undefined : reload}
        />
      </PageContainer>
    );
  }

  const project = data;

  const applyProject = (next: Project) => setData(() => next);

  return (
    <>
      <div className="flex flex-col gap-3 border-b border-line px-4 py-4 lg:px-6">
        <nav className="flex items-center gap-1.5 text-xs text-body-subtle">
          <Link
            to={`/workspaces/${workspaceId}/projects`}
            className="hover:text-body-muted"
          >
            Projects
          </Link>
          <span aria-hidden>/</span>
          <span className="truncate text-body-muted">{project?.name ?? '…'}</span>
        </nav>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-2">
              {project?.color && (
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: project.color }}
                />
              )}
              <h1 className="truncate text-xl font-semibold text-body">
                {loading && !project ? <Skeleton className="h-6 w-48" /> : project?.name}
              </h1>
              {project && <ProjectStatusBadge status={project.status} />}
              {project?.isArchived && (
                <span className="text-xs text-body-subtle">Archived</span>
              )}
            </div>

            {project?.description && (
              <p className="max-w-2xl text-xs text-body-muted">{project.description}</p>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {/* Status is a project operation: project owner/admin may change it. */}
            {project && can.manageProjects && !project.isArchived && (
              <Select
                aria-label="Project status"
                size="sm"
                value={project.status}
                options={PROJECT_STATUS_OPTIONS}
                onValueChange={(value) => {
                  void setStatus.run(value as ProjectStatus).then((outcome) => {
                    if (outcome.ok) applyProject(outcome.data.project);
                  });
                }}
                className="w-36"
              />
            )}

            {/* Archiving is a workspace operation: only owner/admin may do it. */}
            {project && can.manageProjects && (
              <>
                {project.isArchived ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    iconLeft={<ArrowCounterClockwise aria-hidden />}
                    loading={restore.loading}
                    onClick={() => {
                      void restore.run().then((outcome) => {
                        if (outcome.ok) applyProject(outcome.data.project);
                      });
                    }}
                  >
                    Restore
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    iconLeft={<Archive aria-hidden />}
                    onClick={() => setArchiveOpen(true)}
                  >
                    Archive
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {!loading && project && !hasAccess && (
          <p className="text-xs text-body-subtle">
            You are not a member of this project, so its contents are read-only for you.
          </p>
        )}
      </div>

      {project ? (
        <Outlet context={{ project, reloadProject: reload, setProject: applyProject }} />
      ) : (
        <PageContainer>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-5 w-64" />
            <Skeleton className="h-32 w-full" />
          </div>
        </PageContainer>
      )}

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Archive this project?"
        description="It will be hidden from the active list. Nothing is deleted, and you can restore it at any time."
        confirmLabel="Archive project"
        tone="danger"
        loading={archive.loading}
        onConfirm={() => {
          void archive.run().then((outcome) => {
            if (outcome.ok) {
              applyProject(outcome.data.project);
              setArchiveOpen(false);
            }
          });
        }}
      />
    </>
  );
};
