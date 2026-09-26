import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check, Minus } from '@phosphor-icons/react';
import { forwardRef, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

/*
 * Checkbox
 *
 * Radix supplies the behaviour that is easy to get wrong — the hidden native
 * input that makes it submit with a form, indeterminate state, and keyboard
 * toggling. The 16px box, the 3px radius and the 1px press are ours.
 *
 * The label is part of the component rather than left to the caller: a bare
 * checkbox with a sibling `<span>` looks identical but is not clickable and is
 * not announced as a single control.
 */

export interface CheckboxProps {
  checked?: boolean | 'indeterminate';
  onCheckedChange?: (checked: boolean | 'indeterminate') => void;
  disabled?: boolean;
  label?: ReactNode;
  /** Secondary line under the label, for a longer explanation. */
  description?: ReactNode;
  error?: string | null;
  name?: string;
  value?: string;
  id?: string;
  className?: string;
}

export const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(function Checkbox(
  { checked, onCheckedChange, disabled, label, description, error, name, value, id, className },
  ref
) {
  const control = (
    <CheckboxPrimitive.Root
      ref={ref}
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      name={name}
      value={value}
      aria-invalid={error ? true : undefined}
      className={cn(
        'peer size-4 shrink-0 rounded-xs border border-line-strong bg-surface',
        'flex items-center justify-center',
        'transition-[background-color,border-color,transform] duration-[120ms] ease-standard',
        'hover:border-ink-400',
        'focus-visible:border-accent-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/25',
        'data-[state=checked]:border-ink-900 data-[state=checked]:bg-ink-900 data-[state=checked]:text-body-inverse',
        'data-[state=indeterminate]:border-ink-900 data-[state=indeterminate]:bg-ink-900 data-[state=indeterminate]:text-body-inverse',
        'disabled:cursor-not-allowed disabled:opacity-45',
        error && 'border-danger-500',
        // Sits on the first line of the label, not in the middle of the block.
        label && 'mt-0.5',
        className
      )}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center">
        {checked === 'indeterminate' ? (
          <Minus aria-hidden weight="bold" className="size-3" />
        ) : (
          <Check aria-hidden weight="bold" className="size-3" />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );

  if (!label && !description) return control;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start gap-2">
        {control}

        <div className="flex flex-col gap-0.5">
          <label htmlFor={id} className="cursor-pointer text-sm text-body peer-disabled:cursor-not-allowed">
            {label}
          </label>
          {description && <p className="text-xs text-body-subtle">{description}</p>}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-xs text-danger-600">
          {error}
        </p>
      )}
    </div>
  );
});
