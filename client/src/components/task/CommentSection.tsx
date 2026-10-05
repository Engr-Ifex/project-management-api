import { useState } from 'react';
import { useParams } from 'react-router-dom';

import {
  Avatar,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  ErrorState,
  Pagination,
  Skeleton,
  Textarea,
} from '@/components/ui';
import type { Comment } from '@/lib/api';
import { commentsApi, refId, refName } from '@/lib/api';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useAsync, useMutation } from '@/lib/hooks';
import { canDeleteComment, canEditComment } from '@/lib/permissions';
import type { ProjectRole, WorkspaceRole } from '@/components/ui';
import { useWorkspace } from '@/lib/workspace/WorkspaceProvider';

/**
 * The comment thread on a task.
 *
 * Extracted from `TaskDetail`, which had grown past 890 lines and held five
 * unrelated concerns. This is the largest of them, and the only one with its own
 * mutations, editing state and confirmation dialog — it was never really part of
 * the task's own data.
 *
 * **Two different predicates, deliberately.** Editing is author-only with no
 * role override; deleting honours `comment:moderate`, so a project admin can
 * remove someone else's comment but cannot rewrite it. Collapsing them into one
 * "can manage comments" flag would silently over-grant.
 *
 * Roles arrive as props rather than being re-derived here: the parent already
 * resolved them, and a second derivation is a second thing to keep in step.
 */
export const CommentSection = ({
  taskId,
  canEdit,
  projectRole,
  workspaceRole,
}: {
  taskId: string;
  canEdit: boolean;
  projectRole: ProjectRole | null;
  workspaceRole: WorkspaceRole | null;
}) => {
  const { workspaceId } = useWorkspace();
  const { user } = useAuth();
  const { projectId = '' } = useParams<{ projectId: string }>();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [newComment, setNewComment] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState('');
  const [pendingDelete, setPendingDelete] = useState<Comment | null>(null);

  const comments = useAsync(
    () => commentsApi.list(workspaceId, projectId, taskId, { page, limit }),
    [workspaceId, projectId, taskId, page, limit]
  );

  const create = useMutation((content: string) =>
    commentsApi.create(workspaceId, projectId, taskId, content)
  );
  const update = useMutation((args: { commentId: string; content: string }) =>
    commentsApi.update(workspaceId, projectId, taskId, args.commentId, args.content)
  );
  const remove = useMutation((commentId: string) =>
    commentsApi.remove(workspaceId, projectId, taskId, commentId)
  );

  const list = comments.data?.comments ?? [];
  const pagination = comments.data?.pagination;

  const onCreate = async () => {
    if (!newComment.trim()) return;

    const outcome = await create.run(newComment.trim());
    if (!outcome.ok) return;

    setNewComment('');

    /*
     * Comments sort oldest-first (`COMMENT_DEFAULT_SORT` is `{createdAt: 1}`), so
     * a new one belongs on the last page — stepping there is the only way the
     * author sees what they just wrote. When that page is already current the
     * state does not change, so the reload has to be explicit.
     */
    const total = (pagination?.total ?? list.length) + 1;
    const lastPage = Math.max(1, Math.ceil(total / limit));

    if (lastPage === page) comments.reload();
    else setPage(lastPage);
  };

  return (
    <>
      <Card>
        <CardHeader
          title="Comments"
          // The total, not the page length — otherwise every page claims "20".
          description={`${pagination?.total ?? list.length} on this task`}
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

          {!comments.loading && list.length === 0 && (
            <p className="text-sm text-body-subtle">No comments yet.</p>
          )}

          <ul className="flex flex-col gap-4">
            {list.map((comment) => {
              const authorId = refId(comment.author);
              const isEditing = editingId === comment._id;

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
                      <p className="text-sm italic text-body-subtle">
                        This comment was deleted.
                      </p>
                    ) : isEditing ? (
                      <form
                        className="flex flex-col gap-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void update
                            .run({ commentId: comment._id, content: editingBody })
                            .then((outcome) => {
                              if (outcome.ok) {
                                setEditingId(null);
                                comments.reload();
                              }
                            });
                        }}
                      >
                        <Textarea
                          rows={3}
                          value={editingBody}
                          onChange={(event) => setEditingBody(event.target.value)}
                        />

                        <div className="flex items-center gap-2">
                          <Button
                            type="submit"
                            variant="primary"
                            size="sm"
                            loading={update.loading}
                          >
                            Save
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => setEditingId(null)}
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
                              setEditingId(comment._id);
                              setEditingBody(comment.content);
                            }}
                          >
                            Edit
                          </Button>
                        )}

                        {mayDelete && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPendingDelete(comment)}
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

          {canEdit && (
            <form
              className="flex flex-col gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void onCreate();
              }}
            >
              <Textarea
                label="Add a comment"
                rows={3}
                value={newComment}
                onChange={(event) => setNewComment(event.target.value)}
                error={create.error?.message}
              />

              <div className="flex justify-end">
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  loading={create.loading}
                  disabled={!newComment.trim()}
                >
                  Comment
                </Button>
              </div>
            </form>
          )}
        </CardBody>
      </Card>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this comment?"
        description="It will be replaced by a placeholder, so the thread keeps its shape."
        confirmLabel="Delete comment"
        tone="danger"
        loading={remove.loading}
        onConfirm={() => {
          const comment = pendingDelete;
          if (!comment) return;
          void remove.run(comment._id).then((outcome) => {
            if (outcome.ok) {
              setPendingDelete(null);
              comments.reload();
            }
          });
        }}
      />
    </>
  );
};
