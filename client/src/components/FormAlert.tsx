import { Info, WarningCircle, XCircle } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

/*
 * FormAlert
 *
 * The one-line banner above a form: "that password is wrong", "your session
 * ended". It is not a toast — a toast is for something that already happened and
 * can be missed, whereas this has to stay on screen next to the field it is
 * about until the user acts on it.
 *
 * The two roles are not interchangeable:
 *
 * - `danger`/`warning` use `role="alert"`, which is announced immediately and
 *   interrupts. Correct for a failure the user just triggered.
 * - `info` uses `role="status"`, which waits for a pause in speech. Correct for
 *   the session-expiry notice, which is context rather than a rejection, and
 *   which would otherwise cut off whatever the screen reader was saying when the
 *   user landed on the page.
 *
 * `role="alert"` also implies `aria-live="assertive"`; setting both is noise.
 */

type AlertTone = 'danger' | 'warning' | 'info';

const TONES: Record<AlertTone, { className: string; icon: ReactNode; role: 'alert' | 'status' }> = {
  danger: {
    className: 'border-danger-200 bg-danger-50 text-danger-700',
    icon: <XCircle aria-hidden weight="fill" className="size-4 shrink-0" />,
    role: 'alert',
  },
  warning: {
    className: 'border-warning-200 bg-warning-50 text-warning-700',
    icon: <WarningCircle aria-hidden weight="fill" className="size-4 shrink-0" />,
    role: 'alert',
  },
  info: {
    className: 'border-accent-200 bg-accent-50 text-accent-700',
    icon: <Info aria-hidden weight="fill" className="size-4 shrink-0" />,
    role: 'status',
  },
};

export const FormAlert = ({
  tone = 'danger',
  children,
  className,
}: {
  tone?: AlertTone;
  children: ReactNode;
  className?: string;
}) => {
  const { className: toneClassName, icon, role } = TONES[tone];

  return (
    <div
      role={role}
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2 text-xs',
        // Slightly tighter leading than the default: these are one or two lines.
        'leading-relaxed',
        toneClassName,
        className
      )}
    >
      <span className="mt-px">{icon}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
};
