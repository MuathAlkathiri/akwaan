import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/lib/api/client";
import type { WeeklyAllowance } from "../api/token-balance";

export interface AccountLedger {
  accountId: string;
  email: string;
  balance: number;
  weekly?: WeeklyAllowance;
  movements: {
    delta: number;
    reason: string;
    reference?: string;
    balanceAfter: number;
  }[];
}

/** Finds an account by its email. Run on demand, never as you type. */
export const useLookupAccount = () =>
  useMutation({
    mutationFn: async (email: string): Promise<AccountLedger> =>
      (
        await apiClient.get<AccountLedger>("/tokens/accounts/lookup", {
          params: { email },
        })
      ).data,
  });

export const useGrantMatches = () =>
  useMutation({
    mutationFn: async (input: {
      accountId: string;
      amount: number;
      note: string;
      idempotencyKey: string;
    }) =>
      (
        await apiClient.post<{ balance: number }>(
          `/tokens/accounts/${input.accountId}/grant`,
          {
            amount: input.amount,
            note: input.note,
            idempotencyKey: input.idempotencyKey,
          },
        )
      ).data,
  });

export interface CampaignSettings {
  open: boolean;
  endsAt?: string;
  salesOpen: boolean;
  weeklyFreeMatches: number;
}

const campaignKey = ["admin", "campaign"] as const;

export const useCampaignSettings = () =>
  useQuery({
    queryKey: campaignKey,
    queryFn: async (): Promise<CampaignSettings> =>
      (await apiClient.get<CampaignSettings>("/tokens/campaign")).data,
  });

export function useSetWeeklyLimit() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (weeklyFreeMatches: number) =>
      (await apiClient.put("/tokens/campaign", { weeklyFreeMatches })).data,
    onSuccess: () => client.invalidateQueries({ queryKey: campaignKey }),
  });
}

export interface GiftCode {
  code: string;
  tokens: number;
  maxRedemptions: number;
  redemptionCount: number;
  active: boolean;
  note?: string;
}

const giftCodesKey = ["admin", "gift-codes"] as const;

export const useGiftCodes = () =>
  useQuery({
    queryKey: giftCodesKey,
    queryFn: async (): Promise<GiftCode[]> =>
      (await apiClient.get<GiftCode[]>("/tokens/gift-codes")).data,
  });

export function useCreateGiftCode() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      code: string;
      tokens: number;
      maxRedemptions: number;
      note?: string;
    }) => (await apiClient.post<GiftCode>("/tokens/gift-codes", input)).data,
    onSuccess: () => client.invalidateQueries({ queryKey: giftCodesKey }),
  });
}

export function useSetGiftCodeActive() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (input: { code: string; active: boolean }) =>
      (
        await apiClient.patch(`/tokens/gift-codes/${input.code}/active`, {
          active: input.active,
        })
      ).data,
    onSuccess: () => client.invalidateQueries({ queryKey: giftCodesKey }),
  });
}
