import { useEffect, useState } from 'react';

/**
 * Debounces a rapidly-changing value.
 *
 * Used for search boxes: every keystroke would otherwise be a request, and the
 * API rate-limits at 1000 requests / 15 min per IP. 300ms is long enough to
 * collapse typing and short enough to feel immediate.
 */
export const useDebounced = <T>(value: T, delay = 300): T => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
};
