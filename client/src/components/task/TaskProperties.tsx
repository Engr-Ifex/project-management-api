import { useParams } from 'react-router-dom';
import type { ReactNode } from 'react';

import { Input, Select, TaskPriorityBadge, TaskStatusBadge } from '@/components/ui';
import type { TaskPriority, TaskStatus } from '@/components/ui';
import type { Task } from '@/lib/api';
import { refId, refName, tasksApi } from '@/lib/api';
import { TASK_PRIORITY_OPTIONS, TASK_STATUS_OPTIONS } from '@/lib/constants';
import { useMutation } from '@/lib/hooks';
import { useWorkspace } from '@/lib/workspace/WorkspaceProvider';

/**
 * The task's own attributes, in the side column.
 *
 * Extracted from `TaskDetail`. The component **owns its mutations** rather than
 * taking them as props: they all hit the same `PATCH /tasks/:taskId` and all
 * resolve to the same "replace the task" step, so passing four callbacks in
 * would be four chances for the parent to wire one of them differently.
 *
 * Every field is read-only for a viewer, and shows a *badge* rather than a
 * disabled control — a greyed-out dropdown still looks like something you are
 * meant to be able to use.
 *
 * Scheduling note: `startDate`, `dueDate` and `estimatedTime` all go through the
 * same `PATCH` as everything else, because `updateTaskSchema` accepts them
 * together. A cleared date is sent as `null`, never omitted — omitting a key
 * means "leave it alone", so a cleared date would silently survive.
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

  const patch = useMutation(
    (body: {
      status?: TaskStatus;
      priority?: TaskPriority;
      assignee?: string | null;
      startDate?: string | null;
      dueDate?: string | null;
      estimatedTime?: number;
    }) => tasksApi.update(workspaceId, projectId, taskId, body)
  );

  const run = (body: Parameters<typeof patch.run>[0]) => {
    void patch.run(body).then((outcome) => {
      if (outcome.ok) onChanged(outcome.data.task);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <Field label="Status">
        {canEdit ? (
          <Select
            aria-label="Status"
            value={task.status}
            options={TASK_STATUS_OPTIONS}
            onValueChange={(value) => run({ status: value as TaskStatus })}
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
            onValueChange={(value) => run({ priority: value as TaskPriority })}
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
            onValueChange={(value) => run({ assignee: value || null })}
          />
        ) : (
          <span className="text-sm text-body">
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
            onChange={(event) => run({ startDate: toIsoOrNull(event.target.value) })}
          />
        ) : (
          <ReadOnly>{task.startDate ? formatDate(task.startDate) : 'Not set'}</ReadOnly>
        )}
      </Field>

      <Field label="Due date">
        {canEdit ? (
          <Input
            aria-label="Due date"
            type="date"
            value={toDateInputValue(task.dueDate)}
            onChange={(event) => run({ dueDate: toIsoOrNull(event.target.value) })}
          />
        ) : (
          <ReadOnly>{task.dueDate ? formatDate(task.dueDate) : 'Not set'}</ReadOnly>
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
            defaultValue={task.estimatedTime ?? ''}
            hint="Minutes."
            onBlur={(event) => {
              const raw = event.target.value.trim();
              const next = raw === '' ? 0 : Number(raw);

              if (!Number.isFinite(next) || next < 0) return;
              if (next === (task.estimatedTime ?? 0)) return;

              run({ estimatedTime: next });
            }}
          />
        ) : (
          <ReadOnly>{task.estimatedTime ? `${task.estimatedTime} min` : 'Not set'}</ReadOnly>
        )}
      </Field>

      <Field label="Created by">
        <span className="text-sm text-body">{refName(task.createdBy, '—')}</span>
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

const formatDate = (iso: string) => new Date(iso).toLocaleDateString();

/** A `<input type="date">` speaks `yyyy-mm-dd`; the API speaks ISO datetimes. */
const toDateInputValue = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '');

const toIsoOrNull = (value: string) => (value ? `${value}T00:00:00.000Z` : null);
