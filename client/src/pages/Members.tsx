import { EnvelopeSimple, UserPlus, X } from '@phosphor-icons/react';
import { useState } from 'react';
import type { FormEvent } from 'react';

import { PageContainer } from '@/components/PageContainer';
import { CopyField } from '@/components/CopyField';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  ErrorState,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SkeletonList,
  Table,
  TableMessage,
  TableWrapper,
  TBody,
  TD,
  TH,
  THead,
  TR,
  WorkspaceRoleBadge,
} from '@/components/ui';
import type { WorkspaceRole } from '@/components/ui';
import { refId, refName, workspacesApi } from '@/lib/api';
import { ASSIGNABLE_WORKSPACE_ROLE_OPTIONS } from '@/lib/constants';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useAsync, useDocumentTitle, useMutation, usePermission } from '@/lib/hooks';
import { useWorkspace } from '@/lib/workspace/WorkspaceProvider';

/**
 * Workspace members.
 *
 * This is the only endpoint that lists the people in a workspace, so it also
 * backs every assignee and member picker in the product.
 *
 * The invitation flow deserves a note: the API sends **no email**, and the
 * `token` it returns is the only way an invitee can accept. So the UI has to
 * hand the token over itself — hence the copyable invite link rather than a
 * "Invitation sent" toast that would be a lie.
 */
export const Members = () => {
  useDocumentTitle('Members');

  const { workspaceId } = useWorkspace();
  const { user } = useAuth();
  const { can, isOwner: callerIsOwner } = usePermission();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState('');
  /* An invitation can only ever be admin or member — ownership is transferred, not invited. */
  const [role, setRole] = useState<'admin' | 'member'>('member');
  const [inviteLink, setInviteLink] = useState<string | undefined>(undefined);
  const [pendingRemove, setPendingRemove] = useState<{ id: string; name: string } | null>(null);

  const { data, error, loading, reload } = useAsync(
    () => workspacesApi.members(workspaceId).then((result) => result.members),
    [workspaceId]
  );

  const invite = useMutation((body: { email: string; role: 'admin' | 'member' }) =>
    workspacesApi.invite(workspaceId, body)
  );
  const removeMember = useMutation((userId: string) =>
    workspacesApi.removeMember(workspaceId, userId)
  );
  const changeRole = useMutation((args: { userId: string; role: WorkspaceRole }) =>
    workspacesApi.changeMemberRole(workspaceId, args.userId, args.role)
  );

  const members = data ?? [];

  const onInvite = async (event: FormEvent) => {
    event.preventDefault();
    const outcome = await invite.run({ email, role });
    if (outcome.ok) {
      /*
       * SPEC GAP: `openapi.json` omits `token` from the Invitation schema, but
       * the API returns it — and it is the only way in, since no email is sent.
       */
      const token = outcome.data.invitation.token;
      setInviteLink(`${window.location.origin}/invitations/${token}`);
      setEmail('');
    }
  };

  if (error) {
    return (
      <PageContainer>
        <ErrorState
          title="Could not load members"
          description={error.message}
          onRetry={reload}
        />
      </PageContainer>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-4 py-4 lg:px-6">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl font-semibold text-body">Members</h1>
          <p className="text-xs text-body-muted">
            {loading ? 'Loading…' : `${members.length} people in this workspace`}
          </p>
        </div>

        {can.inviteMembers && (
          <Button
            variant="primary"
            iconLeft={<UserPlus aria-hidden />}
            onClick={() => {
              setInviteLink(undefined);
              setInviteOpen(true);
            }}
          >
            Invite someone
          </Button>
        )}
      </div>

      <PageContainer>
        <Card>
          {loading && <SkeletonList rows={4} />}

          {!loading && members.length === 0 && (
            <div className="py-10">
              <TableMessage colSpan={4}>
                <span className="text-sm text-body-muted">No members.</span>
              </TableMessage>
            </div>
          )}

          {!loading && members.length > 0 && (
            <TableWrapper>
              <Table>
                <THead>
                  <TR>
                    <TH>Person</TH>
                    <TH>Role</TH>
                    <TH>Joined</TH>
                    <TH>
                      <span className="sr-only">Actions</span>
                    </TH>
                  </TR>
                </THead>

                <TBody>
                  {members.map((member) => {
                    const id = refId(member.user) ?? '';
                    const name = refName(member.user);
                    const isSelf = id === user?.id;
                    const memberIsOwner = member.role === 'owner';

                    /*
                     * An admin cannot remove the owner or another admin, and
                     * nobody can remove the owner at all. The owner may remove
                     * anyone but themselves.
                     */
                    const mayRemove =
                      can.removeMembers &&
                      !isSelf &&
                      !memberIsOwner &&
                      (callerIsOwner || member.role === 'member');

                    return (
                      <TR key={id}>
                        <TD primary>
                          <span className="flex items-center gap-2">
                            <Avatar name={name} size="sm" />
                            <span className="flex flex-col">
                              <span className="truncate text-sm text-body">
                                {name}
                                {isSelf && (
                                  <span className="ml-1 text-2xs text-body-subtle">(you)</span>
                                )}
                              </span>
                            </span>
                          </span>
                        </TD>

                        <TD>
                          {callerIsOwner && !memberIsOwner ? (
                            <Select
                              aria-label={`Role for ${name}`}
                              size="sm"
                              value={member.role}
                              options={ASSIGNABLE_WORKSPACE_ROLE_OPTIONS}
                              onValueChange={(value) => {
                                void changeRole
                                  .run({ userId: id, role: value as WorkspaceRole })
                                  .then((outcome) => {
                                    if (outcome.ok) reload();
                                  });
                              }}
                              className="w-32"
                            />
                          ) : (
                            <WorkspaceRoleBadge role={member.role} />
                          )}
                        </TD>

                        <TD numeric>
                          {member.joinedAt
                            ? new Date(member.joinedAt).toLocaleDateString()
                            : '—'}
                        </TD>

                        <TD>
                          {mayRemove && (
                            <span className="flex justify-end">
                              <Button
                                variant="ghost"
                                size="sm"
                                aria-label={`Remove ${name}`}
                                iconLeft={<X aria-hidden />}
                                onClick={() => setPendingRemove({ id, name })}
                              />
                            </span>
                          )}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </TableWrapper>
          )}
        </Card>

        {can.transferOwnership && members.length > 1 && (
          <Card className="mt-4">
            <CardHeader
              title="Ownership"
              description="Transferring ownership makes someone else the owner and you an admin."
            />
            <CardBody className="p-4">
              <TransferOwnership
                members={members
                  .filter((member) => refId(member.user) !== user?.id)
                  .map((member) => ({
                    id: refId(member.user) ?? '',
                    name: refName(member.user),
                  }))}
                onDone={reload}
              />
            </CardBody>
          </Card>
        )}
      </PageContainer>

      <Modal
        open={inviteOpen}
        onOpenChange={(open) => {
          setInviteOpen(open);
          if (!open) {
            setInviteLink(undefined);
            setRole('member');
          }
        }}
      >
        <ModalContent>
          <form onSubmit={onInvite}>
            <ModalHeader
              title="Invite someone"
              description="You will get a link to pass on yourself — this API does not send email."
            />

            <ModalBody className="flex flex-col gap-4">
              {invite.error && (
                <p role="alert" className="text-xs text-danger-700">
                  {invite.error.isConflict
                    ? 'There is already a pending invitation for that address.'
                    : invite.error.message}
                </p>
              )}

              {inviteLink ? (
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-body-muted">
                    Invitation created. Send this link to{' '}
                    <strong className="font-medium">{email || 'the invitee'}</strong> — it is the
                    only way to accept.
                  </p>

                  <CopyField label="Invitation link" value={inviteLink} />

                  <Badge tone="warning" icon={<EnvelopeSimple aria-hidden />}>
                    No email is sent by this API
                  </Badge>
                </div>
              ) : (
                <>
                  <Input
                    label="Email"
                    type="email"
                    required
                    autoFocus
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    error={invite.error?.fieldError('email')}
                  />

                  <Select
                    label="Role"
                    value={role}
                    onValueChange={(value) => setRole(value as 'admin' | 'member')}
                    options={ASSIGNABLE_WORKSPACE_ROLE_OPTIONS}
                    hint="Owners are made by transferring ownership, not by invitation."
                  />
                </>
              )}
            </ModalBody>

            <ModalFooter>
              {inviteLink ? (
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => {
                    setInviteOpen(false);
                    reload();
                  }}
                >
                  Done
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setInviteOpen(false)}
                    disabled={invite.loading}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" loading={invite.loading}>
                    Create invitation
                  </Button>
                </>
              )}
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>

      <ConfirmDialog
        open={pendingRemove !== null}
        onOpenChange={(open) => !open && setPendingRemove(null)}
        title="Remove this member?"
        description={`${pendingRemove?.name ?? 'They'} will lose access to every project in this workspace.`}
        confirmLabel="Remove member"
        tone="danger"
        loading={removeMember.loading}
        onConfirm={() => {
          const member = pendingRemove;
          if (!member) return;
          void removeMember.run(member.id).then((outcome) => {
            if (outcome.ok) {
              setPendingRemove(null);
              reload();
            }
          });
        }}
      />
    </>
  );
};

/**
 * Transferring ownership is owner-only, irreversible, and changes two people's
 * roles at once — so it gets a deliberate two-step: choose the person, then
 * confirm by name.
 */
const TransferOwnership = ({
  members,
  onDone,
}: {
  members: { id: string; name: string }[];
  onDone: () => void;
}) => {
  const { workspaceId } = useWorkspace();
  const [selected, setSelected] = useState('');
  const [confirming, setConfirming] = useState(false);

  const transfer = useMutation((userId: string) =>
    workspacesApi.transferOwnership(workspaceId, userId)
  );

  const target = members.find((member) => member.id === selected);

  return (
    <>
      <div className="flex flex-wrap items-end gap-2">
        <Select
          aria-label="New owner"
          placeholder="Choose a member"
          value={selected}
          onValueChange={setSelected}
          options={members.map((member) => ({ value: member.id, label: member.name }))}
          className="w-64"
        />

        <Button
          variant="secondary"
          disabled={!selected}
          onClick={() => setConfirming(true)}
        >
          Transfer ownership
        </Button>
      </div>

      {transfer.error && (
        <p role="alert" className="mt-2 text-xs text-danger-700">
          {transfer.error.message}
        </p>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Make ${target?.name ?? 'this person'} the owner?`}
        description="You will become an admin and lose the owner-only abilities: changing roles, archiving the workspace, and transferring ownership."
        confirmLabel="Transfer ownership"
        tone="danger"
        loading={transfer.loading}
        onConfirm={() => {
          void transfer.run(selected).then((outcome) => {
            if (outcome.ok) {
              setConfirming(false);
              setSelected('');
              onDone();
            }
          });
        }}
      />
    </>
  );
};
