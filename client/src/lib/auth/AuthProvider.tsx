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
 * Three consequences the rest of the app depends on:
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
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUserState] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [nonce, setNonce] = useState(0);

  // Guards the probe so a 401 during teardown cannot resurrect a stale session.
  const generation = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const current = generation.current;

    usersApi
      .profile()
      .then((data) => {
        if (controller.signal.aborted || generation.current !== current) return;
        setUserState(data.user);
        setStatus('authenticated');
      })
      .catch(() => {
        if (controller.signal.aborted || generation.current !== current) return;
        setUserState(null);
        setStatus('anonymous');
      });

    return () => controller.abort();
  }, [nonce]);

  // A single subscriber for every 401 in the app.
  useEffect(
    () =>
      onUnauthorized(() => {
        generation.current += 1;
        setUserState(null);
        setStatus('anonymous');
      }),
    []
  );

  const login = useCallback(async (email: string, password: string) => {
    const data = await authApi.login({ email, password });
    generation.current += 1;
    setUserState(data.user);
    setStatus('authenticated');
    return data.user;
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const data = await authApi.register({ name, email, password });
    generation.current += 1;
    setUserState(data.user);
    setStatus('authenticated');
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    // Bump first: the logout request itself may 401 if the session already
    // expired, and the broadcast must not fight this teardown.
    generation.current += 1;
    try {
      await authApi.logout();
    } finally {
      setUserState(null);
      setStatus('anonymous');
    }
  }, []);

  const setUser = useCallback((next: User) => setUserState(next), []);
  const refresh = useCallback(() => setNonce((value) => value + 1), []);

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
    }),
    [user, status, login, register, logout, setUser, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
};
