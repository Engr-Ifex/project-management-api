import { Plus, Trash } from '@phosphor-icons/react';
import { useState } from 'react';
import type { FormEvent } from 'react';

import {
  Button,
  Card,
  CardBody,
  ConfirmDialog,
  ErrorState,
  Input,
  LabelChip,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  SkeletonList,
} from '@/components/ui';
import type { Project } from '@/lib/api';
import { labelsApi } from '@/lib/api';
import { useAsync, useMutation } from '@/lib/hooks';
import { useProjectRole, useWorkspace } from '@/lib/workspace/WorkspaceProvider';

/**
 * Project labels.
 *
 * Labels are project-scoped and their names are unique **within a project** — a
 * duplicate is a 409, not a validation error, so the form surfaces the server's
 * message rather than pretending to validate locally. A label from another
 * project is a 404, which is why this list never offers a cross-project picker.
 */
export const LabelsTab = ({ project }: { project: Project }) => {
  const { workspaceId } = useWorkspace();
  const { projectRole } = useProjectRole(project.members);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#348579');
  const [pendingDelete, setPendingDelete] = useState<{ _id: string; name: string } | null>(null);

  const { data, error, loading, reload } = useAsync(
    () => labelsApi.list(workspaceId, project._id, { limit: 100 }),
    [workspaceId, project._id]
  );

  const create = useMutation((body: { name: string; color: string }) =>
    labelsApi.create(workspaceId, project._id, body)
  );
  const remove = useMutation((labelId: string) =>
    labelsApi.remove(workspaceId, project._id, labelId)
  );

  const labels = data?.labels ?? [];
  const canManage = projectRole === 'owner' || projectRole === 'admin';

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    const outcome = await create.run({ name, color });
    if (outcome.ok) {
      setCreateOpen(false);
      setName('');
      reload();
    }
  };

  if (error) {
    return (
      <ErrorState title="Could not load labels" description={error.message} onRetry={reload} />
    );
  }

  return (
    <>
      <Card>
        <CardBody className="flex flex-col gap-4 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-sm font-semibold text-body">Labels</h2>
              <p className="text-xs text-body-subtle">
                Shared across every task in this project. Names must be unique here.
              </p>
            </div>

            {canManage && (
              <Button
                variant="secondary"
                size="sm"
                iconLeft={<Plus aria-hidden />}
                onClick={() => setCreateOpen(true)}
              >
                New label
              </Button>
            )}
          </div>

          {loading && <SkeletonList rows={3} />}

          {!loading && labels.length === 0 && (
            <p className="py-6 text-center text-sm text-body-muted">
              No labels yet. Labels group tasks across the project.
            </p>
          )}

          {!loading && labels.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {labels.map((label) => (
                <li key={label._id} className="group flex items-center gap-1">
                  <LabelChip name={label.name} color={label.color} />

                  {canManage && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Delete label ${label.name}`}
                      iconLeft={<Trash aria-hidden />}
                      onClick={() => setPendingDelete({ _id: label._id, name: label.name })}
                      className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Modal open={createOpen} onOpenChange={setCreateOpen}>
        <ModalContent size="sm">
          <form onSubmit={onCreate}>
            <ModalHeader title="New label" />

            <ModalBody className="flex flex-col gap-4">
              {create.error && (
                <p role="alert" className="text-xs text-danger-700">
                  {/* A 409 here means the name is taken within this project. */}
                  {create.error.isConflict
                    ? 'A label with that name already exists in this project.'
                    : create.error.message}
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

              <Input
                label="Colour"
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
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
                Create label
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Delete this label?"
        description={`"${pendingDelete?.name ?? ''}" will be removed from every task that uses it. This cannot be undone.`}
        confirmLabel="Delete label"
        tone="danger"
        loading={remove.loading}
        onConfirm={() => {
          const label = pendingDelete;
          if (!label) return;
          void remove.run(label._id).then((outcome) => {
            if (outcome.ok) {
              setPendingDelete(null);
              reload();
            }
          });
        }}
      />
    </>
  );
};
