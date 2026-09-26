import { Plus } from '@phosphor-icons/react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { PageContainer } from '@/components/PageContainer';
import {
  Button,
  Card,
  CardBody,
  ErrorState,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Pagination,
  ProjectStatusBadge,
  Select,
  Table,
  TableMessage,
  TableSkeletonRows,
  TableWrapper,
  TBody,
  TD,
  TH,
  THead,
  Textarea,
  TR,
} from '@/components/ui';
import { projectsApi } from '@/lib/api';
import { useAsync, useDebounced, useDocumentTitle, useMutation, usePermission } from '@/lib/hooks';
import { useWorkspace } from '@/lib/workspace/WorkspaceProvider';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'planning', label: 'Planning' },
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const ARCHIVE_OPTIONS = [
  { value: 'false', label: 'Active projects' },
  { value: 'true', label: 'Archived only' },
];

/**
 * The project list.
 *
 * Note what the create button is gated on: `can.manageProjects` is a *workspace*
 * capability. A project owner cannot create or archive projects — project
 * lifecycle is a workspace-level operation — so gating on a project role here
 * would be wrong in a way that is easy to miss until someone gets a 403.
 */
export const Projects = () => {
  useDocumentTitle('Projects');

  const { workspaceId } = useWorkspace();
  const navigate = useNavigate();
  const { can } = usePermission();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [isArchived, setIsArchived] = useState('false');
  const [sortBy, setSortBy] = useState('updatedAt');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');

  const debouncedSearch = useDebounced(search);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [color, setColor] = useState('#348579');

  const { data, error, loading, reload } = useAsync(
    () =>
      projectsApi.list(workspaceId, {
        page,
        limit,
        sortBy,
        order,
        search: debouncedSearch || undefined,
        status: status === 'all' ? undefined : status,
        isArchived,
      }),
    [workspaceId, page, limit, sortBy, order, debouncedSearch, status, isArchived]
  );

  const create = useMutation(projectsApi.create);

  const projects = data?.projects ?? [];
  const pagination = data?.pagination;
  const filtered = Boolean(debouncedSearch) || status !== 'all' || isArchived === 'true';

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
    const outcome = await create.run(workspaceId, {
      name,
      ...(description.trim() ? { description } : {}),
      ...(deadline ? { deadline } : {}),
      ...(color ? { color } : {}),
    });

    if (outcome.ok) {
      setCreateOpen(false);
      setName('');
      setDescription('');
      setDeadline('');
      navigate(`/workspaces/${workspaceId}/projects/${outcome.data.project._id}`);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-4 py-4 lg:px-6">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-semibold text-body">Projects</h1>
          <p className="text-xs text-body-muted">
            {pagination ? `${pagination.total} total` : 'Everything in this workspace'}
          </p>
        </div>

        {can.manageProjects && (
          <Button
            variant="primary"
            iconLeft={<Plus aria-hidden />}
            onClick={() => setCreateOpen(true)}
          >
            New project
          </Button>
        )}
      </div>

      <PageContainer>
        <Card>
          <CardBody className="flex flex-wrap items-end gap-3 p-3">
            <Input
              placeholder="Search projects"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              containerClassName="min-w-56 flex-1"
            />

            <Select
              aria-label="Filter by status"
              value={status}
              onValueChange={(value) => {
                setStatus(value);
                setPage(1);
              }}
              options={STATUS_OPTIONS}
              className="w-40"
            />

            <Select
              aria-label="Archived filter"
              value={isArchived}
              onValueChange={(value) => {
                setIsArchived(value);
                setPage(1);
              }}
              options={ARCHIVE_OPTIONS}
              className="w-40"
            />
          </CardBody>
        </Card>

        <div className="mt-4 overflow-hidden rounded-lg border border-line bg-surface">
          {error ? (
            <ErrorState
              title="Could not load projects"
              description={error.message}
              onRetry={reload}
            />
          ) : (
            <TableWrapper>
              <Table>
                <THead>
                  <TR>
                    <TH
                      sortDirection={sortBy === 'name' ? order : false}
                      onSort={() => toggleSort('name')}
                    >
                      Project
                    </TH>
                    <TH
                      sortDirection={sortBy === 'status' ? order : false}
                      onSort={() => toggleSort('status')}
                    >
                      Status
                    </TH>
                    <TH
                      sortDirection={sortBy === 'deadline' ? order : false}
                      onSort={() => toggleSort('deadline')}
                    >
                      Deadline
                    </TH>
                    <TH
                      sortDirection={sortBy === 'updatedAt' ? order : false}
                      onSort={() => toggleSort('updatedAt')}
                    >
                      Updated
                    </TH>
                  </TR>
                </THead>

                <TBody>
                  {loading && <TableSkeletonRows rows={5} columns={4} />}

                  {!loading && projects.length === 0 && (
                    <TableMessage colSpan={4}>
                      <span className="text-sm text-body-muted">
                        {filtered
                          ? 'No projects match these filters.'
                          : 'No projects yet in this workspace.'}
                      </span>
                    </TableMessage>
                  )}

                  {!loading &&
                    projects.map((project) => (
                      <TR
                        key={project._id}
                        interactive
                        onClick={() =>
                          navigate(`/workspaces/${workspaceId}/projects/${project._id}`)
                        }
                      >
                        <TD primary>
                          <Link
                            to={`/workspaces/${workspaceId}/projects/${project._id}`}
                            className="flex items-center gap-2"
                          >
                            <span
                              aria-hidden
                              className="size-2 shrink-0 rounded-full"
                              style={{
                                backgroundColor: project.color ?? 'var(--color-ink-300)',
                              }}
                            />
                            <span className="truncate">{project.name}</span>
                          </Link>
                        </TD>

                        <TD>
                          <ProjectStatusBadge status={project.status} />
                        </TD>

                        <TD numeric>
                          {project.deadline
                            ? new Date(project.deadline).toLocaleDateString()
                            : '—'}
                        </TD>

                        <TD numeric>
                          {new Date(project.updatedAt).toLocaleDateString()}
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
      </PageContainer>

      <Modal open={createOpen} onOpenChange={setCreateOpen}>
        <ModalContent>
          <form onSubmit={onCreate}>
            <ModalHeader title="New project" description="You can change these details later." />

            <ModalBody className="flex flex-col gap-4">
              {create.error && !create.error.fieldError('name') && (
                <p role="alert" className="text-xs text-danger-700">
                  {create.error.message}
                </p>
              )}

              <Input
                label="Name"
                required
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                error={create.error?.fieldError('name')}
              />

              <Textarea
                label="Description"
                rows={3}
                hint="Optional."
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />

              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Deadline"
                  type="date"
                  value={deadline}
                  onChange={(event) => setDeadline(event.target.value)}
                  hint="Optional."
                />

                <Input
                  label="Colour"
                  type="color"
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                  hint="Used in lists."
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
                Create project
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
    </>
  );
};
