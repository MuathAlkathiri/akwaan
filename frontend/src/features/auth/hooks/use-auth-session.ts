"use client";

import axios, { type AxiosError } from "axios";
import { useQuery } from "@tanstack/react-query";
import {
  authGetCurrentUser,
  useAuthLogin,
  useAuthRegister,
} from "@/api/generated/auth/auth";
import type {
  ErrorResponseDto,
  LoginDto,
  RegisterDto,
} from "@/api/generated/models";
import { toUser } from "@/features/users/mappers/user-response.mapper";
import { toAuthResponse } from "../mappers/auth-response.mapper";
import { authStorage } from "../storage/auth-storage";

type AuthApiError = AxiosError<ErrorResponseDto>;

export const authKeys = { currentUser: ["auth", "current-user"] as const };

/**
 * The signed-in user, without a hydration mismatch.
 *
 * `enabled` is the provider's "we are past the first client render" flag, and
 * `initialData` is gated on it for the same reason the query is. React Query
 * evaluates an `initialData` factory during the *first* render, so seeding it
 * from localStorage made the client's hydration pass render a signed-in header
 * and a signed-in layout over server markup that had rendered signed-out —
 * every authenticated route mismatched on first paint.
 *
 * Gating it means the first client render matches the server exactly, and the
 * stored user arrives on the render after the provider's effect, which is a
 * normal update rather than a hydration difference. The stored user is still
 * used, so there is no extra flash of a signed-out header beyond the one frame
 * the server already rendered.
 */
export function useCurrentUser(enabled: boolean) {
  const ready = enabled && Boolean(authStorage.getToken());
  return useQuery({
    queryKey: authKeys.currentUser,
    queryFn: fetchCurrentUser,
    enabled: ready,
    ...(ready
      ? { initialData: () => authStorage.getUser() ?? undefined }
      : {}),
    retry: false,
  });
}

export const fetchCurrentUser = async () => toUser(await authGetCurrentUser());

export function useLoginMutation() {
  const mutation = useAuthLogin<AuthApiError>();
  return {
    ...mutation,
    mutateAsync: (data: LoginDto) =>
      mutation.mutateAsync({ data }).then(toAuthResponse),
  };
}

export function useRegisterMutation() {
  const mutation = useAuthRegister<AuthApiError>();
  return {
    ...mutation,
    mutateAsync: async (data: RegisterDto) => {
      try {
        return toAuthResponse(await mutation.mutateAsync({ data }));
      } catch (error) {
        if (!axios.isAxiosError(error) || error.response?.status !== 400)
          throw error;
        const legacyCompatibleData = { ...data, name: data.fullName };
        return toAuthResponse(
          await mutation.mutateAsync({ data: legacyCompatibleData }),
        );
      }
    },
  };
}
