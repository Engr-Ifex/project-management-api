import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { EnvelopeSimple } from '@phosphor-icons/react';

import { FormAlert } from '@/components/FormAlert';
import { Button, Input } from '@/components/ui/shell';
import { AuthShell } from '@/layouts/AuthShell';
import { authApi } from '@/lib/api';
import { hasErrors, validateForgotPassword, type FieldErrors } from '@/lib/auth/validation';
import { useDocumentTitle, useMutation } from '@/lib/hooks';

/**
 * Forgot password.
 *
 * ## The confirmation says nothing about the account
 *
 * On success this screen says one thing and only one thing: *if* an account
 * exists for that address, a link is on its way. It does not confirm the
 * address, and it does not report a failure — because the endpoint cannot
 * distinguish "no such account" from "the provider refused the message" without
 * becoming an account-existence oracle, and neither can this page.
 *
 * That is why the success state is reached by *any* accepted request, including
 * one for an address that has never signed up. A form that said "we could not
 * find that account" would be a free user-enumeration tool: type an address, and
 * the product tells you whether that person uses it. For a tool where membership
 * of a workspace is itself private information, that is a real disclosure.
 *
 * The trade is that a genuine typo looks identical to success. That is
 * unavoidable — the whole point is to answer the same way either way — and it is
 * mitigated by the wording: "if an account exists" invites the user to check the
 * address they typed rather than telling them it worked.
 */
export const ForgotPassword = () => {
  useDocumentTitle('Reset your password');

  const [email, setEmail] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitted, setSubmitted] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);

  const { run, loading, error, reset } = useMutation((value: string) =>
    authApi.forgotPassword(value)
  );

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const next = validateForgotPassword({ email });
    setFieldErrors(next);

    if (hasErrors(next)) {
      emailRef.current?.focus();
      return;
    }

    const outcome = await run(email);

    /*
     * Any accepted request lands here. A 4xx from the validator would already
     * have been caught above, so what remains is a transport failure — which is
     * reported, because "we could not reach the server" is not information about
     * any account and hiding it would just leave the user waiting.
     */
    if (outcome.ok) setSubmitted(true);
  };

  if (submitted) {
    return (
      <AuthShell
        title="Check your email"
        description="If that address has an account, a reset link is on its way."
        footer={
          <Link to="/login" className="font-medium text-accent-600 hover:text-accent-700">
            Back to sign in
          </Link>
        }
      >
        <div className="flex items-start gap-3">
          <EnvelopeSimple
            aria-hidden
            weight="fill"
            className="mt-0.5 size-5 shrink-0 text-body-subtle"
          />
          <p className="text-sm text-body-muted">
            The link works for one hour and can only be used once. If it does not arrive, check the
            spelling of the address you entered, and look in your spam folder.
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password"
      description="Enter your email and we will send you a link to choose a new one."
      footer={
        <>
          Remembered it?{' '}
          <Link to="/login" className="font-medium text-accent-600 hover:text-accent-700">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        {error && (
          <FormAlert tone="danger">
            {error.isRateLimited
              ? 'Too many requests. Wait a few minutes, then try again.'
              : error.message}
          </FormAlert>
        )}

        <Input
          ref={emailRef}
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          required
          autoFocus
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setFieldErrors({});
            reset();
          }}
          error={fieldErrors.email ?? error?.fieldError('email')}
        />

        <Button type="submit" variant="primary" size="lg" block loading={loading}>
          Send reset link
        </Button>
      </form>
    </AuthShell>
  );
};
