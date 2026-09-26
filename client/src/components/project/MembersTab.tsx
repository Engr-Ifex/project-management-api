import { UserPlus, X } from '@phosphor-icons/react';
import { useState } from 'react';

import {
  Avatar,
  Button,
  Card,
  CardBody,
  ConfirmDialog,
  ErrorState,
  ProjectRoleBadge,
  Select,
  SkeletonList,
} from '@/components/ui';
import type { ProjectRole } from '@/components/ui';
import type { Project } from '@/lib/api';
import { projectsApi, refId, refName, workspacesApi } from '@/lib/api';
import { useAsync, useMutation } from '@/lib/hooks';
import { useProjectRole, useWorkspace } from '@/lib/workspace/WorkspaceProvider';
import { useProjectContext } from '@/routes/ProjectLayout';

const ROLE_OPTIONS: { value: ProjectRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
  { value: 'viewer', label: 'Viewer' },
];

/**
 * Project membership.
 *
 * The screen is gated on `project.members` being **present**, not on it being
 * non-empty. The API omits `members` entirely for a caller who is neither a
 * project member nor a workspace owner/admin, so an absent field means "you
 * cannot see this", while an empty array would mean "nobody is on this project".
 * Treating the two the same is the mistake this screen exists to avoid.
 *
 * The picker offers **workspace** members, because that is the population a
 * project member can be drawn from — but the API rejects a non-member assignee,
 * so the list is filtered to people not already on the project.
 */
export const MembersTab = ({ project }: { project: Project }) => {
  const { workspaceId } = useWorkspace();
  const { projectRole } = useProjectRole(project.members);
  const { reloadProject } = useProjectContext();

  const [pendingRemove, setPendingRemove] = useState<{ id: string; name: string } | null>(null);
  const [addUserId, setAddUserId] = useState('');

  const membersVisible = project.members !== undefined;
  const members = project.members ?? [];
  const canManage = projectRole === 'owner' || projectRole === 'admin';

  const workspaceMembers = useAsync(
    () => workspacesApi.members(workspaceId).then((data) => data.members),
    [workspaceId]
  );

  const addMember = useMutation((userId: string) =>
    projectsApi.addMember(workspaceId, project._id, userId)
  );
  const removeMember = useMutation((userId: string) =>
    projectsApi.removeMember(workspaceId, project._id, userId)
  );
  const changeRole = useMutation((args: { userId: string; role: ProjectRole }) =>
    projectsApi.changeMemberRole(workspaceId, project._id, args.userId, args.role)
  );

  const currentIds = new Set(members.map((member) => refId(member.user)).filter(Boolean));
  const candidates = (workspaceMembers.data ?? [])
    .filter((member) => !currentIds.has(refId(member.user)))
    .map((member) => ({
      value: refId(member.user) ?? '',
      label: `${refName(member.user)} · ${member.role}`,
    }));

  if (!membersVisible) {
    return (
      <Card>
        <CardBody className="p-6">
          <p className="text-sm text-body-muted">
            You are not a member of this project, so its member list is not visible to you.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardBody className="flex flex-col gap-4 p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <h2 className="text-sm font-semibold text-body">Members</h2>
              <p className="text-xs text-body-subtle">
                {members.length} on this project. Workspace owners and admins always have access.
              </p>
            </div>

            {canManage && candidates.length > 0 && (
              <div className="flex items-end gap-2">
                <Select
                  aria-label="Add a member"
                  placeholder="Choose a workspace member"
                  value={addUserId}
                  onValueChange={setAddUserId}
                  options={candidates}
                  className="w-64"
                />

                <Button
                  variant="secondary"
                  size="sm"
                  iconLeft={<UserPlus aria-hidden />}
                  loading={addMember.loading}
                  disabled={!addUserId}
                  onClick={() => {
                    void addMember.run(addUserId).then((outcome) => {
                      if (outcome.ok) {
                        setAddUserId('');
                        reloadProject();
                      }
                    });
                  }}
                >
                  Add
                </Button>
              </div>
            )}
          </div>

          {addMember.error && (
            <p role="alert" className="text-xs text-danger-700">
              {addMember.error.message}
            </p>
          )}

          {workspaceMembers.loading && <SkeletonList rows={3} />}

          {workspaceMembers.error && (
            <ErrorState
              title="Could not load workspace members"
              description={workspaceMembers.error.message}
              onRetry={workspaceMembers.reload}
            />
          )}

          <ul className="flex flex-col divide-y divide-line-subtle">
            {members.map((member) => {
              const id = refId(member.user) ?? '';
              const name = refName(member.user);

              return (
                <li key={id} className="flex items-center gap-3 py-3">
                  <Avatar name={name} size="sm" />

                  <span className="min-w-0 flex-1 truncate text-sm text-body">{name}</span>

                  {canManage && member.role !== 'owner' ? (
                    <Select
                      aria-label={`Role for ${name}`}
                      size="sm"
                      value={member.role}
                      options={ROLE_OPTIONS}
                      onValueChange={(value) => {
                        void changeRole
                          .run({ userId: id, role: value as ProjectRole })
                          .then((outcome) => {
                            if (outcome.ok) reloadProject();
                          });
                      }}
                      className="w-32"
                    />
                  ) : (
                    <ProjectRoleBadge role={member.role} />
                  )}

                  {canManage && member.role !== 'owner' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Remove ${name}`}
                      iconLeft={<X aria-hidden />}
                      onClick={() => setPendingRemove({ id, name })}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>

      <ConfirmDialog
        open={pendingRemove !== null}
        onOpenChange={(open) => !open && setPendingRemove(null)}
        title="Remove this member?"
        description={`${pendingRemove?.name ?? 'They'} will lose access to this project. Their workspace membership is unaffected.`}
        confirmLabel="Remove member"
        tone="danger"
        loading={removeMember.loading}
        onConfirm={() => {
          const member = pendingRemove;
          if (!member) return;
          void removeMember.run(member.id).then((outcome) => {
            if (outcome.ok) {
              setPendingRemove(null);
              reloadProject();
            }
          });
        }}
      />
    </>
  );
};
