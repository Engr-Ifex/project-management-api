import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { authApi, onUnauthorized, usersApi } from '@/lib/api';
import type { User } from '@/lib/api';

/*
 * AuthProvider
 *
 * The session is an httpOnly cookie, so there is nothing readable on the client
 * and no way to know whether the user is logged in without asking the server.
 * `GET /users/profile` is that question — there is no `/me` and no token to
 * inspect. A 401 is the answer "no".
 *
 * Four consequences the rest of the app depends on:
 *
 * - **No refresh logic, anywhere.** There is no refresh token and the session
 *   dies after 15 minutes. A 401 is terminal: tear the session down and route to
 *   login. Retrying or queueing the request would be inventing a mechanism the
 *   API does not have.
 * - **Every 401 is handled in one place.** Rather than each page redirecting on
 *   its own, the client broadcasts 401s and this provider is the single
 *   subscriber. A request made from a background poll tears the session down
 *   exactly like a foreground one.
 * - **`status` is three-valued, not two.** `loading` is distinct from
 *   `anonymous`, because treating "we have not asked yet" as "logged out" makes
 *   every page flash the login screen on first paint.
 * - **A 401 is not always an expiry.** Three different situations produce one:
 *   the probe on a cold load (never signed in), a rejected login (wrong
 *   password), and a live session dying. Only the third is something to tell the
 *   user about — see `sessionExpired`.
 */

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface AuthContextValue {
  user: User | null;
  status: AuthStatus;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  /** Replaces the cached user after a profile update, without a refetch. */
  setUser: (user: User) => void;
  /** Re-runs the session probe. */
  refresh: () => void;
  /**
   * True when a signed-in session was ended by the server rather than by the
   * user — the 15-minute cookie lapsed, the account was removed, or the
   * password changed elsewhere. The login screen explains itself with this.
   */
  sessionExpired: boolean;
  /** Dismisses the expiry notice, so it cannot outlive its relevance. */
  clearSessionExpired: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUserState] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [sessionExpired, setSessionExpired] = useState(false);
  const [nonce, setNonce] = useState(0);

  // Guards the probe so a 401 during teardown cannot resurrect a stale session.
  const generation = useRef(0);

  /*
   * The 401 handler is registered once and never re-created, so it cannot read
   * `status` from its closure — the value it captured on the first render would
   * be `'loading'` forever. A ref updated in lockstep with the state is the
   * honest fix: it is always the current value, and reading it is synchronous,
   * which matters because the decision has to be made in the same tick the 401
   * arrives.
   */
  const statusRef = useRef<AuthStatus>('loading');

  const applyStatus = useCallback((next: AuthStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  /** Set while an explicit logout is in flight, to tell it apart from an expiry. */
  const loggingOut = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    const current = generation.current;

    usersApi
      .profile()
      .then((data) => {
        if (controller.signal.aborted || generation.current !== current) return;
        setUserState(data.user);
        applyStatus('authenticated');
      })
      .catch(() => {
        if (controller.signal.aborted || generation.current !== current) return;
        setUserState(null);
        applyStatus('anonymous');
      });

    return () => controller.abort();
  }, [applyStatus, nonce]);

  // A single subscriber for every 401 in the app.
  useEffect(
    () =>
      onUnauthorized(() => {
        /*
         * Logging out is itself a request that can 401, because the session may
         * already have lapsed by the time the user clicks. That is not an expiry
         * the user needs to be told about — they asked to leave.
         */
        if (loggingOut.current) return;

        /*
         * Read *before* the status is changed: the question is what the session
         * was, not what it is about to become. Only a 401 that killed a live
         * session earns a notice. The same 401 answers the probe on every cold
         * load, and a rejected login is a 401 too — reporting either as "your
         * session expired" would be a lie on the most common path through the
         * app.
         */
        const wasAuthenticated = statusRef.current === 'authenticated';

        generation.current += 1;
        setUserState(null);
        applyStatus('anonymous');

        if (wasAuthenticated) setSessionExpired(true);
      }),
    [applyStatus]
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await authApi.login({ email, password });
      generation.current += 1;
      setUserState(data.user);
      applyStatus('authenticated');
      // A fresh session cannot be an expired one.
      setSessionExpired(false);
      return data.user;
    },
    [applyStatus]
  );

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const data = await authApi.register({ name, email, password });
      generation.current += 1;
      setUserState(data.user);
      applyStatus('authenticated');
      setSessionExpired(false);
      return data.user;
    },
    [applyStatus]
  );

  const logout = useCallback(async () => {
    loggingOut.current = true;

    // Bump first: the logout request itself may 401 if the session already
    // expired, and the broadcast must not fight this teardown.
    generation.current += 1;

    try {
      await authApi.logout();
    } finally {
      loggingOut.current = false;
      setUserState(null);
      applyStatus('anonymous');
      setSessionExpired(false);
    }
  }, [applyStatus]);

  const setUser = useCallback((next: User) => setUserState(next), []);
  const refresh = useCallback(() => setNonce((value) => value + 1), []);
  const clearSessionExpired = useCallback(() => setSessionExpired(false), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      isAuthenticated: status === 'authenticated' && user !== null,
      login,
      register,
      logout,
      setUser,
      refresh,
      sessionExpired,
      clearSessionExpired,
    }),
    [user, status, login, register, logout, setUser, refresh, sessionExpired, clearSessionExpired]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);

  if (!context) throw new Error('useAuth must be used inside an AuthProvider');

  return context;
};
