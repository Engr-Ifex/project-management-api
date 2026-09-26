import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { AuthShell } from '@/layouts/AuthShell';
import { Button, Input } from '@/components/ui';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useDocumentTitle, useMutation } from '@/lib/hooks';

/**
 * Register.
 *
 * The only password rule the API enforces is **a minimum of 8 characters** —
 * no uppercase, digit or symbol requirement. The hint says exactly that rather
 * than the usual four-item checklist, because a checklist that is not enforced
 * teaches users that the rules are decorative.
 *
 * Registering signs the user in (the endpoint sets the cookie), so this goes
 * straight to the workspace list rather than back to login.
 */
export const Register = () => {
  useDocumentTitle('Create an account');

  const { register } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { run, loading, error } = useMutation(register);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const outcome = await run(name, email, password);
    if (outcome.ok) navigate('/workspaces', { replace: true });
  };

  const formError = error
    ? error.isRateLimited
      ? 'Too many attempts. Wait a few minutes before trying again.'
      : error.isConflict
        ? 'An account with that email already exists.'
        : error.message
    : undefined;

  return (
    <AuthShell
      title="Create an account"
      description="You can create or join a workspace once you are in."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-accent-600 hover:text-accent-700">
            Sign in
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
          label="Name"
          name="name"
          autoComplete="name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={error?.fieldError('name')}
        />

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
          autoComplete="new-password"
          required
          hint="At least 8 characters."
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={error?.fieldError('password')}
        />

        <Button type="submit" variant="primary" size="lg" block loading={loading}>
          Create account
        </Button>
      </form>
    </AuthShell>
  );
};
