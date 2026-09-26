import { Plus, SquaresFour } from '@phosphor-icons/react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { AccountMenu } from '@/components/AccountMenu';
import { PageContainer } from '@/components/PageContainer';
import {
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Pagination,
  SkeletonList,
  Textarea,
} from '@/components/ui';
import { workspacesApi } from '@/lib/api';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useAsync, useDebounced, useDocumentTitle, useMutation } from '@/lib/hooks';

/**
 * The user's workspaces.
 *
 * This is the landing screen after login, and the reason it is a list rather
 * than a redirect into "the" workspace is that the API has no notion of a
 * current workspace — a user simply belongs to zero or more of them, and
 * `GET /workspaces` is the only source.
 *
 * The page has its own chrome rather than the workspace shell, because there is
 * no workspace to put in the shell yet.
 */
export const WorkspaceList = () => {
  useDocumentTitle('Workspaces');

  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);

  const [createOpen, setCreateOpen] = useState(searchParams.get('new') === '1');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const { data, error, loading, reload } = useAsync(
    () => workspacesApi.list({ page, limit, search: debouncedSearch || undefined }),
    [page, limit, debouncedSearch]
  );

  const create = useMutation(workspacesApi.create);

  const workspaces = data?.workspaces ?? [];
  const pagination = data?.pagination;
  const filtered = debouncedSearch.trim().length > 0;

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    const outcome = await create.run({
      name,
      ...(description.trim() ? { description } : {}),
    });

    if (outcome.ok) {
      setCreateOpen(false);
      setName('');
      setDescription('');
      setSearchParams({}, { replace: true });
      navigate(`/workspaces/${outcome.data.workspace.id}`);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-canvas">
      <header className="flex h-topbar items-center justify-between gap-3 border-b border-line bg-surface px-4">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="flex size-6 items-center justify-center rounded-sm bg-ink-950 text-2xs font-semibold text-body-inverse"
          >
            PM
          </span>
          <span className="text-sm font-medium text-body">Project Management</span>
        </div>

        <div className="w-56">
          <AccountMenu />
        </div>
      </header>

      <PageContainer>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <h1 className="text-xl font-semibold text-body">Workspaces</h1>
            <p className="text-xs text-body-muted">
              {user ? `Signed in as ${user.email}` : 'Your workspaces'}
            </p>
          </div>

          <Button
            variant="primary"
            iconLeft={<Plus aria-hidden />}
            onClick={() => setCreateOpen(true)}
          >
            New workspace
          </Button>
        </div>

        <Card>
          <CardBody className="flex flex-col gap-3 p-3">
            <Input
              placeholder="Search workspaces"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              containerClassName="max-w-xs"
            />
          </CardBody>
        </Card>

        <div className="mt-4">
          {loading && <SkeletonList rows={4} />}

          {!loading && error && (
            <ErrorState
              title="Could not load your workspaces"
              description={error.message}
              onRetry={reload}
            />
          )}

          {!loading && !error && workspaces.length === 0 && (
            <EmptyState
              variant={filtered ? 'no-results' : 'empty'}
              icon={<SquaresFour aria-hidden />}
              title={filtered ? 'No workspaces match that search' : 'No workspaces yet'}
              description={
                filtered
                  ? 'Try a different term, or clear the search.'
                  : 'A workspace holds your projects and the people working on them.'
              }
              action={
                filtered ? (
                  <Button variant="secondary" size="sm" onClick={() => setSearch('')}>
                    Clear search
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    iconLeft={<Plus aria-hidden />}
                    onClick={() => setCreateOpen(true)}
                  >
                    Create a workspace
                  </Button>
                )
              }
            />
          )}

          {!loading && !error && workspaces.length > 0 && (
            <ul className="flex flex-col divide-y divide-line-subtle overflow-hidden rounded-lg border border-line bg-surface">
              {workspaces.map((workspace) => (
                <li key={workspace.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/workspaces/${workspace.id}`)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-[120ms] ease-standard hover:bg-surface-hover"
                  >
                    <span
                      aria-hidden
                      className="flex size-8 shrink-0 items-center justify-center rounded-md bg-ink-100 text-xs font-semibold text-body"
                    >
                      {workspace.name.charAt(0).toUpperCase()}
                    </span>

                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-body">
                          {workspace.name}
                        </span>
                        {workspace.isArchived && <Badge tone="neutral">Archived</Badge>}
                      </span>
                      {workspace.description && (
                        <span className="truncate text-xs text-body-subtle">
                          {workspace.description}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

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
      </PageContainer>

      <Modal
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setSearchParams({}, { replace: true });
        }}
      >
        <ModalContent>
          <form onSubmit={onCreate}>
            <ModalHeader
              title="New workspace"
              description="You will be its owner, and can invite others afterwards."
            />

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
                error={create.error?.fieldError('description')}
              />
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
                Create workspace
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
    </div>
  );
};
