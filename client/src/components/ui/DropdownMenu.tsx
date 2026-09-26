import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { Check, CaretRight } from '@phosphor-icons/react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/*
 * DropdownMenu
 *
 * The row action menu, the account menu, the "more" overflow. Radix gives it
 * the behaviour that matters: arrow-key navigation, type-ahead, focus returned
 * to the trigger on close, and a portal that escapes `overflow: hidden` — which
 * is why a hand-rolled menu inside a scrolling table is always clipped.
 *
 * `destructive` is a separate item variant rather than a red hover on a normal
 * item, so a destructive action is visually distinct before it is hovered.
 */

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;

export const DropdownMenuContent = ({
  children,
  align = 'end',
  sideOffset = 6,
  className,
}: {
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  className?: string;
}) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      align={align}
      sideOffset={sideOffset}
      className={cn(
        'z-50 min-w-44 overflow-hidden',
        'rounded-lg border border-line bg-surface p-1 shadow-md',
        className
      )}
    >
      {children}
    </DropdownMenuPrimitive.Content>
  </DropdownMenuPrimitive.Portal>
);

export const DropdownMenuItem = ({
  children,
  icon,
  onSelect,
  disabled,
  destructive,
  /** Renders a check on the right — for a toggle-style item. */
  checked,
  shortcut,
  className,
}: {
  children: ReactNode;
  icon?: ReactNode;
  onSelect?: (event: Event) => void;
  disabled?: boolean;
  destructive?: boolean;
  checked?: boolean;
  shortcut?: string;
  className?: string;
}) => (
  <DropdownMenuPrimitive.Item
    disabled={disabled}
    onSelect={onSelect}
    className={cn(
      'relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5',
      'text-sm text-body outline-none',
      'transition-colors duration-[100ms] ease-standard',
      'data-[highlighted]:bg-surface-active',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-45',
      destructive && 'text-danger-600 data-[highlighted]:bg-danger-50',
      '[&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-body-subtle',
      destructive && '[&_svg]:text-danger-500',
      className
    )}
  >
    {icon}
    <span className="flex-1 truncate">{children}</span>

    {shortcut && (
      <kbd className="ml-2 font-mono text-2xs text-body-subtle">{shortcut}</kbd>
    )}

    {checked && (
      <DropdownMenuPrimitive.ItemIndicator>
        <Check aria-hidden weight="bold" className="size-3.5 text-accent-600" />
      </DropdownMenuPrimitive.ItemIndicator>
    )}
  </DropdownMenuPrimitive.Item>
);

export const DropdownMenuSub = DropdownMenuPrimitive.Sub;

export const DropdownMenuSubTrigger = ({
  children,
  icon,
  className,
}: {
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}) => (
  <DropdownMenuPrimitive.SubTrigger
    className={cn(
      'flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5',
      'text-sm text-body outline-none',
      'data-[highlighted]:bg-surface-active data-[state=open]:bg-surface-active',
      '[&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-body-subtle',
      className
    )}
  >
    {icon}
    <span className="flex-1 truncate">{children}</span>
    <CaretRight aria-hidden className="size-3 text-body-subtle" />
  </DropdownMenuPrimitive.SubTrigger>
);

export const DropdownMenuSubContent = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.SubContent
      className={cn(
        'z-50 min-w-40 overflow-hidden rounded-lg border border-line bg-surface p-1 shadow-md',
        className
      )}
    >
      {children}
    </DropdownMenuPrimitive.SubContent>
  </DropdownMenuPrimitive.Portal>
);

export const DropdownMenuSeparator = ({ className }: { className?: string }) => (
  <DropdownMenuPrimitive.Separator className={cn('my-1 h-px bg-line-subtle', className)} />
);

export const DropdownMenuLabel = ({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) => (
  <DropdownMenuPrimitive.Label
    className={cn('px-2 py-1.5 text-2xs font-medium uppercase tracking-wide text-body-subtle', className)}
  >
    {children}
  </DropdownMenuPrimitive.Label>
);
