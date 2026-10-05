import { Plus, Trash } from '@phosphor-icons/react';
import { useState } from 'react';
import { useParams } from 'react-router-dom';

import { Button, Card, CardBody, CardHeader, Checkbox, Input } from '@/components/ui';
import type { Subtask } from '@/lib/api';
import { tasksApi } from '@/lib/api';
import { useMutation } from '@/lib/hooks';
import { useWorkspace } from '@/lib/workspace/WorkspaceProvider';

/**
 * A task's checklist.
 *
 * Extracted from `TaskDetail`, which had grown past 890 lines.
 *
 * Subtasks are part of the task document, so **every mutation here refetches the
 * whole task** rather than patching a local copy — there is no separate subtask
 * resource to read back.
 *
 * One contract quirk is preserved deliberately: `POST /subtasks` returns the
 * *parent task* under `data.subtask`, not the new subtask, so a create cannot
 * read its own result. It refetches instead. The toggle and delete endpoints do
 * return the subtask, but they still refetch, because the header count comes
 * from the task itself and would otherwise drift.
 */
export const SubtaskList = ({
  subtasks,
  canEdit,
  onChanged,
}: {
  subtasks: Subtask[];
  canEdit: boolean;
  onChanged: () => void;
}) => {
  const { workspaceId } = useWorkspace();
  const { projectId = '', taskId = '' } = useParams<{ projectId: string; taskId: string }>();

  const [newTitle, setNewTitle] = useState('');

  const create = useMutation((title: string) =>
    tasksApi.createSubtask(workspaceId, projectId, taskId, title)
  );
  const toggle = useMutation((args: { subtaskId: string; isCompleted: boolean }) =>
    tasksApi.updateSubtask(workspaceId, projectId, taskId, args.subtaskId, {
      isCompleted: args.isCompleted,
    })
  );
  const remove = useMutation((subtaskId: string) =>
    tasksApi.deleteSubtask(workspaceId, projectId, taskId, subtaskId)
  );

  const done = subtasks.filter((subtask) => subtask.isCompleted).length;

  return (
    <Card>
      <CardHeader
        title="Subtasks"
        description={subtasks.length > 0 ? `${done} of ${subtasks.length} complete` : undefined}
      />

      <CardBody className="flex flex-col gap-3 p-4">
        {subtasks.length > 0 && (
          <ul className="flex flex-col divide-y divide-line-subtle">
            {subtasks.map((subtask) => (
              <li key={subtask._id} className="flex items-center gap-3 py-2">
                <Checkbox
                  checked={subtask.isCompleted}
                  disabled={!canEdit}
                  onCheckedChange={(checked) => {
                    void toggle
                      .run({ subtaskId: subtask._id, isCompleted: checked === true })
                      .then((outcome) => {
                        if (outcome.ok) onChanged();
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
                      void remove.run(subtask._id).then((outcome) => {
                        if (outcome.ok) onChanged();
                      });
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        )}

        {subtasks.length === 0 && (
          <p className="text-sm text-body-subtle">No subtasks yet.</p>
        )}

        {canEdit && (
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!newTitle.trim()) return;

              void create.run(newTitle.trim()).then((outcome) => {
                if (outcome.ok) {
                  setNewTitle('');
                  // CONTRACT QUIRK: this endpoint returns the PARENT task under
                  // `data.subtask`, so there is no new subtask to read here.
                  onChanged();
                }
              });
            }}
          >
            <Input
              placeholder="Add a subtask"
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              containerClassName="flex-1"
            />

            <Button
              type="submit"
              variant="secondary"
              iconLeft={<Plus aria-hidden />}
              loading={create.loading}
              disabled={!newTitle.trim()}
            >
              Add
            </Button>
          </form>
        )}
      </CardBody>
    </Card>
  );
};
