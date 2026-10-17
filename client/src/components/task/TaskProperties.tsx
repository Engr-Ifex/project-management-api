import { useParams } from 'react-router-dom';
import type { ReactNode } from 'react';

import { Input, Select, TaskPriorityBadge, TaskStatusBadge } from '@/components/ui';
import type { TaskPriority, TaskStatus } from '@/components/ui';
import type { Task } from '@/lib/api';
import { refId, refName, tasksApi } from '@/lib/api';
import { TASK_PRIORITY_OPTIONS, TASK_STATUS_OPTIONS } from '@/lib/constants';
import { useMutation } from '@/lib/hooks';
import type { MutationOutcome } from '@/lib/hooks';
import { formatCalendarDate, fromDateInputValue, toDateInputValue } from '@/lib/utils/format';
import { useWorkspace } from '@/lib/workspace/WorkspaceProvider';

/**
 * The task's own attributes, in the side column.
 *
 * Extracted from `TaskDetail`. The component **owns its mutations** rather than
 * taking them as props: they all resolve to the same "replace the task" step, so
 * passing callbacks in would be chances for the parent to wire one differently.
 *
 * Every field is read-only for a viewer, and shows a *badge* rather than a
 * disabled control — a greyed-out dropdown still looks like something you are
 * meant to be able to use.
 *
 * **Three fields have their own endpoints, and this matters.** `PATCH
 * /tasks/:taskId` is validated by `updateTaskSchema`, which accepts only
 * `title`, `description`, `startDate`, `dueDate` and `estimatedTime`. Status,
 * priority and assignee are validated by `updateTaskStatusSchema`,
 * `updateTaskPrioritySchema` and `assignTaskSchema`, each mounted on its own
 * route. Zod strips unknown keys, so sending `{ status }` to the generic PATCH
 * arrived as an empty body and tripped the "at least one field must be provided
 * for update" refinement — a 400 on every attempt, which is why changing status,
 * priority or assignee appeared to do nothing at all.
 *
 * TypeScript did not catch it because the body was passed as a variable, and
 * structural typing allows extra properties on a non-literal — the object
 * satisfied `updateTaskSchema`'s TypeScript shape while carrying keys the
 * runtime schema rejected.
 *
 * Scheduling note: `startDate`, `dueDate` and `estimatedTime` do share the
 * generic PATCH, because `updateTaskSchema` accepts them together. A cleared
 * date is sent as `null`, never omitted — omitting a key means "leave it alone",
 * so a cleared date would silently survive.
 */
export const TaskProperties = ({
  task,
  canEdit,
  memberOptions,
  onChanged,
}: {
  task: Task;
  canEdit: boolean;
  memberOptions: { value: string; label: string }[];
  onChanged: (next: Task) => void;
}) => {
  const { workspaceId } = useWorkspace();
  const { projectId = '', taskId = '' } = useParams<{ projectId: string; taskId: string }>();

  const statusUpdate = useMutation((status: TaskStatus) =>
    tasksApi.setStatus(workspaceId, projectId, taskId, status)
  );

  const priorityUpdate = useMutation((priority: TaskPriority) =>
    tasksApi.setPriority(workspaceId, projectId, taskId, priority)
  );

  const assigneeUpdate = useMutation((assignee: string | null) =>
    tasksApi.setAssignee(workspaceId, projectId, taskId, assignee)
  );

  // Only the fields `updateTaskSchema` actually accepts.
  const detailsUpdate = useMutation(
    (body: { startDate?: string | null; dueDate?: string | null; estimatedTime?: number }) =>
      tasksApi.update(workspaceId, projectId, taskId, body)
  );

  const updates = [statusUpdate, priorityUpdate, assigneeUpdate, detailsUpdate];
  const busy = updates.some((update) => update.loading);
  const failure = updates.find((update) => update.error)?.error;

  /*
   * Every endpoint returns `{ task }`, so the success path is identical. The
   * task is only replaced once the server has confirmed it — an optimistic
   * update would leave the UI showing a value the server rejected.
   */
  const commit = (result: Promise<MutationOutcome<{ task: Task }>>) => {
    void result.then((outcome) => {
      if (outcome.ok) onChanged(outcome.data.task);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {failure && (
        <p role="alert" className="text-xs text-danger-700">
          {failure.message}
        </p>
      )}

      <Field label="Status">
        {canEdit ? (
          <Select
            aria-label="Status"
            value={task.status}
            options={TASK_STATUS_OPTIONS}
            disabled={busy}
            onValueChange={(value) => commit(statusUpdate.run(value as TaskStatus))}
          />
        ) : (
          <TaskStatusBadge status={task.status} />
        )}
      </Field>

      <Field label="Priority">
        {canEdit ? (
          <Select
            aria-label="Priority"
            value={task.priority}
            options={TASK_PRIORITY_OPTIONS}
            disabled={busy}
            onValueChange={(value) => commit(priorityUpdate.run(value as TaskPriority))}
          />
        ) : (
          <TaskPriorityBadge priority={task.priority} />
        )}
      </Field>

      <Field label="Assignee">
        {/* Only offered when the API gave us the member list — see TasksTab. */}
        {canEdit && memberOptions.length > 0 ? (
          <Select
            aria-label="Assignee"
            placeholder="Unassigned"
            value={task.assignee ? (refId(task.assignee) ?? '') : ''}
            options={memberOptions}
            disabled={busy}
            onValueChange={(value) => commit(assigneeUpdate.run(value || null))}
          />
        ) : (
          <span className="break-words text-sm text-body">
            {task.assignee ? refName(task.assignee) : 'Unassigned'}
          </span>
        )}
      </Field>

      <Field label="Start date">
        {canEdit ? (
          <Input
            aria-label="Start date"
            type="date"
            value={toDateInputValue(task.startDate)}
            disabled={busy}
            onChange={(event) =>
              commit(detailsUpdate.run({ startDate: fromDateInputValue(event.target.value) }))
            }
          />
        ) : (
          <ReadOnly>{task.startDate ? formatCalendarDate(task.startDate) : 'Not set'}</ReadOnly>
        )}
      </Field>

      <Field label="Due date">
        {canEdit ? (
          <Input
            aria-label="Due date"
            type="date"
            value={toDateInputValue(task.dueDate)}
            disabled={busy}
            onChange={(event) =>
              commit(detailsUpdate.run({ dueDate: fromDateInputValue(event.target.value) }))
            }
          />
        ) : (
          <ReadOnly>{task.dueDate ? formatCalendarDate(task.dueDate) : 'Not set'}</ReadOnly>
        )}
      </Field>

      <Field label="Estimate">
        {canEdit ? (
          <Input
            /*
             * Uncontrolled, keyed on the stored value: committing on every
             * keystroke would fire a request per digit, and a controlled field
             * would need syncing back from the server on each response.
             * Remounting on a changed value keeps the box honest without either.
             */
            key={`estimate-${task.estimatedTime ?? 'none'}`}
            aria-label="Estimate in minutes"
            type="number"
            min={0}
            disabled={busy}
            defaultValue={task.estimatedTime ?? ''}
            hint="Minutes."
            onBlur={(event) => {
              const raw = event.target.value.trim();
              const next = raw === '' ? 0 : Number(raw);

              if (!Number.isFinite(next) || next < 0) return;
              if (next === (task.estimatedTime ?? 0)) return;

              commit(detailsUpdate.run({ estimatedTime: next }));
            }}
          />
        ) : (
          <ReadOnly>{task.estimatedTime ? `${task.estimatedTime} min` : 'Not set'}</ReadOnly>
        )}
      </Field>

      <Field label="Created by">
        <span className="break-words text-sm text-body">{refName(task.createdBy, '—')}</span>
      </Field>
    </div>
  );
};

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-xs font-medium text-body-muted">{label}</span>
    {children}
  </div>
);

const ReadOnly = ({ children }: { children: ReactNode }) => (
  <span className="text-sm text-body" data-numeric>
    {children}
  </span>
);
