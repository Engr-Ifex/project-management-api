import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { AuthShell } from '@/components/AuthShell';
import { Button, Input } from '@/components/ui';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useDocumentTitle, useMutation } from '@/lib/hooks';

/**
 * Login.
 *
 * There is no refresh token and no "remember me" — the cookie is httpOnly and
 * lives 15 minutes. So there is nothing to persist here and no client-side
 * session to construct; a successful POST sets the cookie and the provider is
 * told who the user is from the response.
 *
 * The destination comes from router state, set by `RequireAuth` when it bounced
 * the user here. Landing on a dashboard after clicking a deep link is a small
 * thing that users notice immediately.
 */
export const Login = () => {
  useDocumentTitle('Sign in');

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { run, loading, error } = useMutation(login);

  const from = (location.state as { from?: string } | null)?.from ?? '/workspaces';

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const outcome = await run(email, password);
    if (outcome.ok) navigate(from, { replace: true });
  };

  /*
   * A 401 on login means "wrong credentials" and is worth saying plainly. The
   * API returns one message for both a bad email and a bad password, which is
   * correct — distinguishing them would let an attacker enumerate accounts — so
   * the form must not invent a distinction either.
   */
  const formError = error
    ? error.isRateLimited
      ? 'Too many attempts. Wait a few minutes before trying again.'
      : error.isUnauthorized
        ? 'That email and password do not match an account.'
        : error.message
    : undefined;

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
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {formError && (
          <p
            role="alert"
            className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-700"
          >
            {formError}
          </p>
        )}

        <Input
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={error?.fieldError('email')}
        />

        <Input
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={error?.fieldError('password')}
        />

        <Button type="submit" variant="primary" size="lg" block loading={loading}>
          Sign in
        </Button>
      </form>
    </AuthShell>
  );
};
