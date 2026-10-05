import { Archive, ArrowCounterClockwise, Trash } from '@phosphor-icons/react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';

import { PageContainer } from '@/components/PageContainer';
import { TaskAttachments } from '@/components/attachments/TaskAttachments';
import { CommentSection } from '@/components/task/CommentSection';
import { SubtaskList } from '@/components/task/SubtaskList';
import { TaskProperties } from '@/components/task/TaskProperties';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  ErrorState,
  Input,
  LabelChip,
  Select,
  Skeleton,
  Textarea,
} from '@/components/ui';
import type { Task } from '@/lib/api';
import { labelsApi, refId, refName, tasksApi } from '@/lib/api';
import { useAsync, useMutation, useDocumentTitle } from '@/lib/hooks';
import { useProjectContext } from '@/layouts/ProjectLayout';
import { useProjectRole, useWorkspace } from '@/lib/workspace/WorkspaceProvider';

/**
 * A single task.
 *
 * This is a route rather than a panel because tasks are addressable — people
 * paste links to them — and because the page carries a lot: subtasks, labels,
 * comments and attachments all belong to one task.
 *
 * The permission detail that matters here: **editing a comment is author-only**.
 * No role overrides it, not a project owner, not a workspace owner. Deletion is
 * different — it also honours `comment:moderate`. So the two affordances are
 * driven by two different predicates (`canEditComment` / `canDeleteComment`)
 * rather than one "can manage comments" flag, which would silently over-grant.
 */
export const TaskDetail = () => {
  const { workspaceId, role: workspaceRole } = useWorkspace();
  const { project, setProject } = useProjectContext();
  const { taskId } = useParams<{ taskId: string }>();
  const { projectRole } = useProjectRole(project.members);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [editing, setEditing] = useState(false);

  const [archiveOpen, setArchiveOpen] = useState(false);

  const task = useAsync(
    () => tasksApi.get(workspaceId, project._id, taskId ?? '').then((data) => data.task),
    [workspaceId, project._id, taskId]
  );

  const labels = useAsync(
    () => labelsApi.list(workspaceId, project._id, { limit: 100 }).then((data) => data.labels),
    [workspaceId, project._id]
  );

  useDocumentTitle(task.data?.title ?? 'Task');

  const current: Task | undefined = task.data;
  const canEdit = projectRole !== 'viewer';
  const canArchive = projectRole === 'owner' || projectRole === 'admin';

  /* ------------------------------------------------------------- mutations */

  const update = useMutation((body: { title?: string; description?: string }) =>
    tasksApi.update(workspaceId, project._id, taskId ?? '', body)
  );

  const archiveTask = useMutation(() =>
    tasksApi.archive(workspaceId, project._id, taskId ?? '')
  );
  const restoreTask = useMutation(() =>
    tasksApi.restore(workspaceId, project._id, taskId ?? '')
  );
  const assignLabel = useMutation((labelId: string) =>
    tasksApi.assignLabel(workspaceId, project._id, taskId ?? '', labelId)
  );
  const removeLabel = useMutation((labelId: string) =>
    tasksApi.removeLabel(workspaceId, project._id, taskId ?? '', labelId)
  );

  /* ----------------------------------------------------------------- views */

  if (task.error) {
    return (
      <PageContainer>
        <ErrorState
          variant="page"
          title={task.error.isNotFound ? 'Task not found' : 'Could not load this task'}
          description={
            task.error.isNotFound
              ? 'It may have been removed, or it may belong to a project you cannot see.'
              : task.error.message
          }
          onRetry={task.error.isNotFound ? undefined : task.reload}
        />
      </PageContainer>
    );
  }

  if (!current) {
    return (
      <PageContainer>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-6 w-72" />
          <Skeleton className="h-40 w-full" />
        </div>
      </PageContainer>
    );
  }

  const memberOptions = (project.members ?? []).map((member) => ({
    value: refId(member.user) ?? '',
    label: refName(member.user),
  }));

  const availableLabels = (labels.data ?? []).filter(
    (label) => !current.labels.some((assigned) => assigned._id === label._id)
  );

  const startEditing = () => {
    setTitle(current.title);
    setDescription(current.description ?? '');
    setEditing(true);
  };

  const onSave = async (event: FormEvent) => {
    event.preventDefault();
    const outcome = await update.run({
      title,
      ...(description !== (current.description ?? '') ? { description } : {}),
    });
    if (outcome.ok) {
      task.setData(() => outcome.data.task);
      setEditing(false);
    }
  };

  /* ---------------------------------------------------------------- render */

  return (
    <>
      <PageContainer>
        <nav className="mb-3 flex items-center gap-1.5 text-xs text-body-subtle">
          <Link to={`/workspaces/${workspaceId}/projects`} className="hover:text-body-muted">
            Projects
          </Link>
          <span aria-hidden>/</span>
          <Link
            to={`/workspaces/${workspaceId}/projects/${project._id}`}
            className="hover:text-body-muted"
          >
            {project.name}
          </Link>
          <span aria-hidden>/</span>
          <span className="truncate text-body-muted">{current.title}</span>
        </nav>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          {/* ---- main column ---- */}
          <div className="flex min-w-0 flex-col gap-4">
            <Card>
              <CardBody className="flex flex-col gap-4 p-4">
                {editing ? (
                  <form onSubmit={onSave} className="flex flex-col gap-3">
                    <Input
                      label="Title"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      error={update.error?.fieldError('title')}
                    />

                    <Textarea
                      label="Description"
                      rows={5}
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                    />

                    <div className="flex items-center gap-2">
                      <Button type="submit" variant="primary" size="sm" loading={update.loading}>
                        Save changes
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setEditing(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <h1 className="text-xl font-semibold text-body">{current.title}</h1>
                      {canEdit && (
                        <Button variant="secondary" size="sm" onClick={startEditing}>
                          Edit
                        </Button>
                      )}
                    </div>

                    {current.description ? (
                      <p className="whitespace-pre-wrap text-sm text-body-muted">
                        {current.description}
                      </p>
                    ) : (
                      <p className="text-sm text-body-subtle">No description.</p>
                    )}
                  </>
                )}
              </CardBody>
            </Card>

            {/* ---- subtasks ---- */}
            <SubtaskList
              subtasks={current.subtasks ?? []}
              canEdit={canEdit}
              onChanged={task.reload}
            />

            {/* ---- comments ---- */}
            <CommentSection
              taskId={taskId ?? ''}
              canEdit={canEdit}
              projectRole={projectRole}
              workspaceRole={workspaceRole}
            />

            {/* ---- attachments ---- */}
            <Card>
              <CardHeader
                title="Attachments"
                description="Files on this task, not the whole project."
              />

              <CardBody className="p-4">
                <TaskAttachments taskId={taskId ?? ''} canUpload={canEdit} />
              </CardBody>
            </Card>
          </div>

          {/* ---- side column ---- */}
          <div className="flex flex-col gap-4">
            <Card>
              <CardBody className="p-4">
                <TaskProperties
                  task={current}
                  canEdit={canEdit}
                  memberOptions={memberOptions}
                  onChanged={(next) => task.setData(() => next)}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Labels" />
              <CardBody className="flex flex-col gap-3 p-4">
                {current.labels.length === 0 ? (
                  <p className="text-sm text-body-subtle">No labels.</p>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {current.labels.map((label) => (
                      <li key={label._id} className="group flex items-center gap-1">
                        <LabelChip name={label.name} color={label.color} />
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Remove label ${label.name}`}
                            className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                            iconLeft={<Trash aria-hidden />}
                            onClick={() => {
                              void removeLabel.run(label._id).then((outcome) => {
                                if (outcome.ok) task.setData(() => outcome.data.task);
                              });
                            }}
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {canEdit && availableLabels.length > 0 && (
                  <Select
                    aria-label="Add a label"
                    placeholder="Add a label"
                    value=""
                    options={availableLabels.map((label) => ({
                      value: label._id,
                      label: label.name,
                    }))}
                    onValueChange={(value) => {
                      void assignLabel.run(value).then((outcome) => {
                        if (outcome.ok) task.setData(() => outcome.data.task);
                      });
                    }}
                  />
                )}
              </CardBody>
            </Card>

            {canArchive && (
              <Card>
                <CardBody className="flex flex-col gap-2 p-4">
                  {current.isArchived ? (
                    <Button
                      variant="secondary"
                      iconLeft={<ArrowCounterClockwise aria-hidden />}
                      loading={restoreTask.loading}
                      onClick={() => {
                        void restoreTask.run().then((outcome) => {
                          if (outcome.ok) {
                            task.setData(() => outcome.data.task);
                            setProject({ ...project });
                          }
                        });
                      }}
                    >
                      Restore task
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      iconLeft={<Archive aria-hidden />}
                      onClick={() => setArchiveOpen(true)}
                    >
                      Archive task
                    </Button>
                  )}

                  <p className="text-2xs text-body-subtle">
                    Tasks are never deleted, only archived.
                  </p>
                </CardBody>
              </Card>
            )}
          </div>
        </div>
      </PageContainer>

      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Archive this task?"
        description="It will be hidden from the active list. Nothing is deleted, and it can be restored."
        confirmLabel="Archive task"
        tone="danger"
        loading={archiveTask.loading}
        onConfirm={() => {
          void archiveTask.run().then((outcome) => {
            if (outcome.ok) {
              task.setData(() => outcome.data.task);
              setArchiveOpen(false);
            }
          });
        }}
      />
    </>
  );
};
