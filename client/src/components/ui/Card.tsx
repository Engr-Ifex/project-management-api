import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

/*
 * Card
 *
 * A bordered surface. Composable rather than configured — `Card.Header`,
 * `Card.Body`, `Card.Footer` — because a dashboard panel, a form section and a
 * stat tile need the same shell with different insides.
 *
 * The radius is 10px and the shadow is a hairline. Larger radii and heavier
 * shadows are the most reliable signal of a template, and at this density the
 * border is what actually separates a panel from the canvas; the shadow only
 * adds a hint of lift.
 *
 * For a list of similar items, prefer dividers (`divide-y`) over a card each.
 * Forty bordered boxes stacked vertically is noise; forty rows separated by a
 * hairline is a table.
 */

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Removes the shadow for cards nested inside another surface. */
  flat?: boolean;
}

export const Card = ({ className, flat, ...props }: CardProps) => (
  <div
    className={cn(
      'bg-surface border border-line rounded-lg',
      !flat && 'shadow-xs',
      className
    )}
    {...props}
  />
);

export const CardHeader = ({
  title,
  description,
  action,
  className,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  /** Right-aligned controls. A button, a menu, a segmented filter. */
  action?: ReactNode;
  className?: string;
  children?: ReactNode;
}) => (
  <div
    className={cn(
      'flex items-start justify-between gap-4 px-4 py-3 border-b border-line-subtle',
      className
    )}
  >
    {children ?? (
      <div className="flex min-w-0 flex-col gap-0.5">
        {title && <h2 className="text-sm font-semibold text-body truncate">{title}</h2>}
        {description && <p className="text-xs text-body-subtle">{description}</p>}
      </div>
    )}
    {action && <div className="flex shrink-0 items-center gap-1">{action}</div>}
  </div>
);

export const CardBody = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('p-4', className)} {...props} />
);

export const CardFooter = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      'flex items-center justify-between gap-2 px-4 py-3 border-t border-line-subtle bg-ink-25 rounded-b-lg',
      className
    )}
    {...props}
  />
);

/**
 * StatTile — a single figure with a label.
 *
 * Used on both dashboards. The figure is `text-2xl`, not `text-5xl`: it needs
 * to read as the most important thing in a 160px box, not shout across the
 * page. The delta is optional and coloured semantically.
 */
export const StatTile = ({
  label,
  value,
  delta,
  tone = 'neutral',
  hint,
  className,
}: {
  label: string;
  value: ReactNode;
  delta?: ReactNode;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
  hint?: ReactNode;
  className?: string;
}) => (
  <div className={cn('flex flex-col gap-1 p-4', className)}>
    <span className="text-xs font-medium text-body-muted">{label}</span>

    <div className="flex items-baseline gap-2">
      <span className="text-2xl font-semibold tracking-tight text-body" data-numeric>
        {value}
      </span>
      {delta && (
        <span
          className={cn('text-xs font-medium', {
            neutral: 'text-body-subtle',
            accent: 'text-accent-600',
            success: 'text-success-600',
            warning: 'text-warning-600',
            danger: 'text-danger-600',
          }[tone])}
        >
          {delta}
        </span>
      )}
    </div>

    {hint && <span className="text-xs text-body-subtle">{hint}</span>}
  </div>
);
