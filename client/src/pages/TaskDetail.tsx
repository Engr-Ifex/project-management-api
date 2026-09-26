import { Archive, ArrowCounterClockwise, Plus, Trash } from '@phosphor-icons/react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';

import { PageContainer } from '@/components/PageContainer';
import {
  Avatar,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  ConfirmDialog,
  ErrorState,
  Input,
  LabelChip,
  Select,
  Skeleton,
  TaskPriorityBadge,
  TaskStatusBadge,
  Textarea,
} from '@/components/ui';
import type { TaskPriority, TaskStatus } from '@/components/ui';
import type { Comment, Subtask, Task } from '@/lib/api';
import { commentsApi, labelsApi, refId, refName, tasksApi } from '@/lib/api';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useAsync, useMutation, useDocumentTitle } from '@/lib/hooks';
import { TASK_PRIORITY_OPTIONS, TASK_STATUS_OPTIONS } from '@/lib/constants';
import { canDeleteComment, canEditComment } from '@/lib/permissions';
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
  const { user } = useAuth();
  const { projectRole } = useProjectRole(project.members);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [editing, setEditing] = useState(false);

  const [newSubtask, setNewSubtask] = useState('');
  const [newComment, setNewComment] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState('');
  const [pendingCommentDelete, setPendingCommentDelete] = useState<Comment | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const task = useAsync(
    () => tasksApi.get(workspaceId, project._id, taskId ?? '').then((data) => data.task),
    [workspaceId, project._id, taskId]
  );

  const comments = useAsync(
    () =>
      commentsApi
        .list(workspaceId, project._id, taskId ?? '', { limit: 100 })
        .then((data) => data.comments),
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
  const setStatus = useMutation((status: TaskStatus) =>
    tasksApi.setStatus(workspaceId, project._id, taskId ?? '', status)
  );
  const setPriority = useMutation((priority: TaskPriority) =>
    tasksApi.setPriority(workspaceId, project._id, taskId ?? '', priority)
  );
  const setAssignee = useMutation((assignee: string | null) =>
    tasksApi.setAssignee(workspaceId, project._id, taskId ?? '', assignee)
  );
  const archiveTask = useMutation(() =>
    tasksApi.archive(workspaceId, project._id, taskId ?? '')
  );
  const restoreTask = useMutation(() =>
    tasksApi.restore(workspaceId, project._id, taskId ?? '')
  );

  const createSubtask = useMutation((subtaskTitle: string) =>
    tasksApi.createSubtask(workspaceId, project._id, taskId ?? '', subtaskTitle)
  );
  const toggleSubtask = useMutation((args: { subtaskId: string; isCompleted: boolean }) =>
    tasksApi.updateSubtask(workspaceId, project._id, taskId ?? '', args.subtaskId, {
      isCompleted: args.isCompleted,
    })
  );
  const deleteSubtask = useMutation((subtaskId: string) =>
    tasksApi.deleteSubtask(workspaceId, project._id, taskId ?? '', subtaskId)
  );

  const assignLabel = useMutation((labelId: string) =>
    tasksApi.assignLabel(workspaceId, project._id, taskId ?? '', labelId)
  );
  const removeLabel = useMutation((labelId: string) =>
    tasksApi.removeLabel(workspaceId, project._id, taskId ?? '', labelId)
  );

  const createComment = useMutation((content: string) =>
    commentsApi.create(workspaceId, project._id, taskId ?? '', content)
  );
  const updateComment = useMutation((args: { commentId: string; content: string }) =>
    commentsApi.update(workspaceId, project._id, taskId ?? '', args.commentId, args.content)
  );
  const deleteComment = useMutation((commentId: string) =>
    commentsApi.remove(workspaceId, project._id, taskId ?? '', commentId)
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

  const subtasks = current.subtasks ?? [];
  const done = subtasks.filter((subtask) => subtask.isCompleted).length;

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
            <Card>
              <CardHeader
                title="Subtasks"
                description={subtasks.length > 0 ? `${done} of ${subtasks.length} complete` : undefined}
              />

              <CardBody className="flex flex-col gap-3 p-4">
                {subtasks.length > 0 && (
                  <ul className="flex flex-col divide-y divide-line-subtle">
                    {subtasks.map((subtask: Subtask) => (
                      <li key={subtask._id} className="flex items-center gap-3 py-2">
                        <Checkbox
                          checked={subtask.isCompleted}
                          disabled={!canEdit}
                          onCheckedChange={(checked) => {
                            void toggleSubtask
                              .run({ subtaskId: subtask._id, isCompleted: checked === true })
                              .then((outcome) => {
                                if (outcome.ok) task.reload();
                              });
                          }}
                          aria-label={subtask.title}
                        />

                        <span
                          className={
                            subtask.isCompleted
                              ? 'flex-1 text-sm text-body-subtle line-through'
                              : 'flex-1 text-sm text-body'
                          }
                        >
                          {subtask.title}
                        </span>

                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Delete ${subtask.title}`}
                            iconLeft={<Trash aria-hidden />}
                            onClick={() => {
                              void deleteSubtask.run(subtask._id).then((outcome) => {
                                if (outcome.ok) task.reload();
                              });
                            }}
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {canEdit && (
                  <form
                    className="flex items-center gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!newSubtask.trim()) return;
                      void createSubtask.run(newSubtask.trim()).then((outcome) => {
                        if (outcome.ok) {
                          setNewSubtask('');
                          // CONTRACT QUIRK: this endpoint returns the PARENT task
                          // under `data.subtask`, so there is no new subtask to
                          // read here. Refetch the task to pick it up.
                          task.reload();
                        }
                      });
                    }}
                  >
                    <Input
                      placeholder="Add a subtask"
                      value={newSubtask}
                      onChange={(event) => setNewSubtask(event.target.value)}
                      containerClassName="flex-1"
                    />

                    <Button
                      type="submit"
                      variant="secondary"
                      iconLeft={<Plus aria-hidden />}
                      loading={createSubtask.loading}
                      disabled={!newSubtask.trim()}
                    >
                      Add
                    </Button>
                  </form>
                )}
              </CardBody>
            </Card>

            {/* ---- comments ---- */}
            <Card>
              <CardHeader
                title="Comments"
                description={`${comments.data?.length ?? 0} on this task`}
              />

              <CardBody className="flex flex-col gap-4 p-4">
                {comments.loading && <Skeleton className="h-16 w-full" />}

                {comments.error && (
                  <ErrorState
                    title="Could not load comments"
                    description={comments.error.message}
                    onRetry={comments.reload}
                  />
                )}

                {!comments.loading && (comments.data ?? []).length === 0 && (
                  <p className="text-sm text-body-subtle">No comments yet.</p>
                )}

                <ul className="flex flex-col gap-4">
                  {(comments.data ?? []).map((comment) => {
                    const authorId = refId(comment.author);
                    const isEditing = editingCommentId === comment._id;

                    // Author-only, no role override.
                    const mayEdit = canEditComment(user?.id ?? null, authorId);
                    const mayDelete = canDeleteComment(
                      user?.id ?? null,
                      authorId,
                      projectRole,
                      workspaceRole
                    );

                    return (
                      <li key={comment._id} className="flex gap-3">
                        <Avatar name={refName(comment.author, '?')} size="sm" />

                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-body">
                              {refName(comment.author)}
                            </span>
                            <time
                              dateTime={comment.createdAt}
                              className="text-2xs text-body-subtle"
                              data-numeric
                            >
                              {new Date(comment.createdAt).toLocaleString()}
                            </time>
                            {comment.editedAt && (
                              <span className="text-2xs text-body-subtle">edited</span>
                            )}
                          </div>

                          {comment.isDeleted ? (
                            <p className="text-sm text-body-subtle italic">
                              This comment was deleted.
                            </p>
                          ) : isEditing ? (
                            <form
                              className="flex flex-col gap-2"
                              onSubmit={(event) => {
                                event.preventDefault();
                                void updateComment
                                  .run({
                                    commentId: comment._id,
                                    content: editingCommentBody,
                                  })
                                  .then((outcome) => {
                                    if (outcome.ok) {
                                      setEditingCommentId(null);
                                      comments.reload();
                                    }
                                  });
                              }}
                            >
                              <Textarea
                                rows={3}
                                value={editingCommentBody}
                                onChange={(event) => setEditingCommentBody(event.target.value)}
                              />

                              <div className="flex items-center gap-2">
                                <Button
                                  type="submit"
                                  variant="primary"
                                  size="sm"
                                  loading={updateComment.loading}
                                >
                                  Save
                                </Button>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => setEditingCommentId(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </form>
                          ) : (
                            <p className="whitespace-pre-wrap text-sm text-body-muted">
                              {comment.content}
                            </p>
                          )}

                          {!comment.isDeleted && !isEditing && (mayEdit || mayDelete) && (
                            <div className="flex items-center gap-1">
                              {mayEdit && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setEditingCommentId(comment._id);
                                    setEditingCommentBody(comment.content);
                                  }}
                                >
                                  Edit
                                </Button>
                              )}

                              {mayDelete && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setPendingCommentDelete(comment)}
                                >
                                  Delete
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {canEdit && (
                  <form
                    className="flex flex-col gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!newComment.trim()) return;
                      void createComment.run(newComment.trim()).then((outcome) => {
                        if (outcome.ok) {
                          setNewComment('');
                          comments.reload();
                        }
                      });
                    }}
                  >
                    <Textarea
                      label="Add a comment"
                      rows={3}
                      value={newComment}
                      onChange={(event) => setNewComment(event.target.value)}
                      error={createComment.error?.message}
                    />

                    <div className="flex justify-end">
                      <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        loading={createComment.loading}
                        disabled={!newComment.trim()}
                      >
                        Comment
                      </Button>
                    </div>
                  </form>
                )}
              </CardBody>
            </Card>
          </div>

          {/* ---- side column ---- */}
          <div className="flex flex-col gap-4">
            <Card>
              <CardBody className="flex flex-col gap-4 p-4">
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-body-muted">Status</span>
                  {canEdit ? (
                    <Select
                      aria-label="Status"
                      value={current.status}
                      options={TASK_STATUS_OPTIONS}
                      onValueChange={(value) => {
                        void setStatus.run(value as TaskStatus).then((outcome) => {
                          if (outcome.ok) task.setData(() => outcome.data.task);
                        });
                      }}
                    />
                  ) : (
                    <TaskStatusBadge status={current.status} />
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-body-muted">Priority</span>
                  {canEdit ? (
                    <Select
                      aria-label="Priority"
                      value={current.priority}
                      options={TASK_PRIORITY_OPTIONS}
                      onValueChange={(value) => {
                        void setPriority.run(value as TaskPriority).then((outcome) => {
                          if (outcome.ok) task.setData(() => outcome.data.task);
                        });
                      }}
                    />
                  ) : (
                    <TaskPriorityBadge priority={current.priority} />
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-body-muted">Assignee</span>
                  {canEdit && memberOptions.length > 0 ? (
                    <Select
                      aria-label="Assignee"
                      placeholder="Unassigned"
                      value={current.assignee ? (refId(current.assignee) ?? '') : ''}
                      options={memberOptions}
                      onValueChange={(value) => {
                        void setAssignee.run(value || null).then((outcome) => {
                          if (outcome.ok) task.setData(() => outcome.data.task);
                        });
                      }}
                    />
                  ) : (
                    <span className="text-sm text-body">
                      {current.assignee ? refName(current.assignee) : 'Unassigned'}
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-body-muted">Due date</span>
                  <span className="text-sm text-body" data-numeric>
                    {current.dueDate
                      ? new Date(current.dueDate).toLocaleDateString()
                      : 'Not set'}
                  </span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-body-muted">Estimate</span>
                  <span className="text-sm text-body" data-numeric>
                    {current.estimatedTime ? `${current.estimatedTime} min` : 'Not set'}
                  </span>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-body-muted">Created by</span>
                  <span className="text-sm text-body">{refName(current.createdBy, '—')}</span>
                </div>
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

      <ConfirmDialog
        open={pendingCommentDelete !== null}
        onOpenChange={(open) => !open && setPendingCommentDelete(null)}
        title="Delete this comment?"
        description="The comment will be marked as deleted. This cannot be undone."
        confirmLabel="Delete comment"
        tone="danger"
        loading={deleteComment.loading}
        onConfirm={() => {
          const comment = pendingCommentDelete;
          if (!comment) return;
          void deleteComment.run(comment._id).then((outcome) => {
            if (outcome.ok) {
              setPendingCommentDelete(null);
              comments.reload();
            }
          });
        }}
      />
    </>
  );
};
