import { CircleNotch } from '@phosphor-icons/react';

import { cn } from '@/lib/cn';

/*
 * Skeleton
 *
 * Placeholder shapes shown while data loads. The rule that matters: a skeleton
 * should approximate the shape of what is coming, in the position it will
 * appear. A centred spinner tells the user "something is happening"; a skeleton
 * tells them what, and stops the layout from jumping when it arrives.
 *
 * Every skeleton in the product is therefore a composition of these primitives
 * shaped like the real content — `SkeletonText` for a paragraph,
 * `SkeletonTable` for a list.
 *
 * The shimmer is a background-position animation, which the base layer disables
 * under `prefers-reduced-motion`.
 */

export const Skeleton = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    aria-hidden
    className={cn('skeleton-shimmer rounded-xs', className)}
    {...props}
  />
);

export const SkeletonText = ({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) => (
  <div className={cn('flex flex-col gap-2', className)}>
    {Array.from({ length: lines }).map((_, index) => (
      <Skeleton
        key={index}
        className="h-3"
        // The last line is short, like a real paragraph.
        style={{ width: index === lines - 1 ? '60%' : '100%' }}
      />
    ))}
  </div>
);

export const SkeletonList = ({
  rows = 5,
  className,
}: {
  rows?: number;
  className?: string;
}) => (
  <div className={cn('flex flex-col divide-y divide-line-subtle', className)}>
    {Array.from({ length: rows }).map((_, index) => (
      <div key={index} className="flex items-center gap-3 px-4 py-3">
        <Skeleton className="size-7 shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-2.5 w-1/5" />
        </div>
        <Skeleton className="h-5 w-16 rounded-sm" />
      </div>
    ))}
  </div>
);

/**
 * Spinner — for a short, indeterminate wait inside a control or a small region.
 *
 * Not for page-level loading: use skeletons there. A spinner with no shape
 * conveys nothing about what is coming and makes a fast response feel slower.
 */
export const Spinner = ({
  size = 'md',
  className,
  label = 'Loading',
}: {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
}) => (
  <span role="status" aria-label={label} className={cn('inline-flex', className)}>
    <CircleNotch
      aria-hidden
      className={cn(
        'animate-spin text-body-subtle',
        { sm: 'size-3', md: 'size-4', lg: 'size-5' }[size]
      )}
    />
  </span>
);

/**
 * LoadingOverlay — dims a region while it refreshes, keeping the previous
 * content visible underneath. Used for a table refresh, where replacing the
 * rows with skeletons on every page change would flash.
 */
export const LoadingOverlay = ({ show, className }: { show: boolean; className?: string }) => (
  <div
    aria-hidden={!show}
    className={cn(
      'pointer-events-none absolute inset-0 z-10 flex items-start justify-center pt-16',
      'bg-surface/60 backdrop-blur-[1px] transition-opacity duration-150',
      show ? 'opacity-100' : 'opacity-0',
      className
    )}
  >
    {show && <Spinner size="lg" />}
  </div>
);
