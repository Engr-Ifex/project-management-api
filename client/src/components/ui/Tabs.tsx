import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

/*
 * Tabs
 *
 * Radix handles the roving focus, the arrow keys and the `tablist` semantics —
 * which is the whole reason not to hand-roll this. A div soup with click
 * handlers looks identical and is unusable from a keyboard.
 *
 * The active tab is marked with an underline, not a filled pill. On a dense
 * screen a filled pill competes with the primary button; an underline reads as
 * "you are here" without adding a coloured block.
 */

export const Tabs = TabsPrimitive.Root;

export const TabsList = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <TabsPrimitive.List
    className={cn('flex items-center gap-1 border-b border-line', className)}
  >
    {children}
  </TabsPrimitive.List>
);

export const TabsTrigger = ({
  value,
  children,
  count,
  disabled,
  className,
}: {
  value: string;
  children: ReactNode;
  /** A count badge after the label — useful for filtered lists. */
  count?: number;
  disabled?: boolean;
  className?: string;
}) => (
  <TabsPrimitive.Trigger
    value={value}
    disabled={disabled}
    className={cn(
      'group relative -mb-px inline-flex items-center gap-1.5 px-3 py-2',
      'text-sm font-medium text-body-muted',
      'border-b-2 border-transparent',
      'transition-colors duration-[120ms] ease-standard',
      'hover:text-body',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/25 focus-visible:rounded-xs',
      'data-[state=active]:border-ink-900 data-[state=active]:text-body',
      'disabled:cursor-not-allowed disabled:opacity-45',
      className
    )}
  >
    {children}
    {typeof count === 'number' && (
      <span
        className="rounded-xs bg-ink-100 px-1 text-2xs tabular-nums text-body-muted group-data-[state=active]:bg-ink-200"
        data-numeric
      >
        {count}
      </span>
    )}
  </TabsPrimitive.Trigger>
);

export const TabsContent = ({
  value,
  children,
  className,
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) => (
  <TabsPrimitive.Content
    value={value}
    // Focus is moved by the trigger; focusing the panel again is disorienting.
    tabIndex={-1}
    className={cn('focus-visible:outline-none', className)}
  >
    {children}
  </TabsPrimitive.Content>
);

/**
 * SegmentedControl
 *
 * A compact alternative to tabs, for switching how the *same* content is
 * displayed (board / list, or a small filter). Tabs change what you are looking
 * at; a segmented control changes how. The distinction matters because they are
 * used for different things and should not look identical.
 */
export const SegmentedControl = <T extends string>({
  value,
  onValueChange,
  options,
  className,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: { value: T; label: string; icon?: ReactNode }[];
  className?: string;
}) => (
  <div
    role="group"
    className={cn(
      'inline-flex items-center gap-0.5 rounded-md border border-line bg-surface-sunken p-0.5',
      className
    )}
  >
    {options.map((option) => {
      const active = option.value === value;

      return (
        <button
          key={option.value}
          type="button"
          aria-pressed={active}
          onClick={() => onValueChange(option.value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-xs font-medium',
            'transition-colors duration-[120ms] ease-standard',
            active
              ? 'bg-surface text-body shadow-xs'
              : 'text-body-muted hover:text-body'
          )}
        >
          {option.icon}
          {option.label}
        </button>
      );
    })}
  </div>
);
