import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { FormAlert } from '@/components/FormAlert';
import { Button, Input, PasswordInput } from '@/components/ui';
import { AuthShell } from '@/layouts/AuthShell';
import { useAuth } from '@/lib/auth/AuthProvider';
import { hasErrors, validateRegister, type FieldErrors } from '@/lib/auth/validation';
import { useDocumentTitle, useMutation } from '@/lib/hooks';

/**
 * Register.
 *
 * The form is exactly what `POST /auth/register` accepts: name, email, password.
 * There is no confirmation field, because the endpoint has no `confirmPassword`
 * and a second input would be a client-side fiction — it would also imply a
 * password-reset path to recover from a typo, and the backend has none.
 *
 * The only password rule the API enforces is **a minimum of 8 characters** — no
 * uppercase, digit or symbol requirement. The hint says exactly that rather than
 * the usual four-item checklist, because a checklist that is not enforced
 * teaches users that the rules are decorative.
 *
 * Registering signs the user in (the endpoint sets the cookie), so this goes
 * straight to the workspace list rather than back to login.
 */
/** The fields this form renders, used to decide whether a 400 is fully inline. */
const FORM_FIELDS = ['name', 'email', 'password'];

export const Register = () => {
  useDocumentTitle('Create an account');

  const { register } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const { run, loading, error, reset } = useMutation(register);

  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  /*
   * A 409 is "that email is taken". The API reports it as a status, not as a
   * field error, but email is the only unique field on this endpoint — so it
   * belongs on the email input rather than in a banner the user has to connect
   * back to a field themselves.
   */
  const conflictMessage = error?.isConflict
    ? 'An account with that email already exists.'
    : undefined;

  const errorFor = (field: string) =>
    fieldErrors[field] ?? error?.fieldError(field) ?? (field === 'email' ? conflictMessage : undefined);

  const clearFieldError = (field: string) => {
    setFieldErrors((current) => {
      if (!current[field]) return current;

      const next = { ...current };
      delete next[field];
      return next;
    });

    reset();
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const next = validateRegister({ name, email, password });
    setFieldErrors(next);

    if (hasErrors(next)) {
      // Focus the first failure, so the message is never rendered out of sight.
      const firstInvalid = next.name ? nameRef : next.email ? emailRef : passwordRef;
      firstInvalid.current?.focus();
      return;
    }

    const outcome = await run(name, email, password);

    if (outcome.ok) navigate('/workspaces', { replace: true });
  };

  /*
   * Field-level problems are already rendered on their fields, so only what has
   * nowhere else to go reaches the banner: the rate limit, and any 400 naming a
   * field this form does not render. A 409 stays on the email input too.
   */
  const formError = (() => {
    if (!error) return undefined;
    if (error.isConflict) return undefined;
    if (error.isRateLimited) return 'Too many attempts. Wait a few minutes, then try again.';

    const allFieldsRendered =
      error.status === 400 &&
      error.errors.length > 0 &&
      error.errors.every((fieldError) => fieldError.field && FORM_FIELDS.includes(fieldError.field));

    if (allFieldsRendered) return undefined;

    return error.message;
  })();

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
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        {formError && <FormAlert tone="danger">{formError}</FormAlert>}

        <div className="flex flex-col gap-4">
          <Input
            ref={nameRef}
            label="Name"
            name="name"
            autoComplete="name"
            required
            autoFocus
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              clearFieldError('name');
            }}
            error={errorFor('name')}
          />

          <Input
            ref={emailRef}
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            required
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
            autoComplete="new-password"
            required
            hint="At least 8 characters."
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              clearFieldError('password');
            }}
            error={errorFor('password')}
          />
        </div>

        <Button type="submit" variant="primary" size="lg" block loading={loading}>
          Create account
        </Button>
      </form>
    </AuthShell>
  );
};
