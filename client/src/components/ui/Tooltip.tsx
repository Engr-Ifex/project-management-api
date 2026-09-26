import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/*
 * Tooltip
 *
 * For the name of an icon-only control, or a truncated value. It is not a place
 * for information the user needs — a tooltip is invisible on touch, unreachable
 * by keyboard-only users unless the trigger is focusable, and gone the moment
 * they move the pointer.
 *
 * `delayDuration` is 300ms rather than Radix's 700ms default: 700ms feels
 * broken next to a hover state that responds immediately.
 *
 * The provider wraps the app once (see `App`), so every tooltip shares the
 * timing and the skip-delay behaviour — hovering along a row of icon buttons
 * should not re-wait on each one.
 */

export const TooltipProvider = ({
  children,
  delayDuration = 300,
}: {
  children: ReactNode;
  delayDuration?: number;
}) => (
  <TooltipPrimitive.Provider delayDuration={delayDuration} skipDelayDuration={150}>
    {children}
  </TooltipPrimitive.Provider>
);

export interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  /** Set when the content is long enough to need wrapping. */
  maxWidth?: string;
}

export const Tooltip = ({
  content,
  children,
  side = 'top',
  align = 'center',
  maxWidth,
}: TooltipProps) => (
  <TooltipPrimitive.Root>
    <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>

    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        side={side}
        align={align}
        sideOffset={6}
        style={maxWidth ? { maxWidth } : undefined}
        className={cn(
          'z-50 rounded-md bg-ink-900 px-2 py-1',
          'text-xs font-medium text-body-inverse',
          'shadow-md',
          // The arrow is a rotated square; matching the fill is what makes it
          // look attached rather than pasted on.
          'data-[state=delayed-open]:animate-in'
        )}
      >
        {content}
        <TooltipPrimitive.Arrow className="fill-ink-900" width={10} height={5} />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  </TooltipPrimitive.Root>
);
