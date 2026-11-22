import { useQuery } from "@tanstack/react-query";
import apiClient from "@/lib/api/client";

/**
 * How many Matches the signed-in player has left.
 *
 * The ledger answers with a bare `{ balance }` rather than the wrapped shape
 * the content endpoints use, so this does not go through `unwrap`.
 */
export const fetchTokenBalance = async (): Promise<number> => {
  const response = await apiClient.get<{ balance: number }>("/tokens/me");
  return response.data.balance;
};

export const tokenBalanceQueryKey = ["tokens", "me"] as const;

/**
 * The balance, for any screen that shows it.
 *
 * Only asked for when somebody is signed in: a guest has no ledger, and asking
 * would spend a 401 on every page view. Kept briefly fresh because the number
 * changes from outside the browser — a Match consumes one, a purchase adds
 * some — so a tab left open should not keep showing yesterday's figure.
 */
export const useTokenBalance = (enabled: boolean) =>
  useQuery({
    queryKey: tokenBalanceQueryKey,
    queryFn: fetchTokenBalance,
    enabled,
    staleTime: 30_000,
  });
