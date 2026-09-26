import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';
import { FieldShell, useFieldControl } from './Field';

/*
 * Text controls.
 *
 * One shared style string, so an input, a textarea and a select are the same
 * height, the same radius and the same border at rest, on hover, and on focus.
 * Inputs that drift apart by a pixel are the most common tell in a hand-built
 * design system.
 */

const controlBase = [
  'w-full bg-surface text-body',
  'border border-line-strong rounded-md',
  'placeholder:text-body-subtle',
  'transition-[border-color,box-shadow] duration-[120ms] ease-standard',
  'hover:border-ink-400',
  'focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/25',
  'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-body-subtle',
  'read-only:bg-surface-sunken',
];

const invalidStyles = 'border-danger-500 focus:border-danger-500 focus:ring-danger-500/25';

/** Shared props every text control accepts for its field wrapper. */
interface FieldProps {
  label?: string;
  hint?: ReactNode;
  error?: string | null;
  containerClassName?: string;
  /** Rendered on the label row, right-aligned. Use for a "Forgot?" style link. */
  labelAction?: ReactNode;
}

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'>,
    FieldProps {
  /** Rendered inside the control, before the text. */
  prefix?: ReactNode;
  suffix?: ReactNode;
  /** Matches the control heights of the Button component. */
  inputSize?: 'sm' | 'md' | 'lg';
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    className,
    label,
    hint,
    error,
    containerClassName,
    labelAction,
    prefix,
    suffix,
    inputSize = 'md',
    id,
    required,
    ...props
  },
  ref
) {
  const field = useFieldControl(id, hint, error);

  const height =
    inputSize === 'sm' ? 'h-7 text-xs px-2' : inputSize === 'lg' ? 'h-9 text-base px-3' : 'h-8 text-sm px-2.5';

  const control = (
    <div className="relative flex items-center">
      {prefix && (
        <span
          aria-hidden
          className="pointer-events-none absolute left-2.5 flex items-center text-body-subtle [&_svg]:size-3.5"
        >
          {prefix}
        </span>
      )}

      <input
        ref={ref}
        id={field.controlId}
        required={required}
        aria-invalid={field.invalid || undefined}
        aria-describedby={field.describedBy}
        className={cn(
          controlBase,
          height,
          prefix && 'pl-8',
          suffix && 'pr-8',
          field.invalid && invalidStyles,
          className
        )}
        {...props}
      />

      {suffix && (
        <span className="absolute right-2.5 flex items-center text-body-subtle [&_svg]:size-3.5">
          {suffix}
        </span>
      )}
    </div>
  );

  if (!label && !hint && !error) return control;

  return (
    <FieldShell
      label={label}
      controlId={field.controlId}
      hint={hint}
      error={error}
      hintId={field.hintId}
      errorId={field.errorId}
      required={required}
      action={labelAction}
      className={containerClassName}
    >
      {control}
    </FieldShell>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, FieldProps {
  /** Grows with content instead of scrolling. Default false — most fields are fixed. */
  autoResize?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, label, hint, error, containerClassName, labelAction, id, required, rows = 4, ...props },
  ref
) {
  const field = useFieldControl(id, hint, error);

  const control = (
    <textarea
      ref={ref}
      id={field.controlId}
      rows={rows}
      required={required}
      aria-invalid={field.invalid || undefined}
      aria-describedby={field.describedBy}
      className={cn(
        controlBase,
        'py-2 px-2.5 text-sm resize-y min-h-20',
        field.invalid && invalidStyles,
        className
      )}
      {...props}
    />
  );

  if (!label && !hint && !error) return control;

  return (
    <FieldShell
      label={label}
      controlId={field.controlId}
      hint={hint}
      error={error}
      hintId={field.hintId}
      errorId={field.errorId}
      required={required}
      action={labelAction}
      className={containerClassName}
    >
      {control}
    </FieldShell>
  );
});

export { controlBase, invalidStyles };
