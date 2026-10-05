import { Archive, ArrowCounterClockwise, Plus } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

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
import type { TaskPriority } from '@/components/ui';
import type { Project, Task } from '@/lib/api';
import { labelsApi, refId, refName, tasksApi } from '@/lib/api';
import {
  FILTER_ALL,
  TASK_ARCHIVE_FILTER_OPTIONS,
  TASK_PRIORITY_FILTER_OPTIONS,
  TASK_PRIORITY_OPTIONS,
  TASK_STATUS_FILTER_OPTIONS,
} from '@/lib/constants';
import { useAsync, useDebounced, useMutation } from '@/lib/hooks';
import { useProjectRole, useWorkspace } from '@/lib/workspace/WorkspaceProvider';

/**
 * Every query parameter this screen owns. "Clear filters" removes exactly these
 * and leaves anything else in the URL alone, so a shared link keeps its other
 * parameters.
 */
const FILTER_PARAM_KEYS = [
  'search',
  'page',
  'status',
  'priority',
  'assignee',
  'unassigned',
  'archived',
  'label',
  'dueFrom',
  'dueTo',
  'startFrom',
  'startTo',
] as const;

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
 *
 * `assignee` and `unassigned` are one control, not two: the API rejects a request
 * that sets both, so offering them separately would let a user build a query the
 * server refuses.
 */
export const TasksTab = ({ project }: { project: Project }) => {
  const { workspaceId } = useWorkspace();
  const { projectRole } = useProjectRole(project.members);
  const navigate = useNavigate();

  /*
   * Every list filter lives in the URL rather than in component state.
   *
   * A filter you cannot link to is a filter you lose: reload the page, or come
   * back from a task with the browser's back button, and the list silently
   * resets to "everything". The query string makes a filtered list addressable
   * and makes Back mean "the previous view" instead of "the previous page of an
   * unfiltered list".
   */
  const [searchParams, setSearchParams] = useSearchParams();

  const param = (key: string, fallback: string) => searchParams.get(key) ?? fallback;

  const page = Math.max(1, Number(param('page', '1')) || 1);
  const limit = Number(param('limit', '20')) || 20;
  const status = param('status', FILTER_ALL);
  const priority = param('priority', FILTER_ALL);
  const assigneeFilter = param('assignee', FILTER_ALL);
  const unassignedOnly = param('unassigned', 'false') === 'true';
  const archivedOnly = param('archived', 'false') === 'true';
  const labelFilter = param('label', FILTER_ALL);
  const dueFrom = param('dueFrom', '');
  const dueTo = param('dueTo', '');
  const startFrom = param('startFrom', '');
  const startTo = param('startTo', '');
  const sortBy = param('sortBy', 'position');
  const order = param('order', 'asc') === 'desc' ? 'desc' : 'asc';

  /*
   * Search is the one control that cannot write on every keystroke, so the input
   * stays local and the *debounced* value is mirrored into the URL. Returning
   * `prev` unchanged when nothing differs is what stops this from fighting its
   * own write (and from re-adding a search term that `clearFilters` just removed).
   */
  const [searchInput, setSearchInput] = useState(() => param('search', ''));
  const debouncedSearch = useDebounced(searchInput);

  useEffect(() => {
    setSearchParams(
      (prev) => {
        if ((prev.get('search') ?? '') === debouncedSearch) return prev;

        const next = new URLSearchParams(prev);
        if (debouncedSearch) next.set('search', debouncedSearch);
        else next.delete('search');
        next.delete('page');

        return next;
      },
      { replace: true }
    );
  }, [debouncedSearch, setSearchParams]);

  /** Merge a patch into the query string. Empty / "all" / false clears the key. */
  const setParams = (patch: Record<string, string | number | boolean | undefined>) => {
    const next = new URLSearchParams(searchParams);

    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === '' || value === FILTER_ALL || value === false) {
        next.delete(key);
      } else {
        next.set(key, String(value));
      }
    }

    setSearchParams(next, { replace: true });
  };

  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [createAssignee, setCreateAssignee] = useState('');
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
        status: status === FILTER_ALL ? undefined : status,
        priority: priority === FILTER_ALL ? undefined : priority,
        assignee: assigneeFilter === FILTER_ALL ? undefined : assigneeFilter,
        unassigned: unassignedOnly ? true : undefined,
        labels: labelFilter === FILTER_ALL ? undefined : labelFilter,
        dueDateFrom: dueFrom || undefined,
        dueDateTo: dueTo || undefined,
        startDateFrom: startFrom || undefined,
        startDateTo: startTo || undefined,
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
      assigneeFilter,
      unassignedOnly,
      archivedOnly,
      labelFilter,
      dueFrom,
      dueTo,
      startFrom,
      startTo,
    ]
  );

  const labels = useAsync(
    () => labelsApi.list(workspaceId, project._id, { limit: 100 }).then((result) => result.labels),
    [workspaceId, project._id]
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
    status !== FILTER_ALL ||
    priority !== FILTER_ALL ||
    assigneeFilter !== FILTER_ALL ||
    labelFilter !== FILTER_ALL ||
    unassignedOnly ||
    archivedOnly ||
    Boolean(dueFrom) ||
    Boolean(dueTo) ||
    Boolean(startFrom) ||
    Boolean(startTo);

  const canCreate = projectRole !== 'viewer';
  const canArchive = projectRole === 'owner' || projectRole === 'admin';

  const clearFilters = () => {
    setSearchInput('');

    const next = new URLSearchParams(searchParams);
    for (const key of FILTER_PARAM_KEYS) next.delete(key);
    setSearchParams(next, { replace: true });
  };

  const toggleSort = (column: string) => {
    setParams({
      sortBy: column,
      order: sortBy === column && order === 'asc' ? 'desc' : 'asc',
      page: undefined,
    });
  };

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();

    const outcome = await create.run({
      title,
      ...(description.trim() ? { description } : {}),
      ...(createAssignee ? { assignee: createAssignee } : {}),
      ...(dueDate ? { dueDate } : {}),
      ...(estimate ? { estimatedTime: Number(estimate) } : {}),
      priority: createPriority,
    });

    if (outcome.ok) {
      setCreateOpen(false);
      setTitle('');
      setDescription('');
      setCreateAssignee('');
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

  const labelOptions = (labels.data ?? []).map((label) => ({
    value: label._id,
    label: label.name,
  }));

  return (
    <>
      <div className="flex flex-col gap-4">
        <Card>
          <CardBody className="flex flex-col gap-3 p-3">
            <div className="flex flex-wrap items-end gap-3">
              <Input
                placeholder="Search tasks"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                containerClassName="min-w-56 flex-1"
              />

              <Select
                aria-label="Status"
                value={status}
                onValueChange={(value) => setParams({ status: value, page: undefined })}
                options={TASK_STATUS_FILTER_OPTIONS}
                className="w-36"
              />

              <Select
                aria-label="Priority"
                value={priority}
                onValueChange={(value) => setParams({ priority: value, page: undefined })}
                options={TASK_PRIORITY_FILTER_OPTIONS}
                className="w-36"
              />

              {/*
                One control for both `assignee` and `unassigned`. The API rejects
                a query that sets both (`assignee and unassigned cannot be used
                together`), so choosing one clears the other — two separate
                controls would let a user build a request the server refuses.
              */}
              <Select
                aria-label="Assignee"
                value={unassignedOnly ? 'unassigned' : assigneeFilter}
                onValueChange={(value) =>
                  value === 'unassigned'
                    ? setParams({ unassigned: true, assignee: undefined, page: undefined })
                    : setParams({ assignee: value, unassigned: undefined, page: undefined })
                }
                options={[
                  { value: FILTER_ALL, label: 'Anyone' },
                  { value: 'unassigned', label: 'Unassigned' },
                  ...memberOptions,
                ]}
                className="w-40"
              />

              <Select
                aria-label="Label"
                value={labelFilter}
                onValueChange={(value) => setParams({ label: value, page: undefined })}
                options={[{ value: FILTER_ALL, label: 'Any label' }, ...labelOptions]}
                className="w-36"
              />

              <Select
                aria-label="Archive filter"
                value={archivedOnly ? 'archived' : 'active'}
                onValueChange={(value) =>
                  setParams({ archived: value === 'archived', page: undefined })
                }
                options={TASK_ARCHIVE_FILTER_OPTIONS}
                className="w-32"
              />

              {filtered && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              )}

              {canCreate && (
                <Button
                  variant="primary"
                  iconLeft={<Plus aria-hidden />}
                  onClick={() => setCreateOpen(true)}
                  className="ml-auto"
                >
                  New task
                </Button>
              )}
            </div>

            {/* Date ranges are a second row: four more controls on one line
                would push the primary filters off screen on a laptop. */}
            <div className="flex flex-wrap items-end gap-3">
              <span className="pb-1.5 text-2xs uppercase tracking-wide text-body-subtle">
                Due between
              </span>

              <Input
                aria-label="Due from"
                type="date"
                value={dueFrom}
                onChange={(event) => setParams({ dueFrom: event.target.value, page: undefined })}
                containerClassName="w-40"
              />

              <Input
                aria-label="Due to"
                type="date"
                value={dueTo}
                onChange={(event) => setParams({ dueTo: event.target.value, page: undefined })}
                containerClassName="w-40"
              />

              <span className="pb-1.5 pl-2 text-2xs uppercase tracking-wide text-body-subtle">
                Starts between
              </span>

              <Input
                aria-label="Start from"
                type="date"
                value={startFrom}
                onChange={(event) => setParams({ startFrom: event.target.value, page: undefined })}
                containerClassName="w-40"
              />

              <Input
                aria-label="Start to"
                type="date"
                value={startTo}
                onChange={(event) => setParams({ startTo: event.target.value, page: undefined })}
                containerClassName="w-40"
              />
            </div>
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
              onPageChange={(next) => setParams({ page: next })}
              onLimitChange={(next) => setParams({ limit: next, page: undefined })}
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
                    value={createAssignee}
                    onValueChange={setCreateAssignee}
                    options={memberOptions}
                  />
                )}

                <Select
                  label="Priority"
                  value={createPriority}
                  onValueChange={(value) => setCreatePriority(value as TaskPriority)}
                  options={TASK_PRIORITY_OPTIONS}
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
