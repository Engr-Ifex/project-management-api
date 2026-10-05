import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

import { ErrorState } from '@/components/ui';

/*
 * ErrorBoundary
 *
 * The last line of defence for a *render* error. Without one, a single throw
 * anywhere in the tree unmounts the whole application and leaves a blank white
 * page with no explanation and no way back — the worst failure mode there is,
 * because the user cannot even tell whether they are still signed in.
 *
 * It is a class because React only supports error boundaries as classes;
 * there is no hook equivalent. That is the entire reason this file is not a
 * function component.
 *
 * What it does **not** catch, and why that is fine:
 *
 *   - **Async errors** — `useAsync` and `useMutation` already turn a failed
 *     request into `state.error`, which the screen renders as an `ErrorState`.
 *     A rejected promise never reaches a boundary.
 *   - **Event-handler errors** — React does not route these to boundaries.
 *     Our handlers call `useMutation`, so they are covered the same way.
 *   - **Its own errors** — a boundary cannot catch a throw in its fallback.
 *
 * So this exists for the one case nothing else covers: a component throwing
 * during render, most often because it assumed data was shaped differently than
 * it was.
 */

export interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * `page` fills the viewport (the app-level boundary); `panel` sits inside a
   * layout, so a broken screen does not take the sidebar down with it.
   */
  variant?: 'page' | 'panel';
  /** Replaces the default fallback entirely. */
  fallback?: ReactNode;
  /** A hook for reporting. Nothing is wired to it yet. */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // There is no error-reporting service in this project, so the console is the
    // only sink. `componentStack` is the useful half — it names the component
    // that threw, which the message alone rarely does.
    console.error('Unhandled render error:', error, info.componentStack);
    this.props.onError?.(error, info);
  }

  /*
   * A render error is almost always deterministic, so "try again" by resetting
   * state would re-throw immediately and look broken. The failure this actually
   * recovers from is a stale lazy chunk — a deploy replaced the hashed asset
   * while the tab was open, so the import 404s — and a reload is exactly the fix.
   */
  private reload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    const { error } = this.state;
    const { children, fallback, variant = 'panel' } = this.props;

    if (!error) return children;
    if (fallback) return fallback;

    return (
      <ErrorState
        variant={variant === 'page' ? 'page' : 'panel'}
        title="This screen could not be displayed"
        description={
          // The real message is useful while developing and noise in production,
          // where it is more likely to confuse than help.
          import.meta.env.DEV
            ? `A component threw while rendering: ${error.message}`
            : 'Something went wrong while rendering this screen. Reloading usually fixes it.'
        }
        onRetry={this.reload}
        retryLabel="Reload the page"
      />
    );
  }
}
