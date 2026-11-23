import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/lib/api/client";

export interface AdminDiscountCode {
  code: string;
  percentOff?: number;
  amountOffHalalas?: number;
  packIds: string[];
  maxRedemptions: number | null;
  redeemedCount: number;
  expiresAt?: string;
  active: boolean;
  note?: string;
  createdAt?: string;
}

export const discountCodesQueryKey = ["admin", "discount-codes"] as const;

export const useDiscountCodes = () =>
  useQuery({
    queryKey: discountCodesQueryKey,
    queryFn: async (): Promise<AdminDiscountCode[]> =>
      (await apiClient.get<AdminDiscountCode[]>("/admin/discount-codes")).data,
  });

export interface CreateDiscountCodeInput {
  code: string;
  percentOff?: number;
  amountOffHalalas?: number;
  packIds?: string[];
  maxRedemptions?: number;
  expiresAt?: string;
  note?: string;
}

export function useCreateDiscountCode() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateDiscountCodeInput) =>
      (
        await apiClient.post<AdminDiscountCode>(
          "/admin/discount-codes",
          input,
        )
      ).data,
    onSuccess: () =>
      client.invalidateQueries({ queryKey: discountCodesQueryKey }),
  });
}

export function useSetDiscountCodeActive() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { code: string; active: boolean }) =>
      (
        await apiClient.patch(`/admin/discount-codes/${input.code}/active`, {
          active: input.active,
        })
      ).data,
    onSuccess: () =>
      client.invalidateQueries({ queryKey: discountCodesQueryKey }),
  });
}
