import { Trash, UploadSimple } from '@phosphor-icons/react';
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { PageContainer } from '@/components/PageContainer';
import {
  Avatar,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  ConfirmDialog,
  ErrorState,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@/components/ui';
import { usersApi, workspacesApi } from '@/lib/api';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useAsync, useDocumentTitle, useMutation, usePermission } from '@/lib/hooks';
import { useWorkspace } from '@/lib/workspace/WorkspaceProvider';

/**
 * Account and workspace settings.
 *
 * Password change is the one action here with a consequence that is easy to get
 * wrong: it **invalidates every existing token**, so the user is signed out
 * immediately afterwards. The flow does that deliberately rather than leaving
 * them on a page that will 401 on the next click.
 *
 * The workspace tab only appears for an owner or admin, and the destructive
 * controls inside it only for the owner — archiving and deleting a workspace are
 * owner-only, which is why they are gated on `isOwner` and not `isElevated`.
 */
export const Settings = () => {
  useDocumentTitle('Settings');

  const { user, setUser, logout } = useAuth();
  const { workspaceId, workspace, reload: reloadWorkspace } = useWorkspace();
  const { can, isOwner, isElevated } = usePermission();
  const navigate = useNavigate();

  const [tab, setTab] = useState('profile');

  /* ---- profile ---- */
  const [name, setName] = useState(user?.name ?? '');
  const avatarInput = useRef<HTMLInputElement>(null);
  const [avatarError, setAvatarError] = useState<string | undefined>(undefined);

  /* ---- password ---- */
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  /* ---- workspace ---- */
  const [workspaceName, setWorkspaceName] = useState(workspace?.name ?? '');
  const [workspaceDescription, setWorkspaceDescription] = useState(workspace?.description ?? '');

  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmDeleteWorkspace, setConfirmDeleteWorkspace] = useState(false);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);

  const settings = useAsync(() => usersApi.getSettings().then((data) => data.settings), []);

  const updateProfile = useMutation((body: { name?: string }) => usersApi.updateProfile(body));
  const uploadAvatar = useMutation((file: File) => usersApi.uploadAvatar(file));
  const changePassword = useMutation(usersApi.changePassword);
  const updateSettings = useMutation((body: {
    emailNotifications?: boolean;
    marketingEmails?: boolean;
  }) => usersApi.updateSettings(body));
  const updateWorkspace = useMutation((body: { name?: string; description?: string }) =>
    workspacesApi.update(workspaceId, body)
  );
  const archiveWorkspace = useMutation(() => workspacesApi.archive(workspaceId));
  const restoreWorkspace = useMutation(() => workspacesApi.restore(workspaceId));
  const deleteWorkspace = useMutation(() => workspacesApi.remove(workspaceId));
  const deleteAccount = useMutation(() => usersApi.deleteAccount());

  if (!user) return null;

  const onSaveProfile = async (event: FormEvent) => {
    event.preventDefault();
    const outcome = await updateProfile.run({ name });
    if (outcome.ok) setUser(outcome.data.user);
  };

  const onChangePassword = async (event: FormEvent) => {
    event.preventDefault();
    const outcome = await changePassword.run({
      currentPassword,
      newPassword,
      confirmPassword,
    });

    if (outcome.ok) {
      /*
       * Changing the password invalidates every token issued before it, so this
       * session is already dead. Sign out explicitly rather than leaving the
       * user to discover it on their next click.
       */
      await logout();
      navigate('/login', { replace: true });
    }
  };

  const onAvatarChosen = async (file: File | undefined) => {
    setAvatarError(undefined);
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setAvatarError('Use a JPEG, PNG or WEBP image.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('Images must be 5 MB or smaller.');
      return;
    }

    const outcome = await uploadAvatar.run(file);
    if (outcome.ok) setUser(outcome.data.user);

    if (avatarInput.current) avatarInput.current.value = '';
  };

  return (
    <>
      <div className="border-b border-line px-4 py-4 lg:px-6">
        <h1 className="text-xl font-semibold text-body">Settings</h1>
        <p className="mt-0.5 text-xs text-body-muted">
          Your account, and the workspace you are currently in.
        </p>
      </div>

      <PageContainer width="narrow">
        <Tabs value={tab} onValueChange={setTab} className="flex flex-col">
          <TabsList>
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            {isElevated && <TabsTrigger value="workspace">Workspace</TabsTrigger>}
          </TabsList>

          <div className="pt-4">
            {/* ---------------------------------------------------- profile */}
            <TabsContent value="profile">
              <div className="flex flex-col gap-4">
                <Card>
                  <CardHeader title="Your profile" />
                  <CardBody className="flex flex-col gap-5 p-4">
                    <div className="flex items-center gap-4">
                      <Avatar name={user.name} src={user.avatar} size="lg" />

                      <div className="flex flex-col gap-1">
                        <input
                          ref={avatarInput}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={(event) => void onAvatarChosen(event.target.files?.[0])}
                        />

                        <Button
                          variant="secondary"
                          size="sm"
                          iconLeft={<UploadSimple aria-hidden />}
                          loading={uploadAvatar.loading}
                          onClick={() => avatarInput.current?.click()}
                        >
                          Change photo
                        </Button>

                        <p className="text-2xs text-body-subtle">
                          JPEG, PNG or WEBP, up to 5 MB.
                        </p>
                      </div>
                    </div>

                    {(avatarError ?? uploadAvatar.error?.message) && (
                      <p role="alert" className="text-xs text-danger-700">
                        {avatarError ?? uploadAvatar.error?.message}
                      </p>
                    )}

                    <form onSubmit={onSaveProfile} className="flex flex-col gap-4">
                      <Input
                        label="Name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        error={updateProfile.error?.fieldError('name')}
                      />

                      <Input
                        label="Email"
                        value={user.email}
                        readOnly
                        disabled
                        hint="Email cannot be changed through this API."
                      />

                      <div className="flex justify-end">
                        <Button
                          type="submit"
                          variant="primary"
                          loading={updateProfile.loading}
                          disabled={name === user.name}
                        >
                          Save changes
                        </Button>
                      </div>
                    </form>
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader
                    title="Delete account"
                    description="This removes your account permanently."
                  />
                  <CardBody className="p-4">
                    <Button
                      variant="danger"
                      size="sm"
                      iconLeft={<Trash aria-hidden />}
                      onClick={() => setConfirmDeleteAccount(true)}
                    >
                      Delete my account
                    </Button>
                  </CardBody>
                </Card>
              </div>
            </TabsContent>

            {/* --------------------------------------------------- security */}
            <TabsContent value="security">
              <Card>
                <CardHeader
                  title="Change password"
                  description="You will be signed out afterwards, because this invalidates every existing session."
                />

                <CardBody className="p-4">
                  <form onSubmit={onChangePassword} className="flex flex-col gap-4">
                    {changePassword.error && !changePassword.error.fieldError('currentPassword') && (
                      <p role="alert" className="text-xs text-danger-700">
                        {changePassword.error.message}
                      </p>
                    )}

                    <Input
                      label="Current password"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                      error={changePassword.error?.fieldError('currentPassword')}
                    />

                    <Input
                      label="New password"
                      type="password"
                      autoComplete="new-password"
                      required
                      hint="At least 8 characters."
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      error={changePassword.error?.fieldError('newPassword')}
                    />

                    <Input
                      label="Confirm new password"
                      type="password"
                      autoComplete="new-password"
                      required
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      error={changePassword.error?.fieldError('confirmPassword')}
                    />

                    <div className="flex justify-end">
                      <Button type="submit" variant="primary" loading={changePassword.loading}>
                        Change password
                      </Button>
                    </div>
                  </form>
                </CardBody>
              </Card>
            </TabsContent>

            {/* ---------------------------------------------- notifications */}
            <TabsContent value="notifications">
              <Card>
                <CardHeader title="Notification preferences" />

                <CardBody className="flex flex-col gap-4 p-4">
                  {settings.loading && <p className="text-xs text-body-subtle">Loading…</p>}

                  {settings.error && (
                    <ErrorState
                      title="Could not load your preferences"
                      description={settings.error.message}
                      onRetry={settings.reload}
                    />
                  )}

                  {settings.data && (
                    <>
                      <Checkbox
                        label="Email notifications"
                        checked={settings.data.emailNotifications}
                        onCheckedChange={(checked) => {
                          void updateSettings
                            .run({ emailNotifications: checked === true })
                            .then((outcome) => {
                              if (outcome.ok) settings.reload();
                            });
                        }}
                      />

                      <Checkbox
                        label="Marketing emails"
                        checked={settings.data.marketingEmails}
                        onCheckedChange={(checked) => {
                          void updateSettings
                            .run({ marketingEmails: checked === true })
                            .then((outcome) => {
                              if (outcome.ok) settings.reload();
                            });
                        }}
                      />

                      {updateSettings.error && (
                        <p role="alert" className="text-xs text-danger-700">
                          {updateSettings.error.message}
                        </p>
                      )}
                    </>
                  )}
                </CardBody>
              </Card>
            </TabsContent>

            {/* -------------------------------------------------- workspace */}
            {isElevated && (
              <TabsContent value="workspace">
                <div className="flex flex-col gap-4">
                  <Card>
                    <CardHeader title="Workspace" />
                    <CardBody className="p-4">
                      <form
                        className="flex flex-col gap-4"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void updateWorkspace
                            .run({
                              name: workspaceName,
                              ...(workspaceDescription.trim()
                                ? { description: workspaceDescription }
                                : {}),
                            })
                            .then((outcome) => {
                              if (outcome.ok) reloadWorkspace();
                            });
                        }}
                      >
                        {updateWorkspace.error && (
                          <p role="alert" className="text-xs text-danger-700">
                            {updateWorkspace.error.message}
                          </p>
                        )}

                        <Input
                          label="Name"
                          value={workspaceName}
                          onChange={(event) => setWorkspaceName(event.target.value)}
                          error={updateWorkspace.error?.fieldError('name')}
                        />

                        <Textarea
                          label="Description"
                          rows={3}
                          value={workspaceDescription}
                          onChange={(event) => setWorkspaceDescription(event.target.value)}
                        />

                        <div className="flex justify-end">
                          <Button
                            type="submit"
                            variant="primary"
                            loading={updateWorkspace.loading}
                            disabled={!can.updateWorkspace}
                          >
                            Save workspace
                          </Button>
                        </div>
                      </form>
                    </CardBody>
                  </Card>

                  {/* Owner-only controls. */}
                  {isOwner && (
                    <Card>
                      <CardHeader
                        title="Danger zone"
                        description="These affect everyone in the workspace."
                      />

                      <CardBody className="flex flex-col gap-3 p-4">
                        {workspace?.isArchived ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            loading={restoreWorkspace.loading}
                            onClick={() => {
                              void restoreWorkspace.run().then((outcome) => {
                                if (outcome.ok) reloadWorkspace();
                              });
                            }}
                          >
                            Restore workspace
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setConfirmArchive(true)}
                          >
                            Archive workspace
                          </Button>
                        )}

                        <Button
                          variant="danger"
                          size="sm"
                          iconLeft={<Trash aria-hidden />}
                          onClick={() => setConfirmDeleteWorkspace(true)}
                        >
                          Delete workspace
                        </Button>
                      </CardBody>
                    </Card>
                  )}
                </div>
              </TabsContent>
            )}
          </div>
        </Tabs>
      </PageContainer>

      <ConfirmDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title="Archive this workspace?"
        description="It will be hidden from your workspace list. Nothing is deleted, and it can be restored."
        confirmLabel="Archive workspace"
        tone="danger"
        loading={archiveWorkspace.loading}
        onConfirm={() => {
          void archiveWorkspace.run().then((outcome) => {
            if (outcome.ok) {
              setConfirmArchive(false);
              reloadWorkspace();
            }
          });
        }}
      />

      <ConfirmDialog
        open={confirmDeleteWorkspace}
        onOpenChange={setConfirmDeleteWorkspace}
        title="Delete this workspace?"
        description={`"${workspace?.name ?? 'This workspace'}" and everything in it will be removed. This cannot be undone.`}
        confirmLabel="Delete workspace"
        tone="danger"
        loading={deleteWorkspace.loading}
        onConfirm={() => {
          void deleteWorkspace.run().then((outcome) => {
            if (outcome.ok) navigate('/workspaces', { replace: true });
          });
        }}
      />

      <ConfirmDialog
        open={confirmDeleteAccount}
        onOpenChange={setConfirmDeleteAccount}
        title="Delete your account?"
        description="Your account will be removed and you will be signed out. This cannot be undone."
        confirmLabel="Delete my account"
        tone="danger"
        loading={deleteAccount.loading}
        onConfirm={() => {
          void deleteAccount.run().then((outcome) => {
            if (outcome.ok) {
              void logout().then(() => navigate('/login', { replace: true }));
            }
          });
        }}
      />
    </>
  );
};
