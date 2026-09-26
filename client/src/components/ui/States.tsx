import { MagnifyingGlass, WarningOctagon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';
import { Button } from './Button';

/*
 * Empty and error states.
 *
 * The distinction that matters, and that most products get wrong: an empty list
 * and a filtered-to-nothing list are different situations and need different
 * words. "No tasks yet" with a Create button is right when there is genuinely
 * nothing; "No tasks match these filters" with a Clear filters button is right
 * when there is plenty but none of it matches. Showing the first when the
 * second is true tells the user their data is gone.
 *
 * Both are centred, small, and quiet. An empty state is not an opportunity for
 * illustration — it is a moment where the user needs one sentence and one
 * action.
 */

export interface EmptyStateProps {
  /**
   * `empty` — there is genuinely nothing yet. Offers a create action.
   * `no-results` — filters excluded everything. Offers to clear them.
   */
  variant?: 'empty' | 'no-results';
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  /** Primary action. For `no-results` this is usually "Clear filters". */
  action?: ReactNode;
  className?: string;
}

export const EmptyState = ({
  variant = 'empty',
  title,
  description,
  icon,
  action,
  className,
}: EmptyStateProps) => (
  <div
    className={cn('flex flex-col items-center justify-center gap-3 px-6 py-12 text-center', className)}
  >
    <span
      aria-hidden
      className="flex size-9 items-center justify-center rounded-full bg-ink-100 text-body-subtle [&_svg]:size-4"
    >
      {icon ?? (variant === 'no-results' ? <MagnifyingGlass /> : <span className="text-sm">—</span>)}
    </span>

    <div className="flex max-w-sm flex-col gap-1">
      <p className="text-sm font-medium text-body">{title}</p>
      {description && <p className="text-xs text-body-subtle">{description}</p>}
    </div>

    {action && <div className="mt-1 flex items-center gap-2">{action}</div>}
  </div>
);

export interface ErrorStateProps {
  title?: string;
  description?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  /** Full-page error gets more room than one inside a panel. */
  variant?: 'panel' | 'page';
  className?: string;
}

export const ErrorState = ({
  title = 'Something went wrong',
  description = 'The request could not be completed. Try again, and if it keeps happening, reload the page.',
  onRetry,
  retryLabel = 'Try again',
  variant = 'panel',
  className,
}: ErrorStateProps) => (
  <div
    role="alert"
    className={cn(
      'flex flex-col items-center justify-center gap-3 px-6 text-center',
      variant === 'page' ? 'min-h-[60dvh] py-16' : 'py-12',
      className
    )}
  >
    <span
      aria-hidden
      className="flex size-9 items-center justify-center rounded-full bg-danger-50 text-danger-500 [&_svg]:size-4"
    >
      <WarningOctagon weight="fill" />
    </span>

    <div className="flex max-w-md flex-col gap-1">
      <p className="text-sm font-medium text-body">{title}</p>
      <p className="text-xs text-body-subtle">{description}</p>
    </div>

    {onRetry && (
      <Button variant="secondary" size="sm" onClick={onRetry} className="mt-1">
        {retryLabel}
      </Button>
    )}
  </div>
);
