import { Archive, ArrowCounterClockwise, Plus } from '@phosphor-icons/react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  Button,
  Card,
  CardBody,
  ConfirmDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ErrorState,
  Input,
  LabelChip,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Pagination,
  Select,
  TaskPriorityBadge,
  TaskStatusBadge,
  Table,
  TableMessage,
  TableSkeletonRows,
  TableWrapper,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Textarea,
} from '@/components/ui';
import type { TaskPriority, TaskStatus } from '@/components/ui';
import type { Project, Task } from '@/lib/api';
import { refId, refName, tasksApi } from '@/lib/api';
import { useAsync, useDebounced, useMutation } from '@/lib/hooks';
import { useProjectRole, useWorkspace } from '@/lib/workspace/WorkspaceProvider';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'todo', label: 'To do' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'in_review', label: 'In review' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const PRIORITY_OPTIONS = [
  { value: 'all', label: 'Any priority' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const CREATE_PRIORITY = PRIORITY_OPTIONS.filter((option) => option.value !== 'all');

/**
 * The task list for a project.
 *
 * Two contract details shape this screen:
 *
 * 1. **`unassigned` is the string `"true"`, not a boolean.** It is sent as a
 *    string by `toQueryString`, which exists precisely so no call site has to
 *    remember this.
 * 2. **The assignee picker is only offered when `project.members` is present.**
 *    Assigning to a non-member is a 400, and `members` is omitted entirely for a
 *    caller without project access — so the picker would be guessing. When the
 *    list is absent the field is hidden rather than shown empty.
 */
export const TasksTab = ({ project }: { project: Project }) => {
  const { workspaceId } = useWorkspace();
  const { projectRole } = useProjectRole(project.members);
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [priority, setPriority] = useState('all');
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [archivedOnly, setArchivedOnly] = useState(false);
  const [sortBy, setSortBy] = useState('position');
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');

  const debouncedSearch = useDebounced(search);

  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignee, setAssignee] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [estimate, setEstimate] = useState('');
  const [createPriority, setCreatePriority] = useState<TaskPriority>('medium');

  const [pendingArchive, setPendingArchive] = useState<Task | null>(null);

  const { data, error, loading, reload, setData } = useAsync(
    () =>
      tasksApi.list(workspaceId, project._id, {
        page,
        limit,
        sortBy,
        order,
        search: debouncedSearch || undefined,
        status: status === 'all' ? undefined : status,
        priority: priority === 'all' ? undefined : priority,
        unassigned: unassignedOnly ? true : undefined,
        isArchived: archivedOnly ? true : false,
      }),
    [
      workspaceId,
      project._id,
      page,
      limit,
      sortBy,
      order,
      debouncedSearch,
      status,
      priority,
      unassignedOnly,
      archivedOnly,
    ]
  );

  const create = useMutation((body: Parameters<typeof tasksApi.create>[2]) =>
    tasksApi.create(workspaceId, project._id, body)
  );
  const archive = useMutation((taskId: string) =>
    tasksApi.archive(workspaceId, project._id, taskId)
  );
  const restore = useMutation((taskId: string) =>
    tasksApi.restore(workspaceId, project._id, taskId)
  );

  const tasks = data?.tasks ?? [];
  const pagination = data?.pagination;

  const filtered =
    Boolean(debouncedSearch) ||
    status !== 'all' ||
    priority !== 'all' ||
    unassignedOnly ||
    archivedOnly;

  const canCreate = projectRole !== 'viewer';
  const canArchive = projectRole === 'owner' || projectRole === 'admin';

  const clearFilters = () => {
    setSearch('');
    setStatus('all');
    setPriority('all');
    setUnassignedOnly(false);
    setArchivedOnly(false);
    setPage(1);
  };

  const toggleSort = (column: string) => {
    if (sortBy === column) {
      setOrder((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setOrder('asc');
    }
    setPage(1);
  };

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();

    const outcome = await create.run({
      title,
      ...(description.trim() ? { description } : {}),
      ...(assignee ? { assignee } : {}),
      ...(dueDate ? { dueDate } : {}),
      ...(estimate ? { estimatedTime: Number(estimate) } : {}),
      priority: createPriority,
    });

    if (outcome.ok) {
      setCreateOpen(false);
      setTitle('');
      setDescription('');
      setAssignee('');
      setDueDate('');
      setEstimate('');
      setCreatePriority('medium');
      reload();
    }
  };

  const memberOptions = (project.members ?? []).map((member) => ({
    value: refId(member.user) ?? '',
    label: refName(member.user),
  }));

  return (
    <>
      <div className="flex flex-col gap-4">
        <Card>
          <CardBody className="flex flex-wrap items-end gap-3 p-3">
            <Input
              placeholder="Search tasks"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              containerClassName="min-w-56 flex-1"
            />

            <Select
              aria-label="Status"
              value={status}
              onValueChange={(value) => {
                setStatus(value);
                setPage(1);
              }}
              options={STATUS_OPTIONS}
              className="w-36"
            />

            <Select
              aria-label="Priority"
              value={priority}
              onValueChange={(value) => {
                setPriority(value);
                setPage(1);
              }}
              options={PRIORITY_OPTIONS}
              className="w-36"
            />

            <Select
              aria-label="Assignment"
              value={unassignedOnly ? 'unassigned' : 'all'}
              onValueChange={(value) => {
                setUnassignedOnly(value === 'unassigned');
                setPage(1);
              }}
              options={[
                { value: 'all', label: 'Anyone' },
                { value: 'unassigned', label: 'Unassigned' },
              ]}
              className="w-36"
            />

            <Select
              aria-label="Archive filter"
              value={archivedOnly ? 'archived' : 'active'}
              onValueChange={(value) => {
                setArchivedOnly(value === 'archived');
                setPage(1);
              }}
              options={[
                { value: 'active', label: 'Active' },
                { value: 'archived', label: 'Archived' },
              ]}
              className="w-32"
            />

            {canCreate && (
              <Button
                variant="primary"
                iconLeft={<Plus aria-hidden />}
                onClick={() => setCreateOpen(true)}
              >
                New task
              </Button>
            )}
          </CardBody>
        </Card>

        <div className="overflow-hidden rounded-lg border border-line bg-surface">
          {error ? (
            <ErrorState title="Could not load tasks" description={error.message} onRetry={reload} />
          ) : (
            <TableWrapper>
              <Table>
                <THead>
                  <TR>
                    <TH
                      sortDirection={sortBy === 'title' ? order : false}
                      onSort={() => toggleSort('title')}
                    >
                      Task
                    </TH>
                    <TH
                      sortDirection={sortBy === 'status' ? order : false}
                      onSort={() => toggleSort('status')}
                    >
                      Status
                    </TH>
                    <TH
                      sortDirection={sortBy === 'priority' ? order : false}
                      onSort={() => toggleSort('priority')}
                    >
                      Priority
                    </TH>
                    <TH>Assignee</TH>
                    <TH
                      sortDirection={sortBy === 'dueDate' ? order : false}
                      onSort={() => toggleSort('dueDate')}
                    >
                      Due
                    </TH>
                    <TH>
                      <span className="sr-only">Actions</span>
                    </TH>
                  </TR>
                </THead>

                <TBody>
                  {loading && <TableSkeletonRows rows={6} columns={6} />}

                  {!loading && tasks.length === 0 && (
                    <TableMessage colSpan={6}>
                      <span className="text-sm text-body-muted">
                        {filtered
                          ? 'No tasks match these filters.'
                          : archivedOnly
                            ? 'No archived tasks.'
                            : 'No tasks yet in this project.'}
                      </span>
                      {filtered && (
                        <div className="mt-3">
                          <Button variant="secondary" size="sm" onClick={clearFilters}>
                            Clear filters
                          </Button>
                        </div>
                      )}
                    </TableMessage>
                  )}

                  {!loading &&
                    tasks.map((task) => (
                      <TR
                        key={task._id}
                        interactive
                        onClick={() =>
                          navigate(
                            `/workspaces/${workspaceId}/projects/${project._id}/tasks/${task._id}`
                          )
                        }
                      >
                        <TD primary>
                          <span className="flex flex-col gap-1">
                            <span className="truncate">{task.title}</span>
                            {task.labels.length > 0 && (
                              <span className="flex flex-wrap gap-1">
                                {task.labels.map((label) => (
                                  <LabelChip
                                    key={label._id}
                                    name={label.name}
                                    color={label.color}
                                  />
                                ))}
                              </span>
                            )}
                          </span>
                        </TD>

                        <TD>
                          <TaskStatusBadge status={task.status} />
                        </TD>

                        <TD>
                          <TaskPriorityBadge priority={task.priority} />
                        </TD>

                        <TD>{task.assignee ? refName(task.assignee, '—') : '—'}</TD>

                        <TD numeric>
                          {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '—'}
                        </TD>

                        {/* Row actions must not also trigger the row's navigation. */}
                        <TD onClick={(event) => event.stopPropagation()}>
                          {canArchive && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  Actions
                                </Button>
                              </DropdownMenuTrigger>

                              <DropdownMenuContent align="end">
                                {task.isArchived ? (
                                  <DropdownMenuItem
                                    icon={<ArrowCounterClockwise aria-hidden />}
                                    onSelect={() => {
                                      void restore.run(task._id).then((outcome) => {
                                        if (!outcome.ok) return;
                                        setData((current) =>
                                          current
                                            ? {
                                                ...current,
                                                tasks: current.tasks.filter(
                                                  (entry) => entry._id !== task._id
                                                ),
                                              }
                                            : current
                                        );
                                      });
                                    }}
                                  >
                                    Restore task
                                  </DropdownMenuItem>
                                ) : (
                                  <DropdownMenuItem
                                    icon={<Archive aria-hidden />}
                                    destructive
                                    onSelect={() => setPendingArchive(task)}
                                  >
                                    Archive task
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </TD>
                      </TR>
                    ))}
                </TBody>
              </Table>
            </TableWrapper>
          )}

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
        </div>
      </div>

      <Modal open={createOpen} onOpenChange={setCreateOpen}>
        <ModalContent>
          <form onSubmit={onCreate}>
            <ModalHeader title="New task" description={`In ${project.name}`} />

            <ModalBody className="flex flex-col gap-4">
              {create.error && !create.error.fieldError('title') && (
                <p role="alert" className="text-xs text-danger-700">
                  {create.error.message}
                </p>
              )}

              <Input
                label="Title"
                required
                autoFocus
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                error={create.error?.fieldError('title')}
              />

              <Textarea
                label="Description"
                rows={3}
                hint="Optional."
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />

              <div className="grid grid-cols-2 gap-3">
                {/* Only offered when the API gave us the member list — see the note above. */}
                {memberOptions.length > 0 && (
                  <Select
                    label="Assignee"
                    placeholder="Unassigned"
                    value={assignee}
                    onValueChange={setAssignee}
                    options={memberOptions}
                  />
                )}

                <Select
                  label="Priority"
                  value={createPriority}
                  onValueChange={(value) => setCreatePriority(value as TaskPriority)}
                  options={CREATE_PRIORITY.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                />

                <Input
                  label="Due date"
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  hint="Optional."
                />

                <Input
                  label="Estimate"
                  type="number"
                  min={0}
                  suffix="min"
                  value={estimate}
                  onChange={(event) => setEstimate(event.target.value)}
                  hint="Optional."
                />
              </div>
            </ModalBody>

            <ModalFooter>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setCreateOpen(false)}
                disabled={create.loading}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={create.loading}>
                Create task
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>

      <ConfirmDialog
        open={pendingArchive !== null}
        onOpenChange={(open) => !open && setPendingArchive(null)}
        title="Archive this task?"
        description="It will be hidden from the active list. Nothing is deleted, and it can be restored."
        confirmLabel="Archive task"
        tone="danger"
        loading={archive.loading}
        onConfirm={() => {
          const task = pendingArchive;
          if (!task) return;
          void archive.run(task._id).then((outcome) => {
            if (!outcome.ok) return;
            setData((current) =>
              current
                ? {
                    ...current,
                    tasks: current.tasks.filter((entry) => entry._id !== task._id),
                  }
                : current
            );
            setPendingArchive(null);
          });
        }}
      />
    </>
  );
};

/** Re-exported so the task detail screen shares the status vocabulary. */
export const TASK_STATUS_OPTIONS: { value: TaskStatus; label: string }[] = STATUS_OPTIONS.filter(
  (option) => option.value !== 'all'
) as { value: TaskStatus; label: string }[];
