import { cva, type VariantProps } from 'class-variance-authority';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

/*
 * Badge
 *
 * A small, non-interactive label. Two shapes: `soft` (a tinted chip) and
 * `outline` (a bordered pill). Soft is the default because these appear in
 * dense lists where a border on every row would add noise.
 *
 * The tint is always the hue at ~8% on a light surface, never the hue itself.
 * A solid coloured chip in a table of forty rows turns the table into a
 * colour field and the status stops being readable.
 *
 * Counts use the `mono` variant: tabular figures keep a column of numbers
 * aligned, which proportional digits do not.
 */
const badgeStyles = cva(
  ['inline-flex items-center gap-1 whitespace-nowrap font-medium', 'border'],
  {
    variants: {
      tone: {
        neutral: 'bg-ink-100 text-ink-700 border-ink-200',
        accent: 'bg-accent-50 text-accent-700 border-accent-100',
        success: 'bg-success-50 text-success-700 border-success-100',
        warning: 'bg-warning-50 text-warning-700 border-warning-100',
        caution: 'bg-caution-50 text-caution-700 border-caution-100',
        danger: 'bg-danger-50 text-danger-700 border-danger-100',
      },
      variant: {
        soft: '',
        outline: 'bg-transparent',
      },
      size: {
        sm: 'h-4.5 rounded-xs px-1.5 text-2xs',
        md: 'h-5 rounded-sm px-2 text-xs',
      },
      shape: {
        pill: 'rounded-full',
        square: '',
      },
    },
    compoundVariants: [
      // Outline keeps the text colour but drops the fill.
      { variant: 'outline', tone: 'neutral', class: 'border-line-strong text-body-muted' },
      { variant: 'outline', tone: 'accent', class: 'border-accent-200 text-accent-700' },
      { variant: 'outline', tone: 'success', class: 'border-success-200 text-success-700' },
      { variant: 'outline', tone: 'warning', class: 'border-warning-200 text-warning-700' },
      { variant: 'outline', tone: 'caution', class: 'border-caution-200 text-caution-700' },
      { variant: 'outline', tone: 'danger', class: 'border-danger-200 text-danger-700' },
    ],
    defaultVariants: {
      tone: 'neutral',
      variant: 'soft',
      size: 'md',
      shape: 'square',
    },
  }
);

export interface BadgeProps extends VariantProps<typeof badgeStyles> {
  children: ReactNode;
  /** Rendered before the label — a status dot or a small icon. */
  icon?: ReactNode;
  className?: string;
}

export const Badge = ({ children, icon, tone, variant, size, shape, className }: BadgeProps) => (
  <span className={cn(badgeStyles({ tone, variant, size, shape }), className)}>
    {icon}
    {children}
  </span>
);

/**
 * A small solid dot. The most compact way to carry status in a dense list,
 * where a full chip per row would be too heavy.
 */
export const StatusDot = ({
  tone = 'neutral',
  className,
}: {
  tone?: NonNullable<BadgeProps['tone']>;
  className?: string;
}) => (
  <span
    aria-hidden
    className={cn(
      'size-1.5 shrink-0 rounded-full',
      {
        neutral: 'bg-ink-400',
        accent: 'bg-accent-500',
        success: 'bg-success-500',
        warning: 'bg-warning-500',
        caution: 'bg-caution-500',
        danger: 'bg-danger-500',
      }[tone],
      className
    )}
  />
);

export { badgeStyles };
