import { useMutation, useQuery } from "@tanstack/react-query";
import apiClient from "@/lib/api/client";

export interface TokenPack {
  id: string;
  tokens: number;
  label: string;
  priceHalalas: number;
  priceRiyals: number;
}

export interface ShopCatalogue {
  packs: TokenPack[];
  /**
   * Whether the shop may take money at all.
   *
   * Decided by the server, not by comparing a date here: a decision made in
   * the browser is a decision made on the player's clock, and a clock is
   * something they can change.
   */
  selling: boolean;
  /** When the free launch month closes, while it is still running. */
  freeUntil?: string;
}

export const shopCatalogueQueryKey = ["payments", "packs"] as const;

/** Public: the prices show whether or not anybody is signed in. */
export const useShopCatalogue = () =>
  useQuery({
    queryKey: shopCatalogueQueryKey,
    queryFn: async (): Promise<ShopCatalogue> =>
      (await apiClient.get<ShopCatalogue>("/payments/packs")).data,
    staleTime: 5 * 60_000,
  });

/**
 * Opens a payment page for a pack.
 *
 * The account is never sent: the server takes it from the token, so a request
 * can only ever buy for itself.
 */
export const useStartCheckout = () =>
  useMutation({
    mutationFn: async (packId: string): Promise<string> => {
      const response = await apiClient.post<{ redirectUrl: string }>(
        "/payments/checkout",
        { packId },
      );
      return response.data.redirectUrl;
    },
  });

export type SettlementOutcome =
  | { granted: true; tokens: number; accountId: string }
  | { granted: false; reason: "not-paid" | "notice" | "unknown" };

/**
 * Asks the server to settle a charge the player has come back with.
 *
 * The second way a purchase can land. A webhook can be lost for good, and then
 * only the player knows they paid — so their return is treated as a question
 * worth asking, never as proof: the charge is read from the gateway, and the
 * `status=paid` in the query string that brought them here is ignored.
 */
export const useSettlePurchase = () =>
  useMutation({
    mutationFn: async (invoiceId: string): Promise<SettlementOutcome> =>
      (
        await apiClient.post<SettlementOutcome>("/payments/settle", {
          invoiceId,
        })
      ).data,
  });
