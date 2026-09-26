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
      'mx-auto w-full px-4 py-5 lg:px-6',
      width === 'narrow' ? 'max-w-2xl' : 'max-w-content',
      className
    )}
  >
    {children}
  </div>
);
