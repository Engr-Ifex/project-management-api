import { Eye, EyeSlash } from '@phosphor-icons/react';
import { forwardRef, useState } from 'react';

import { cn } from '@/lib/utils/cn';
import { Input, type InputProps } from './Input';

/*
 * PasswordInput
 *
 * An `Input` that can be revealed. The alternative — asking someone to type a
 * secret into a field they cannot read, with no way to check it — is the single
 * most common cause of a failed first sign-in, and on this API it is worse than
 * usual: there is no password-reset endpoint, so a typo is unrecoverable.
 *
 * Three details make the toggle correct rather than merely present:
 *
 * - **`type="button"`.** Inside a form a bare `<button>` defaults to `submit`,
 *   so revealing the password would attempt a sign-in. This is the bug that
 *   ships in most implementations of this control.
 * - **A real button, not a clickable icon.** It is reachable by Tab and fires on
 *   Space or Enter for free, with no key handling to get wrong.
 * - **`aria-pressed` plus a label that changes.** The state is announced, not
 *   only drawn. "Show password" that stays "Show password" while the password is
 *   visible tells a screen-reader user nothing.
 *
 * The revealed state is local and never leaves this component. The password
 * itself only ever lives in the caller's form state, and is never rendered
 * anywhere except into this input's value.
 */

export type PasswordInputProps = Omit<InputProps, 'type' | 'suffix'>;

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ className, ...props }, ref) {
    const [visible, setVisible] = useState(false);

    const toggleLabel = visible ? 'Hide password' : 'Show password';

    return (
      <Input
        ref={ref}
        // `password` is the default; `text` is only ever a deliberate reveal.
        type={visible ? 'text' : 'password'}
        suffix={
          <button
            type="button"
            onClick={() => setVisible((current) => !current)}
            aria-label={toggleLabel}
            aria-pressed={visible}
            className={cn(
              'flex size-6 items-center justify-center rounded-sm',
              'text-body-subtle transition-colors duration-[120ms] ease-standard',
              'hover:text-body',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40'
            )}
          >
            {visible ? <EyeSlash aria-hidden /> : <Eye aria-hidden />}
          </button>
        }
        // A `suffix` reserves pr-8 for a decorative glyph; the toggle is a 24px
        // target and needs slightly more room so it never sits over the text.
        className={cn('pr-9', className)}
        {...props}
      />
    );
  }
);
