import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';

import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  ProjectStatusBadge,
  Textarea,
} from '@/components/ui';
import type { Project } from '@/lib/api';
import { projectsApi } from '@/lib/api';
import { useMutation, usePermission } from '@/lib/hooks';
import { useProjectContext } from '@/layouts/ProjectLayout';
import { useWorkspace } from '@/lib/workspace/WorkspaceProvider';

/**
 * Project settings — the project's own details, and the only place they are
 * edited.
 *
 * **Editing a project is a workspace operation, not a project one.** A project
 * owner cannot rename their own project; a workspace owner/admin can rename any
 * project in the workspace. That is deliberate (see `API-INTEGRATION.md` §15 and
 * `hasProjectOverride`), and it is the opposite of what the project member
 * screen suggests, so this form gates on `can.manageProjects` — the workspace
 * permission — rather than on the project role, and says so plainly when the
 * caller cannot edit. A control that is missing with no explanation reads as a
 * bug; the explanation is the feature.
 *
 * Deadlines are sent as a full ISO datetime because the validator uses
 * `.datetime()`, and cleared with `null` rather than omitted — omitting a field
 * means "leave it alone" everywhere else in this API.
 */
export const ProjectSettingsTab = ({ project }: { project: Project }) => {
  const { workspaceId } = useWorkspace();
  const { can } = usePermission();
  const { setProject } = useProjectContext();

  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [deadline, setDeadline] = useState(toDateInputValue(project.deadline));
  const [color, setColor] = useState(project.color ?? '#348579');
  const [saved, setSaved] = useState(false);

  const update = useMutation((body: Parameters<typeof projectsApi.update>[2]) =>
    projectsApi.update(workspaceId, project._id, body)
  );

  const canEdit = can.manageProjects && !project.isArchived;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaved(false);

    const outcome = await update.run({
      name,
      // An empty description is a real value here: it clears the field. The
      // validator has no minimum length, so `''` is the way to remove one.
      description: description.trim(),
      deadline: deadline ? `${deadline}T00:00:00.000Z` : null,
      color: color || null,
    });

    if (outcome.ok) {
      // Push the server's copy into the layout, so the header and breadcrumb
      // reflect the new name without a second request.
      setProject(outcome.data.project);
      setSaved(true);
    }
  };

  const dirty =
    name !== project.name ||
    description.trim() !== (project.description ?? '') ||
    deadline !== toDateInputValue(project.deadline) ||
    color !== (project.color ?? '#348579');

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader
          title="Project details"
          description={
            canEdit
              ? 'Renaming or re-dating a project is a workspace-level operation.'
              : 'Only a workspace owner or admin can change these.'
          }
        />

        <CardBody className="p-4">
          <form className="flex flex-col gap-4" onSubmit={onSubmit}>
            {update.error && !update.error.fieldError('name') && (
              <p role="alert" className="text-xs text-danger-700">
                {update.error.message}
              </p>
            )}

            <Input
              label="Name"
              value={name}
              disabled={!canEdit}
              onChange={(event) => {
                setName(event.target.value);
                setSaved(false);
              }}
              error={update.error?.fieldError('name')}
            />

            <Textarea
              label="Description"
              rows={3}
              hint="Optional."
              value={description}
              disabled={!canEdit}
              onChange={(event) => {
                setDescription(event.target.value);
                setSaved(false);
              }}
              error={update.error?.fieldError('description')}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Deadline"
                type="date"
                value={deadline}
                disabled={!canEdit}
                onChange={(event) => {
                  setDeadline(event.target.value);
                  setSaved(false);
                }}
                hint="Optional. Clear it to remove the deadline."
                error={update.error?.fieldError('deadline')}
              />

              <Input
                label="Colour"
                type="color"
                value={color}
                disabled={!canEdit}
                onChange={(event) => {
                  setColor(event.target.value);
                  setSaved(false);
                }}
                error={update.error?.fieldError('color')}
              />
            </div>

            {canEdit && (
              <div className="flex items-center justify-end gap-3">
                {saved && !dirty && (
                  <span role="status" className="text-xs text-success-700">
                    Saved
                  </span>
                )}

                <Button type="submit" variant="primary" loading={update.loading} disabled={!dirty}>
                  Save changes
                </Button>
              </div>
            )}
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="At a glance" />

        <CardBody className="p-4">
          <dl className="grid gap-3 sm:grid-cols-2">
            <Field label="Status">
              <ProjectStatusBadge status={project.status} />
            </Field>

            <Field label="Created">
              <span data-numeric>{new Date(project.createdAt).toLocaleDateString()}</span>
            </Field>

            <Field label="Last updated">
              <span data-numeric>{new Date(project.updatedAt).toLocaleDateString()}</span>
            </Field>

            <Field label="Deadline">
              <span data-numeric>
                {project.deadline ? new Date(project.deadline).toLocaleDateString() : 'None'}
              </span>
            </Field>
          </dl>

          {project.isArchived && (
            <p className="mt-4 text-xs text-body-subtle">
              This project is archived. Restore it from the header before editing its details.
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  );
};

/** A `<input type="date">` speaks `yyyy-mm-dd`; the API speaks ISO datetimes. */
const toDateInputValue = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '');

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-1">
    <dt className="text-2xs uppercase tracking-wide text-body-subtle">{label}</dt>
    <dd className="text-sm text-body">{children}</dd>
  </div>
);
