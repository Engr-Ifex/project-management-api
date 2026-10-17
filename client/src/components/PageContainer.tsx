import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

/**
 * The content column.
 *
 * Capped at the design system's `max-w-content` (1400px) and centred, so a task
 * table does not stretch to 3000px on an ultrawide monitor — where the eye has
 * to travel the width of the screen to follow a row from its title to its
 * assignee.
 */
export const PageContainer = ({
  children,
  className,
  width = 'content',
}: {
  children: ReactNode;
  className?: string;
  /** `narrow` for forms and prose, `content` for tables and grids. */
  width?: 'narrow' | 'content';
}) => (
  <div
    className={cn(
      /*
       * Horizontal padding steps with the viewport rather than sitting at a
       * single value: 16px is right on a phone, but at 1440px the content would
       * otherwise start a hair from the edge of the canvas and read as cramped.
       * The three stops match the marketing page and the shell's topbar, so
       * every screen shares one gutter.
       */
      'mx-auto w-full px-4 py-5 sm:px-6 lg:px-8',
      width === 'narrow' ? 'max-w-2xl' : 'max-w-content',
      className
    )}
  >
    {children}
  </div>
);
