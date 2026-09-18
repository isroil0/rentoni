import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AuthApi, type RegisterInput } from '@/api/auth.api';
import { tokenStore } from '@/lib/apiClient';
import type { User } from '@/api/types';

interface AuthContextValue {
  user: User | null;
  /** True until the initial session restore has settled — guards must wait for this. */
  initializing: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isCustomer: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (input: RegisterInput) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  const queryClient = useQueryClient();
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // A 401 the client could not recover from clears local state so the UI can react
  // immediately rather than waiting for the next query to fail.
  useEffect(() => {
    tokenStore.setSessionLostHandler(() => {
      setUserState(null);
      queryClient.clear();
    });
    return () => tokenStore.setSessionLostHandler(null);
  }, [queryClient]);

  // Restore the session from the persisted refresh token on first load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const restored = await AuthApi.restore();
      if (!cancelled && mounted.current) {
        setUserState(restored?.user ?? null);
        setInitializing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await AuthApi.login(email, password);
      setUserState(result.user);
      await queryClient.invalidateQueries();
      return result.user;
    },
    [queryClient],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      const result = await AuthApi.register(input);
      setUserState(result.user);
      await queryClient.invalidateQueries();
      return result.user;
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    await AuthApi.logout();
    setUserState(null);
    queryClient.clear();
  }, [queryClient]);

  const refreshUser = useCallback(async () => {
    try {
      setUserState(await AuthApi.me());
    } catch {
      setUserState(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      initializing,
      isAuthenticated: Boolean(user),
      isAdmin: user?.role === 'SUPER_ADMIN',
      isCustomer: user?.role === 'CUSTOMER',
      login,
      register,
      logout,
      refreshUser,
      setUser: setUserState,
    }),
    [user, initializing, login, register, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
}
