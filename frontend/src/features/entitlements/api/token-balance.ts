import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/lib/api/client";

/** The week's free Matches during the launch month. */
export interface WeeklyAllowance {
  limit: number;
  used: number;
  remaining: number;
  /** When the count goes back to full. Absent in the campaign's last week. */
  renewsAt?: string;
}

/** Everything that decides whether this account can start a Match. */
export interface TokenAccount {
  /** Matches bought, gifted or added by hand. They never expire. */
  balance: number;
  campaign?: { open: boolean; endsAt?: string };
  /** Present only while the launch month is running. */
  weekly?: WeeklyAllowance;
}

/**
 * What the signed-in player can play with.
 *
 * The ledger answers with a bare object rather than the wrapped shape the
 * content endpoints use, so this does not go through `unwrap`.
 */
export const fetchTokenAccount = async (): Promise<TokenAccount> =>
  (await apiClient.get<TokenAccount>("/tokens/me")).data;

export const fetchTokenBalance = async (): Promise<number> =>
  (await fetchTokenAccount()).balance;

export const tokenBalanceQueryKey = ["tokens", "me"] as const;

/**
 * The account, for any screen that shows what is left.
 *
 * Only asked for when somebody is signed in: a guest has no ledger, and asking
 * would spend a 401 on every page view. Kept briefly fresh because the number
 * changes from outside the browser — a Match consumes one, a purchase adds
 * some — so a tab left open should not keep showing yesterday's figure.
 */
export const useTokenAccount = (enabled: boolean) =>
  useQuery({
    queryKey: tokenBalanceQueryKey,
    queryFn: fetchTokenAccount,
    enabled,
    staleTime: 30_000,
  });

/** The bought balance alone, for screens that are only about buying. */
export const useTokenBalance = (enabled: boolean) =>
  useQuery({
    queryKey: tokenBalanceQueryKey,
    queryFn: fetchTokenAccount,
    enabled,
    staleTime: 30_000,
    select: (account) => account.balance,
  });

/** How many Matches this account could start right now, free ones included. */
export const playableMatches = (account: TokenAccount): number =>
  account.balance + (account.weekly?.remaining ?? 0);

/**
 * Turns a gift code into Matches.
 *
 * The answer is immediate either way: the Matches landed, or the server says
 * in a sentence why not («الكود خلص», «استخدمت هالكود من قبل»).
 */
export function useRedeemGiftCode() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) =>
      (
        await apiClient.post<{ tokens: number; balance: number }>(
          "/tokens/redeem",
          { code },
        )
      ).data,
    onSuccess: () =>
      client.invalidateQueries({ queryKey: tokenBalanceQueryKey }),
  });
}
