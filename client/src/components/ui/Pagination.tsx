import { CaretLeft, CaretRight } from '@phosphor-icons/react';

import { cn } from '@/lib/cn';
import { Button } from './Button';
import { Select } from './Select';

/*
 * Pagination
 *
 * Shaped to the API's own contract — `{ page, limit, total, totalPages,
 * hasNextPage, hasPrevPage }` — so the component takes the server's metadata
 * object directly rather than recomputing it. Anything derived on the client is
 * a chance to disagree with the server about how many rows exist.
 *
 * The window is elided (`1 … 4 5 6 … 20`) because a task list can run to
 * hundreds of pages, and a strip of forty page numbers is not a control, it is
 * a wall. First and last are always reachable; the ellipsis is not clickable.
 */

export interface PaginationProps {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  onPageChange: (page: number) => void;
  onLimitChange?: (limit: number) => void;
  /** Hides the "Showing 1–20 of 340" line in tight spaces. */
  hideSummary?: boolean;
  className?: string;
}

const LIMIT_OPTIONS = [10, 20, 50, 100];

/** A windowed list of page numbers, with `null` marking an elision. */
const pageWindow = (current: number, total: number, span = 1): (number | null)[] => {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);

  const pages = new Set<number>([1, total, current]);

  for (let offset = 1; offset <= span; offset += 1) {
    if (current - offset > 1) pages.add(current - offset);
    if (current + offset < total) pages.add(current + offset);
  }

  const sorted = [...pages].sort((a, b) => a - b);
  const result: (number | null)[] = [];

  let previous = 0;

  for (const page of sorted) {
    if (previous && page - previous > 1) result.push(null);
    result.push(page);
    previous = page;
  }

  return result;
};

export const Pagination = ({
  page,
  limit,
  total,
  totalPages,
  hasNextPage,
  hasPrevPage,
  onPageChange,
  onLimitChange,
  hideSummary,
  className,
}: PaginationProps) => {
  const first = total === 0 ? 0 : (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 px-4 py-3',
        className
      )}
    >
      <div className="flex items-center gap-3">
        {!hideSummary && (
          <p className="text-xs text-body-subtle" data-numeric>
            {total === 0 ? 'No results' : `${first}–${last} of ${total}`}
          </p>
        )}

        {onLimitChange && (
          <Select
            size="sm"
            value={String(limit)}
            onValueChange={(value) => onLimitChange(Number(value))}
            options={LIMIT_OPTIONS.map((option) => ({
              value: String(option),
              label: `${option} per page`,
            }))}
            className="w-32"
          />
        )}
      </div>

      {totalPages > 1 && (
        <nav aria-label="Pagination" className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            disabled={!hasPrevPage}
            onClick={() => onPageChange(page - 1)}
            iconLeft={<CaretLeft aria-hidden />}
          >
            Previous
          </Button>

          <div className="mx-1 flex items-center gap-0.5">
            {pageWindow(page, totalPages).map((item, index) =>
              item === null ? (
                <span
                  key={`gap-${index}`}
                  aria-hidden
                  className="px-1.5 text-xs text-body-subtle"
                >
                  …
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  aria-current={item === page ? 'page' : undefined}
                  onClick={() => onPageChange(item)}
                  className={cn(
                    'h-7 min-w-7 rounded-sm px-1.5 text-xs tabular-nums',
                    'transition-colors duration-[120ms] ease-standard',
                    item === page
                      ? 'bg-ink-900 font-medium text-body-inverse'
                      : 'text-body-muted hover:bg-surface-active hover:text-body'
                  )}
                >
                  {item}
                </button>
              )
            )}
          </div>

          <Button
            variant="ghost"
            size="sm"
            disabled={!hasNextPage}
            onClick={() => onPageChange(page + 1)}
            iconRight={<CaretRight aria-hidden />}
          >
            Next
          </Button>
        </nav>
      )}
    </div>
  );
};
