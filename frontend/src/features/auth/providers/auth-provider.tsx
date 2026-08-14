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
import { AuthResponse, LoginPayload, RegisterPayload, User } from "@/types";
import {
  authKeys,
  fetchCurrentUser,
  useCurrentUser,
  useLoginMutation,
  useRegisterMutation,
} from "../hooks/use-auth-session";
import {
  toLoginRequest,
  toRegisterRequest,
} from "../mappers/auth-request.mapper";
import { authStorage } from "../storage/auth-storage";
import { verifyOtp } from "../api/otp-api";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (data: LoginPayload) => Promise<AuthResponse>;
  /** Passwordless sign-in. Establishes exactly the same session as `login`. */
  loginWithOtp: (identifier: string, code: string) => Promise<AuthResponse>;
  register: (data: RegisterPayload) => Promise<void>;
  refreshUser: () => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const client = useQueryClient();
  const [hydrated, setHydrated] = useState(false);
  const loginMutation = useLoginMutation();
  const registerMutation = useRegisterMutation();
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

  const login = useCallback(
    async (data: LoginPayload) => {
      const response = await loginMutation.mutateAsync(toLoginRequest(data));
      authStorage.setToken(response.accessToken);
      authStorage.setUser(response.user);
      client.setQueryData(authKeys.currentUser, response.user);
      return response;
    },
    [client, loginMutation],
  );

  const loginWithOtp = useCallback(
    async (identifier: string, code: string) => {
      const response = await verifyOtp(identifier, code);
      // Deliberately the same three lines as `login`: one place decides what a
      // session is, so guards, interceptors and refresh keep working untouched.
      authStorage.setToken(response.accessToken);
      authStorage.setUser(response.user);
      client.setQueryData(authKeys.currentUser, response.user);
      return response;
    },
    [client],
  );

  const register = useCallback(
    async (data: RegisterPayload) => {
      await registerMutation.mutateAsync(toRegisterRequest(data));
    },
    [registerMutation],
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
      login,
      loginWithOtp,
      register,
      refreshUser,
      logout,
    }),
    [
      loginWithOtp,
      user,
      hydrated,
      currentUser.isLoading,
      login,
      register,
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
