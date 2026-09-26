import { CaretDown, CaretUp, CaretUpDown } from '@phosphor-icons/react';
import type { HTMLAttributes, ReactNode, ThHTMLAttributes, TdHTMLAttributes } from 'react';

import { cn } from '@/lib/utils/cn';

/*
 * Table
 *
 * The backbone of this product: task lists, member lists, activity feeds and
 * attachment lists are all tables. It is therefore the component most worth
 * getting right, and the one where the default browser rendering is furthest
 * from acceptable.
 *
 * Decisions worth knowing:
 *
 * - **Rows are separated by hairlines, not by borders on every cell.** A grid
 *   of 1px boxes is what makes a data table look like a spreadsheet from 2004.
 * - **The header is `text-2xs` uppercase in muted ink.** It recedes, so the
 *   data is what you read first.
 * - **Numbers are tabular and right-aligned.** Proportional digits make a
 *   column of figures look ragged.
 * - **The wrapper scrolls horizontally, not the page.** A wide table on a phone
 *   must not push the whole layout sideways.
 * - **Sorting is expressed with `aria-sort`**, so the state is announced and not
 *   only drawn as an arrow.
 */

export const TableWrapper = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('w-full overflow-x-auto scrollbar-thin', className)} {...props} />
);

export const Table = ({
  className,
  density = 'comfortable',
  ...props
}: HTMLAttributes<HTMLTableElement> & { density?: 'comfortable' | 'compact' }) => (
  <table
    data-density={density}
    className={cn('w-full border-collapse text-left text-sm', className)}
    {...props}
  />
);

export const THead = ({ className, sticky, ...props }: HTMLAttributes<HTMLTableSectionElement> & { sticky?: boolean }) => (
  <thead
    className={cn(
      'border-b border-line',
      // A sticky header only earns its keep on a long list inside a scroll area.
      sticky && 'sticky top-0 z-10 bg-surface',
      className
    )}
    {...props}
  />
);

export const TBody = ({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) => (
  <tbody className={cn('divide-y divide-line-subtle', className)} {...props} />
);

export const TR = ({
  className,
  interactive,
  selected,
  ...props
}: HTMLAttributes<HTMLTableRowElement> & { interactive?: boolean; selected?: boolean }) => (
  <tr
    data-selected={selected || undefined}
    className={cn(
      'transition-colors duration-[120ms] ease-standard',
      interactive && 'cursor-pointer hover:bg-surface-hover',
      selected && 'bg-accent-50/60',
      'data-[state=selected]:bg-accent-50',
      className
    )}
    {...props}
  />
);

export interface THProps extends ThHTMLAttributes<HTMLTableCellElement> {
  /** `asc` / `desc` / `false` — drives both the arrow and `aria-sort`. */
  sortDirection?: 'asc' | 'desc' | false;
  onSort?: () => void;
  /** Right-aligns the column. Use for figures. */
  numeric?: boolean;
  /** Applies the muted uppercase treatment. Default true. */
  headerStyle?: boolean;
}

export const TH = ({
  className,
  children,
  sortDirection,
  onSort,
  numeric,
  headerStyle = true,
  ...props
}: THProps) => {
  const sortable = Boolean(onSort);

  const content = (
    <>
      {children}
      {sortable &&
        (sortDirection === 'asc' ? (
          <CaretUp aria-hidden weight="bold" className="size-3 shrink-0" />
        ) : sortDirection === 'desc' ? (
          <CaretDown aria-hidden weight="bold" className="size-3 shrink-0" />
        ) : (
          // Reserve the space so the header does not shift when sorting starts.
          <CaretUpDown aria-hidden className="size-3 shrink-0 opacity-0 group-hover:opacity-60" />
        ))}
    </>
  );

  return (
    <th
      scope="col"
      aria-sort={sortDirection === 'asc' ? 'ascending' : sortDirection === 'desc' ? 'descending' : undefined}
      className={cn(
        'px-3 py-2 font-medium whitespace-nowrap',
        'first:pl-4 last:pr-4',
        headerStyle && 'text-2xs uppercase tracking-wide text-body-subtle',
        numeric && 'text-right',
        className
      )}
      {...props}
    >
      {sortable ? (
        <button
          type="button"
          onClick={onSort}
          className={cn(
            'group inline-flex items-center gap-1 rounded-xs transition-colors hover:text-body',
            numeric && 'flex-row-reverse'
          )}
        >
          {content}
        </button>
      ) : (
        <span className={cn('inline-flex items-center gap-1', numeric && 'flex-row-reverse')}>
          {content}
        </span>
      )}
    </th>
  );
};

export interface TDProps extends TdHTMLAttributes<HTMLTableCellElement> {
  numeric?: boolean;
  /** Primary cell of the row — gets full-strength text instead of muted. */
  primary?: boolean;
}

export const TD = ({ className, numeric, primary, ...props }: TDProps) => (
  <td
    className={cn(
      'px-3 py-2.5 align-middle',
      'first:pl-4 last:pr-4',
      'group-hover/row:text-body',
      numeric && 'text-right tabular-nums',
      primary ? 'text-body' : 'text-body-muted',
      'data-[density=compact]:py-1.5',
      className
    )}
    {...props}
  />
);

/**
 * TableMessage
 *
 * The single empty / error / loading slot inside a table body. Rendered as one
 * full-width cell so the header stays visible — which is what tells the user
 * they are looking at an empty list rather than a broken page.
 */
export const TableMessage = ({
  colSpan,
  children,
  className,
}: {
  colSpan: number;
  children: ReactNode;
  className?: string;
}) => (
  <tr>
    <td colSpan={colSpan} className={cn('px-4 py-12 text-center', className)}>
      {children}
    </td>
  </tr>
);

/** A skeleton row, for the loading state of any table. */
export const TableSkeletonRows = ({
  rows = 5,
  columns,
}: {
  rows?: number;
  columns: number;
}) => (
  <>
    {Array.from({ length: rows }).map((_, rowIndex) => (
      <tr key={rowIndex}>
        {Array.from({ length: columns }).map((__, columnIndex) => (
          <td key={columnIndex} className="px-3 py-2.5 first:pl-4 last:pr-4">
            <div
              className="skeleton-shimmer h-3.5 rounded-xs"
              // Vary the width so the block does not read as a solid bar.
              style={{ width: `${[70, 45, 85, 60, 35][(rowIndex + columnIndex) % 5]}%` }}
            />
          </td>
        ))}
      </tr>
    ))}
  </>
);
