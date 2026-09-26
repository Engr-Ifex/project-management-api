import { useId, type ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

/*
 * Field
 *
 * The label/hint/error block that wraps every control, plus the id wiring that
 * connects them. Label above the control, hint or error below, an 8px stack —
 * the same rhythm on every form in the product.
 *
 * `useFieldControl` is what the controls themselves use, so the wiring cannot
 * be forgotten: `htmlFor`/`id` are paired, `aria-describedby` points at the hint
 * and the error, and `aria-invalid` is set when there is an error. A form where
 * the error message is never announced is worse than one with no message at all,
 * because it looks finished.
 */

export interface FieldIds {
  controlId: string;
  describedBy: string | undefined;
  invalid: boolean;
}

/**
 * Generate the ids and ARIA attributes for a control inside a field.
 * Call this in the control component, then spread the result onto the element.
 */
export const useFieldControl = (providedId?: string, hint?: ReactNode, error?: string | null) => {
  const generatedId = useId();
  const controlId = providedId ?? generatedId;

  const describedBy =
    [hint ? `${controlId}-hint` : null, error ? `${controlId}-error` : null]
      .filter(Boolean)
      .join(' ') || undefined;

  return {
    controlId,
    describedBy,
    invalid: Boolean(error),
    hintId: hint ? `${controlId}-hint` : undefined,
    errorId: error ? `${controlId}-error` : undefined,
  };
};

export interface FieldShellProps {
  label?: string;
  controlId: string;
  hint?: ReactNode;
  error?: string | null;
  hintId?: string;
  errorId?: string;
  required?: boolean;
  /** Rendered on the same row as the label, pushed to the right. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  labelClassName?: string;
}

/**
 * The visual half of a field. Controls render this around themselves; use it
 * directly only for a control that is not one of the built-in inputs.
 */
export const FieldShell = ({
  label,
  controlId,
  hint,
  error,
  hintId,
  errorId,
  required,
  action,
  children,
  className,
  labelClassName,
}: FieldShellProps) => (
  <div className={cn('flex flex-col gap-2', className)}>
    {(label || action) && (
      <div className="flex items-center justify-between gap-2">
        {label && (
          <label
            htmlFor={controlId}
            className={cn('flex items-center gap-1 text-sm font-medium text-body', labelClassName)}
          >
            {label}
            {required && (
              <span aria-hidden className="text-danger-500">
                *
              </span>
            )}
          </label>
        )}
        {action}
      </div>
    )}

    {children}

    {/*
      A hint and an error are never shown together. Once something is wrong the
      hint is noise, and two lines of helper text under one input is the fastest
      way to make a form feel hostile.
    */}
    {error ? (
      <p id={errorId} role="alert" className="text-xs text-danger-600">
        {error}
      </p>
    ) : (
      hint && (
        <p id={hintId} className="text-xs text-body-subtle">
          {hint}
        </p>
      )
    )}
  </div>
);
