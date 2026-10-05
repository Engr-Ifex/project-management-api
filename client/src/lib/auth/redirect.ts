/*
 * Where to send a user after they sign in.
 *
 * `RequireAuth` records the path it interrupted in router state, so the login
 * screen can put the user back where they were — including the common case where
 * a 15-minute session lapsed in the middle of a task.
 *
 * This lives outside `routes/guards.tsx` because three places need the same
 * answer — the guard that records it, the guard that redirects an
 * already-signed-in user away from `/login`, and the login form itself. Two of
 * those previously disagreed: `RequireAnonymous` sent everyone to `/workspaces`,
 * which raced the form's own `navigate(from)`. Whichever landed last won, and
 * the user was told "we will take you back to where you were" and then was not.
 */

export const DEFAULT_AUTH_DESTINATION = '/workspaces';

/**
 * Reads the destination from router state, falling back to the workspace list.
 *
 * Only a same-origin path is accepted. A value beginning `//` is a
 * protocol-relative URL, which the browser resolves to another host — so a
 * `from` of `//evil.example` would turn the login form into an open redirect.
 * The value is set by our own guard today, but the check is what keeps that true
 * if the state is ever populated from somewhere else.
 */
export const intendedDestination = (state: unknown): string => {
  const from = (state as { from?: unknown } | null | undefined)?.from;

  if (typeof from !== 'string') return DEFAULT_AUTH_DESTINATION;
  if (!from.startsWith('/') || from.startsWith('//')) return DEFAULT_AUTH_DESTINATION;

  return from;
};
