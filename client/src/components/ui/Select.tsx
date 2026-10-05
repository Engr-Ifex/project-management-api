import * as SelectPrimitive from '@radix-ui/react-select';
import { CaretDown, Check } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';
import { FieldShell, useFieldControl } from './Field';

/*
 * Select
 *
 * Built on Radix rather than a native `<select>` because the native control
 * cannot be styled to match the rest of the system, and on a project-management
 * screen the status picker is a primary interaction, not a form afterthought.
 *
 * Radix brings what is hard to get right by hand: roving focus, type-ahead,
 * `aria-activedescendant`, and a listbox that actually traps and restores focus.
 * The visual layer below is entirely ours.
 *
 * A native `<select>` is still the right answer for a long, plain list of
 * options inside a form — reach for this one when the options need structure
 * (an icon, a colour, a description).
 */

export interface SelectOption {
  value: string;
  label: string;
  /** Rendered before the label. An icon element or a colour dot. */
  adornment?: ReactNode;
  disabled?: boolean;
}

export interface SelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  label?: string;
  hint?: ReactNode;
  error?: string | null;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  className?: string;
  containerClassName?: string;
  /** Height matches the Button and Input components. */
  size?: 'sm' | 'md' | 'lg';
  name?: string;
  /**
   * Accessible name for the trigger, for a select whose purpose is not carried
   * by a visible `label` — a role picker inside a table row, say.
   *
   * Declared explicitly because TypeScript permits a hyphenated attribute on a
   * component without checking it against the props type. Before this existed,
   * `<Select aria-label="…">` compiled cleanly and was then dropped on the
   * floor, leaving the control with no accessible name at all.
   */
  'aria-label'?: string;
}

export const Select = ({
  value,
  onValueChange,
  options,
  placeholder = 'Select…',
  label,
  hint,
  error,
  disabled,
  required,
  id,
  className,
  containerClassName,
  size = 'md',
  name,
  'aria-label': ariaLabel,
}: SelectProps) => {
  const field = useFieldControl(id, hint, error);

  const height = size === 'sm' ? 'h-7 text-xs' : size === 'lg' ? 'h-9 text-base' : 'h-8 text-sm';

  const control = (
    <SelectPrimitive.Root
      value={value}
      onValueChange={onValueChange}
      disabled={disabled}
      required={required}
      name={name}
    >
      <SelectPrimitive.Trigger
        id={field.controlId}
        aria-label={ariaLabel}
        aria-invalid={field.invalid || undefined}
        aria-describedby={field.describedBy}
        className={cn(
          'flex w-full items-center justify-between gap-2',
          'bg-surface text-body border border-line-strong rounded-md px-2.5',
          'transition-[border-color,box-shadow] duration-[120ms] ease-standard',
          'hover:border-ink-400',
          'focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/25',
          'data-[placeholder]:text-body-subtle',
          'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-body-subtle',
          height,
          field.invalid && 'border-danger-500 focus:border-danger-500 focus:ring-danger-500/25',
          className
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <CaretDown aria-hidden className="size-3.5 shrink-0 text-body-subtle" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className={cn(
            'z-50 max-h-64 min-w-[var(--radix-select-trigger-width)] overflow-hidden',
            'bg-surface border border-line rounded-lg shadow-md',
            'data-[state=open]:animate-in'
          )}
        >
          <SelectPrimitive.Viewport className="p-1 scrollbar-thin">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className={cn(
                  'relative flex cursor-default select-none items-center gap-2',
                  'rounded-sm py-1.5 pl-2 pr-7 text-sm text-body outline-none',
                  'data-[highlighted]:bg-surface-active',
                  'data-[disabled]:pointer-events-none data-[disabled]:opacity-45'
                )}
              >
                {option.adornment}

                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>

                <SelectPrimitive.ItemIndicator className="absolute right-2 flex items-center">
                  <Check aria-hidden className="size-3.5 text-accent-600" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
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
      className={containerClassName}
    >
      {control}
    </FieldShell>
  );
};
