import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { AuthShell } from '@/layouts/AuthShell';
import { FullPageLoader } from '@/routes/guards';
import { Button, ErrorState } from '@/components/ui';
import { workspacesApi } from '@/lib/api';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useDocumentTitle, useMutation } from '@/lib/hooks';

/**
 * Accepting an invitation.
 *
 * This screen exists because the API sends **no email**. The invitation response
 * carries a 64-character token and that token is the only way in, so the inviting
 * user has to pass it on themselves and the invitee has to arrive here with it.
 *
 * The route is deliberately public. An invited person usually does not have an
 * account yet, so bouncing them to login before they can even see what they were
 * invited to is the wrong order. Instead the page explains the invitation and
 * offers sign-in / sign-up with the token preserved in the URL.
 */
export const AcceptInvitation = () => {
  useDocumentTitle('Accept invitation');

  const { token } = useParams<{ token: string }>();
  const { status } = useAuth();
  const navigate = useNavigate();
  const [accepted, setAccepted] = useState(false);
  const { run, loading, error } = useMutation(workspacesApi.acceptInvitation);

  if (status === 'loading') return <FullPageLoader label="Checking your session" />;

  if (!token) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-canvas">
        <ErrorState
          variant="page"
          title="This invitation link is incomplete"
          description="The link is missing its token. Ask the person who invited you to send it again."
        />
      </div>
    );
  }

  if (status === 'anonymous') {
    const next = `/invitations/${token}`;
    return (
      <AuthShell
        title="You have been invited"
        description="Sign in or create an account to join the workspace. This invitation stays valid after you sign in."
      >
        <div className="flex flex-col gap-2">
          <Link to="/login" state={{ from: next }} className="contents">
            <Button variant="primary" size="lg" block>
              Sign in to accept
            </Button>
          </Link>

          <Link to="/register" className="contents">
            <Button variant="secondary" size="lg" block>
              Create an account
            </Button>
          </Link>
        </div>

        <p className="text-2xs text-body-subtle">
          Invitation token: <code className="break-all font-mono">{token}</code>
        </p>
      </AuthShell>
    );
  }

  const accept = async () => {
    const outcome = await run(token);
    if (outcome.ok) {
      setAccepted(true);
      navigate(`/workspaces/${outcome.data.workspace.id}`, { replace: true });
    }
  };

  return (
    <AuthShell
      title="Accept your invitation"
      description="You will be added to the workspace as soon as you accept."
    >
      {error && (
        <p
          role="alert"
          className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-700"
        >
          {error.isNotFound
            ? 'This invitation is no longer valid. It may have been accepted already, or it may have expired.'
            : error.message}
        </p>
      )}

      <Button
        variant="primary"
        size="lg"
        block
        loading={loading}
        disabled={accepted}
        onClick={() => void accept()}
      >
        {accepted ? 'Accepted' : 'Accept invitation'}
      </Button>

      <Link to="/workspaces" className="text-center text-xs text-body-muted hover:text-body">
        Not now
      </Link>
    </AuthShell>
  );
};
