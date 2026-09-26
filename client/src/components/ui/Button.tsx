import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { CircleNotch } from '@phosphor-icons/react';

import { cn } from '@/lib/utils/cn';

/*
 * Button
 *
 * Five variants, three sizes, and one rule: the primary variant is graphite,
 * not the accent. In this product colour is information — teal means "in
 * progress", red means "urgent" — so a coloured primary button would compete
 * with the data it sits next to. Graphite reads as decisive without claiming a
 * hue that already means something.
 *
 * The accent is used only for `link` and for focus rings.
 */
const buttonStyles = cva(
  [
    'inline-flex items-center justify-center gap-1.5 whitespace-nowrap',
    'font-medium select-none',
    'transition-[background-color,border-color,color,box-shadow,transform] duration-[120ms] ease-standard',
    'disabled:pointer-events-none disabled:opacity-45',
    // Tactile feedback: a 1px press, not a bounce.
    'active:scale-[0.985]',
  ],
  {
    variants: {
      variant: {
        primary: [
          'bg-ink-900 text-body-inverse shadow-xs',
          'hover:bg-ink-800',
          'active:bg-ink-950',
        ],
        secondary: [
          'bg-surface text-body border border-line-strong shadow-xs',
          'hover:bg-surface-hover hover:border-ink-400',
          'active:bg-surface-active',
        ],
        ghost: ['bg-transparent text-body-muted', 'hover:bg-surface-active hover:text-body'],
        danger: ['bg-danger-600 text-body-inverse shadow-xs', 'hover:bg-danger-700'],
        link: [
          'bg-transparent text-accent-600 underline-offset-4 px-0',
          'hover:text-accent-700 hover:underline',
        ],
      },
      size: {
        sm: 'h-7 rounded-sm text-xs px-2.5',
        md: 'h-8 rounded-md text-sm px-3',
        lg: 'h-9 rounded-md text-base px-4',
      },
      block: {
        true: 'w-full',
      },
      // A link is not a control with a fixed height.
      asLink: {
        true: 'h-auto px-0',
      },
    },
    defaultVariants: {
      variant: 'secondary',
      size: 'md',
    },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonStyles> {
  /** Shows a spinner and disables interaction. The label stays for width stability. */
  loading?: boolean;
  /** Icon rendered before the label. Pass a Phosphor icon element. */
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, block, asLink, loading, iconLeft, iconRight, children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      // A spinner is not a reason to lose the label's accessible name.
      aria-busy={loading || undefined}
      disabled={props.disabled || loading}
      className={cn(buttonStyles({ variant, size, block, asLink }), className)}
      {...props}
    >
      {loading ? (
        <CircleNotch
          aria-hidden
          className="size-3.5 shrink-0 animate-spin [animation-duration:700ms]"
        />
      ) : (
        iconLeft
      )}
      {children}
      {!loading && iconRight}
    </button>
  );
});

/**
 * IconButton — a square button whose only child is an icon.
 *
 * `label` is required and becomes the accessible name. An icon-only control
 * without one is invisible to a screen reader, and there is no visual hint to
 * tell you it is missing.
 */
export interface IconButtonProps extends Omit<ButtonProps, 'iconLeft' | 'iconRight'> {
  label: string;
  /** Render the label as a tooltip. Off by default; pair with `<Tooltip>` instead. */
  icon: React.ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, className, variant = 'ghost', size = 'md', ...props },
  ref
) {
  return (
    <button
      ref={ref}
      aria-label={label}
      title={label}
      className={cn(
        buttonStyles({ variant, size }),
        // Square, and never wider than tall.
        'aspect-square px-0',
        size === 'sm' ? 'size-7' : size === 'lg' ? 'size-9' : 'size-8',
        className
      )}
      {...props}
    >
      {icon}
    </button>
  );
});

export { buttonStyles };
