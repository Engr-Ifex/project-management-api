import { useCallback, useEffect, useRef, useState } from 'react';
import type { DependencyList } from 'react';

import { ApiError } from '@/lib/api';

/*
 * useAsync — a very small data-fetching hook.
 *
 * Deliberately not React Query. The API has no caching or invalidation story to
 * model (no websockets, no optimistic updates, 15-minute sessions), so a query
 * library would add ~13 kB and a mental model for behaviour nothing here needs.
 * What this does need is: abort on unmount, distinguish first load from a
 * refetch, and keep the previous data visible while refetching so a list does
 * not flash empty on every filter change.
 *
 * The loader is held in a ref so that passing an inline arrow function — which
 * every call site does — does not re-run the effect on every render. Re-running
 * is driven by `deps` alone.
 */

export interface AsyncState<T> {
  data: T | undefined;
  error: ApiError | undefined;
  /** True only while the first load is in flight and there is nothing to show. */
  loading: boolean;
  /** True while a refetch is in flight with previous data still on screen. */
  refreshing: boolean;
  /** Re-runs the loader, keeping the current data visible. */
  reload: () => void;
  /** Replaces the data locally, for optimistic updates after a mutation. */
  setData: (updater: (current: T | undefined) => T | undefined) => void;
}

const toApiError = (error: unknown): ApiError => {
  if (error instanceof ApiError) return error;
  if (error instanceof Error) return new ApiError(0, error.message);
  return new ApiError(0, 'Something went wrong.');
};

export const useAsync = <T>(
  loader: (signal: AbortSignal) => Promise<T>,
  deps: DependencyList
): AsyncState<T> => {
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const [data, setDataState] = useState<T | undefined>(undefined);
  const [error, setError] = useState<ApiError | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [nonce, setNonce] = useState(0);

  // Tracks whether anything has landed yet, without making it a dependency of
  // the effect (which would re-run the fetch when the first response arrives).
  const hasData = useRef(false);

  useEffect(() => {
    const controller = new AbortController();

    if (hasData.current) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(undefined);

    loaderRef.current(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        hasData.current = true;
        setDataState(result);
        setError(undefined);
        setLoading(false);
        setRefreshing(false);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        // An abort is a normal unmount, not a failure to report.
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setError(toApiError(caught));
        setLoading(false);
        setRefreshing(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  const setData = useCallback((updater: (current: T | undefined) => T | undefined) => {
    setDataState((current) => updater(current));
  }, []);

  return { data, error, loading, refreshing, reload, setData };
};

/**
 * useMutation — runs an action and tracks its in-flight state.
 *
 * `run` resolves to a **discriminated outcome**, never `undefined`, and that is
 * deliberate. Many endpoints — every DELETE, every archive — succeed with no
 * response body, so `TResult` is `undefined` on success. Returning
 * `TResult | undefined` would therefore make success and failure
 * indistinguishable, and `if (result)` would read a successful delete as a
 * failure. `outcome.ok` is the only correct test.
 *
 * The thrown `ApiError` is also kept in state, so a form can map
 * `error.fieldError('name')` onto the right input.
 */
export type MutationOutcome<TResult> =
  | { ok: true; data: TResult }
  | { ok: false; error: ApiError };

export interface MutationState<TArgs extends unknown[], TResult> {
  run: (...args: TArgs) => Promise<MutationOutcome<TResult>>;
  loading: boolean;
  error: ApiError | undefined;
  reset: () => void;
}

export const useMutation = <TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>
): MutationState<TArgs, TResult> => {
  const actionRef = useRef(action);
  actionRef.current = action;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | undefined>(undefined);

  const run = useCallback(async (...args: TArgs): Promise<MutationOutcome<TResult>> => {
    setLoading(true);
    setError(undefined);
    try {
      return { ok: true, data: await actionRef.current(...args) };
    } catch (caught) {
      const apiError = toApiError(caught);
      setError(apiError);
      return { ok: false, error: apiError };
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => setError(undefined), []);

  return { run, loading, error, reset };
};
