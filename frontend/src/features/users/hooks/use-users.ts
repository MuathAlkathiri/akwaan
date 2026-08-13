"use client";

import type { AxiosError } from "axios";
import { useQueryClient } from "@tanstack/react-query";
import { useUsersList } from "@/api/generated/users/users";
import { useUsersUpdateSubscription } from "@/api/generated/subscriptions/subscriptions";
import type { ErrorResponseDto } from "@/api/generated/models";
import type { SubscriptionUpdatePayload, User } from "@/types";
import { authKeys } from "@/features/auth/hooks/use-auth-session";
import { toUser, toUsers } from "../mappers/user-response.mapper";

type UsersApiError = AxiosError<ErrorResponseDto>;

export const userKeys = { all: ["users"] as const };

export const useUsers = () =>
  useUsersList({
    query: { queryKey: userKeys.all, select: toUsers, retry: false },
  });

export function useUpdateSubscription() {
  const client = useQueryClient();
  const mutation = useUsersUpdateSubscription<UsersApiError>({
    mutation: {
      onSuccess: (response) => {
        const updated = toUser(response.data);
        client.setQueryData<User[]>(userKeys.all, (current) =>
          current?.map((user) => (user.id === updated.id ? updated : user)),
        );
        client.setQueryData<User | null>(authKeys.currentUser, (current) =>
          current?.id === updated.id ? updated : current,
        );
      },
    },
  });

  return {
    ...mutation,
    mutateAsync: (request: SubscriptionUpdatePayload) =>
      mutation
        .mutateAsync({
          userId: request.userId,
          data: {
            subscriptionStatus: request.subscriptionStatus,
            subscriptionExpiresAt: request.subscriptionExpiresAt || null,
          },
        })
        .then((response) => toUser(response.data)),
  };
}
