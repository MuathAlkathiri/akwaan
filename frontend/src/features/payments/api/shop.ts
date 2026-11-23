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
    mutationFn: async (input: {
      packId: string;
      code?: string;
    }): Promise<string> => {
      const response = await apiClient.post<{ redirectUrl: string }>(
        "/payments/checkout",
        input.code ? { packId: input.packId, code: input.code } : input,
      );
      return response.data.redirectUrl;
    },
  });

/** Why a code did not apply. The server names it; the shop translates it. */
export type DiscountRefusal =
  | "unknown"
  | "inactive"
  | "expired"
  | "used-up"
  | "wrong-pack"
  | "too-small";

export interface Quote {
  packId: string;
  listPriceHalalas: number;
  discountHalalas: number;
  totalHalalas: number;
  code?: string;
  refused?: DiscountRefusal;
}

export const quoteQueryKey = (packId: string, code?: string) =>
  ["payments", "quote", packId, code ?? ""] as const;

/**
 * What the selected pack costs right now, code included.
 *
 * Priced by the server on every change of pack or code, never worked out here.
 * A total computed in the browser is a total the browser could be wrong about
 * — and the one place a player must never be surprised is the amount on the
 * button they are about to press.
 */
export const useQuote = (packId: string | undefined, code?: string) =>
  useQuery({
    queryKey: quoteQueryKey(packId ?? "", code),
    enabled: Boolean(packId),
    queryFn: async (): Promise<Quote> =>
      (
        await apiClient.post<Quote>("/payments/quote", {
          packId,
          ...(code ? { code } : {}),
        })
      ).data,
    staleTime: 60_000,
    retry: false,
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
