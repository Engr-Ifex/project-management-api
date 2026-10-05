import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { FormAlert } from '@/components/FormAlert';
import { Button, Input, PasswordInput } from '@/components/ui';
import { AuthShell } from '@/layouts/AuthShell';
import { useAuth } from '@/lib/auth/AuthProvider';
import { intendedDestination } from '@/lib/auth/redirect';
import { hasErrors, validateLogin, type FieldErrors } from '@/lib/auth/validation';
import { useDocumentTitle, useMutation } from '@/lib/hooks';

/**
 * Login.
 *
 * There is no refresh token and no "remember me" — the cookie is httpOnly and
 * lives 15 minutes. So there is nothing to persist here and no client-side
 * session to construct; a successful POST sets the cookie and the provider is
 * told who the user is from the response.
 *
 * There is also no "Forgot password?" link. The backend has no reset endpoint
 * (`auth.routes.js` registers exactly register, login and logout), so such a
 * link could only lead to a form that cannot work. `Input` supports a
 * `labelAction` slot for the day that changes; leaving it empty is the honest
 * choice today.
 *
 * The destination comes from router state, set by `RequireAuth` when it bounced
 * the user here — including when a session expired mid-task, so signing back in
 * returns them to what they were doing rather than to a dashboard.
 */
/** The fields this form renders, used to decide whether a 400 is fully inline. */
const FORM_FIELDS = ['email', 'password'];

export const Login = () => {
  useDocumentTitle('Sign in');
  const { login, sessionExpired, clearSessionExpired } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const { run, loading, error, reset } = useMutation(login);

  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Same helper the guards use, so the form and `RequireAnonymous` cannot
  // disagree about where a successful sign-in should land.
  const from = intendedDestination(location.state);

  /*
   * Our errors and the API's are merged, not layered: the client's answer wins
   * if it has one, otherwise the server's. They are the same strings for the
   * same rules, so which one spoke is invisible to the user — which is the
   * point. A field the server rejects for a reason we do not model locally still
   * shows the server's message.
   */
  const errorFor = (field: string) => fieldErrors[field] ?? error?.fieldError(field);

  /** Drops the local error for a field the moment the user edits it. */
  const clearFieldError = (field: string) => {
    setFieldErrors((current) => {
      if (!current[field]) return current;

      const next = { ...current };
      delete next[field];
      return next;
    });

    // A message about the previous attempt must not survive the next keystroke.
    reset();
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();

    // The notice has done its job the moment the user starts signing in again.
    clearSessionExpired();

    const next = validateLogin({ email, password });
    setFieldErrors(next);

    if (hasErrors(next)) {
      /*
       * Send focus to the first field that failed. Without this, a keyboard user
       * is left on the submit button with the explanation rendered below them
       * and, on a small screen, off-screen entirely.
       */
      (next.email ? emailRef : passwordRef).current?.focus();
      return;
    }

    const outcome = await run(email, password);

    if (outcome.ok) navigate(from, { replace: true });
  };

  /*
   * A 401 here means "wrong credentials". The API returns one message for both a
   * bad email and a bad password, which is correct — distinguishing them would
   * turn this form into an account-enumeration oracle — so the form must not
   * invent a distinction either.
   *
   * A 400 is a validation failure, and it is suppressed in favour of the inline
   * messages only when every field it names is one this form renders. An error
   * naming a field that is not here would otherwise disappear entirely, leaving
   * a form that refuses to submit and says nothing.
   */
  const formError = (() => {
    if (!error) return undefined;
    if (error.isRateLimited) return 'Too many attempts. Wait a few minutes, then try again.';
    if (error.isUnauthorized) return 'That email and password do not match an account.';

    const allFieldsRendered =
      error.status === 400 &&
      error.errors.length > 0 &&
      error.errors.every((fieldError) => fieldError.field && FORM_FIELDS.includes(fieldError.field));

    if (allFieldsRendered) return undefined;

    return error.message;
  })();

  return (
    <AuthShell
      title="Sign in"
      description="Use your email and password to continue."
      footer={
        <>
          No account?{' '}
          <Link to="/register" className="font-medium text-accent-600 hover:text-accent-700">
            Create one
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        {sessionExpired && (
          <FormAlert tone="info">
            Your session ended. Sign in again and we will take you back to where you were.
          </FormAlert>
        )}

        {formError && <FormAlert tone="danger">{formError}</FormAlert>}

        <div className="flex flex-col gap-4">
          <Input
            ref={emailRef}
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            required
            // The first field on the only screen an unauthenticated user can
            // reach; saving them a Tab is worth it, and it is not a surprise
            // because the page has nothing else to do.
            autoFocus
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              clearFieldError('email');
            }}
            error={errorFor('email')}
          />

          <PasswordInput
            ref={passwordRef}
            label="Password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              clearFieldError('password');
            }}
            error={errorFor('password')}
          />
        </div>

        <Button type="submit" variant="primary" size="lg" block loading={loading}>
          Sign in
        </Button>
      </form>
    </AuthShell>
  );
};
