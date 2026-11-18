"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AuthResponse, User } from "@/types";
import {
  authKeys,
  fetchCurrentUser,
  useCurrentUser,
} from "../hooks/use-auth-session";
import { authStorage } from "../storage/auth-storage";
import { verifyOtp } from "../api/otp-api";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  /** Passwordless sign-in: the only way the app establishes a session. */
  loginWithOtp: (identifier: string, code: string) => Promise<AuthResponse>;
  refreshUser: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const client = useQueryClient();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const currentUser = useCurrentUser(hydrated);
  const user = currentUser.data ?? null;

  useEffect(() => {
    if (currentUser.data) authStorage.setUser(currentUser.data);
    if (currentUser.isError) {
      authStorage.clear();
      client.setQueryData(authKeys.currentUser, null);
    }
  }, [client, currentUser.data, currentUser.isError]);

  const loginWithOtp = useCallback(
    async (identifier: string, code: string) => {
      const response = await verifyOtp(identifier, code);
      // One place decides what a session is, so guards, interceptors and
      // refresh keep working untouched.
      authStorage.setToken(response.accessToken);
      authStorage.setUser(response.user);
      client.setQueryData(authKeys.currentUser, response.user);
      return response;
    },
    [client],
  );

  const refreshUser = useCallback(async () => {
    const nextUser = await client.fetchQuery({
      queryKey: authKeys.currentUser,
      queryFn: fetchCurrentUser,
    });
    authStorage.setUser(nextUser);
  }, [client]);

  const logout = useCallback(() => {
    authStorage.clear();
    client.setQueryData(authKeys.currentUser, null);
    router.push("/login");
  }, [client, router]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading: !hydrated || currentUser.isLoading,
      isAuthenticated: Boolean(user),
      isAdmin: user?.role === "admin",
      loginWithOtp,
      refreshUser,
      logout,
    }),
    [
      loginWithOtp,
      user,
      hydrated,
      currentUser.isLoading,
      refreshUser,
      logout,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}

/**
 * The session where there may not be one, for a surface that merely *improves*
 * when somebody is signed in.
 *
 * `useAuth` throws without a provider, which is right for anything that cannot
 * work signed-out. An optional enhancement is the opposite case: it should
 * quietly render nothing rather than take the whole page down with it.
 */
export function useOptionalAuth(): AuthContextValue | undefined {
  return useContext(AuthContext);
}
