import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle, WarningCircle } from '@phosphor-icons/react';

import { FormAlert } from '@/components/FormAlert';
import { Button, PasswordInput } from '@/components/ui/shell';
import { AuthShell } from '@/layouts/AuthShell';
import { authApi } from '@/lib/api';
import { hasErrors, validateResetPassword, type FieldErrors } from '@/lib/auth/validation';
import { useDocumentTitle, useMutation } from '@/lib/hooks';

/**
 * Reset password.
 *
 * ## The token is validated by the server, not by this page
 *
 * There is no "check the token" call before the form renders. A link that has
 * expired or been spent still shows the form, and the rejection arrives when it
 * is submitted — which is the correct order. Pre-validating would add a round
 * trip to the page load, would let anyone test tokens by loading the page, and
 * would still not be authoritative, because the token could expire between the
 * check and the submit.
 *
 * ## No session is created
 *
 * A successful reset does not sign the user in. The password change invalidates
 * every access token already issued for the account — that is how this
 * architecture revokes sessions — so a cookie set here would be rejected by the
 * very next request. The user signs in with the password they just chose, which
 * also proves it works.
 *
 * ## The token lives only in this component
 *
 * Read from the query string, held in the URL for the life of the page, never
 * written to storage: a reset token in persistent storage outlives the tab,
 * survives a sign-out, and is readable by any script on the origin. There is
 * nothing to gain — the page uses it once — and a durable copy is a durable
 * liability.
 */
export const ResetPassword = () => {
  useDocumentTitle('Choose a new password');

  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [done, setDone] = useState(false);

  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  const { run, loading, error, reset } = useMutation(
    (values: { token: string; password: string }) => authApi.resetPassword(values)
  );

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!token) return;

    const next = validateResetPassword({ password, confirmPassword });
    setFieldErrors(next);

    if (hasErrors(next)) {
      const firstInvalid = next.password ? passwordRef : confirmRef;
      firstInvalid.current?.focus();
      return;
    }

    const outcome = await run({ token, password });

    if (outcome.ok) setDone(true);
  };

  const clearErrors = () => {
    setFieldErrors({});
    reset();
  };

  /* ----------------------------------------------------------- no token --- */

  /*
   * Reached when someone navigates here directly, or opens a link whose query
   * string was truncated by a mail client. There is nothing to submit, so the
   * only useful action is to request a fresh link.
   */
  if (!token) {
    return (
      <AuthShell
        title="This link is incomplete"
        description="It is missing the reset token, so there is nothing to confirm."
        footer={
          <Link to="/login" className="font-medium text-accent-600 hover:text-accent-700">
            Back to sign in
          </Link>
        }
      >
        <p className="text-sm text-body-muted">
          Request a new link and open it directly from the email — some mail clients break long
          links across lines.
        </p>

        <div className="mt-5">
          <Link to="/forgot-password" className="font-medium text-accent-600 hover:text-accent-700">
            Send me a new link
          </Link>
        </div>
      </AuthShell>
    );
  }

  /* ----------------------------------------------------------- success --- */

  if (done) {
    return (
      <AuthShell
        title="Password updated"
        description="Your new password is ready to use."
        footer={
          <Link to="/login" className="font-medium text-accent-600 hover:text-accent-700">
            Sign in
          </Link>
        }
      >
        <div className="flex items-start gap-3">
          <CheckCircle
            aria-hidden
            weight="fill"
            className="mt-0.5 size-5 shrink-0 text-accent-600"
          />
          <p className="text-sm text-body-muted">
            You have been signed out everywhere as a precaution. Sign in with your new password to
            continue.
          </p>
        </div>
      </AuthShell>
    );
  }

  /* -------------------------------------------------------------- form --- */

  /*
   * A rejected token is terminal for this page: the link is spent or stale and
   * no amount of retrying will help. Showing the form again would invite the
   * user to keep submitting into a dead end, so the error replaces it and the
   * only way forward is a new link.
   */
  const tokenRejected = error?.status === 400 && !error.fieldError('password');

  if (tokenRejected) {
    return (
      <AuthShell
        title="That link did not work"
        description="It may have expired, or already been used."
        footer={
          <Link to="/login" className="font-medium text-accent-600 hover:text-accent-700">
            Back to sign in
          </Link>
        }
      >
        <div className="flex flex-col gap-5">
          <div className="flex items-start gap-3">
            <WarningCircle
              aria-hidden
              weight="fill"
              className="mt-0.5 size-5 shrink-0 text-warning-600"
            />
            <p className="text-sm text-body-muted">{error.message}</p>
          </div>

          <Link to="/forgot-password" className="font-medium text-accent-600 hover:text-accent-700">
            Send me a new link
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Choose a new password"
      description="You will be signed out everywhere once this is saved."
      footer={
        <Link to="/login" className="font-medium text-accent-600 hover:text-accent-700">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        {error && !tokenRejected && (
          <FormAlert tone="danger">
            {error.isRateLimited
              ? 'Too many attempts. Wait a few minutes, then try again.'
              : error.message}
          </FormAlert>
        )}

        <div className="flex flex-col gap-4">
          <PasswordInput
            ref={passwordRef}
            label="New password"
            name="password"
            autoComplete="new-password"
            required
            autoFocus
            hint="At least 8 characters."
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              clearErrors();
            }}
            error={fieldErrors.password ?? error?.fieldError('password')}
          />

          <PasswordInput
            ref={confirmRef}
            label="Confirm new password"
            name="confirmPassword"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(event) => {
              setConfirmPassword(event.target.value);
              clearErrors();
            }}
            error={fieldErrors.confirmPassword}
          />
        </div>

        <Button type="submit" variant="primary" size="lg" block loading={loading}>
          Save new password
        </Button>
      </form>
    </AuthShell>
  );
};
