/**
 * What a player can buy, and what it costs.
 *
 * One list, and the only place a price exists. A pack is identified by its id
 * in every request, webhook and ledger entry, so a price that changes later
 * never reinterprets a purchase that already happened — the id still says how
 * many tokens were bought, and the ledger still says what was paid.
 *
 * Amounts are in halalas, never riyals. Money in a floating-point riyal is how
 * 14.999999 reaches a customer's receipt; the payment providers take the
 * smallest unit anyway.
 */

export interface TokenPack {
  id: string;
  /** Matches this pack adds to the balance. */
  tokens: number;
  /** Total price in halalas. 100 halalas = 1 SAR. */
  priceHalalas: number;
  /** Shown to the player, in their own language. */
  label: string;
}

export const HALALAS_PER_RIYAL = 100;

/**
 * The catalogue.
 *
 * No single Match is sold: the smallest thing to buy is three. A fixed fee of
 * about a riyal per transaction eats too much of a one-Match sale, and a
 * player who has decided to pay is deciding to play more than once.
 *
 * One price for everybody from the first day. Any future offer adds Matches
 * to a pack; it never lowers a price, because a price that has been lowered
 * cannot be raised back.
 */
export const TOKEN_PACKS: readonly TokenPack[] = [
  { id: 'three', tokens: 3, priceHalalas: 3500, label: '3 مباريات' },
  { id: 'six', tokens: 6, priceHalalas: 5900, label: '6 مباريات' },
  { id: 'twelve', tokens: 12, priceHalalas: 9900, label: '12 مباراة' },
] as const;

export function tokenPackById(id: string): TokenPack | undefined {
  return TOKEN_PACKS.find((pack) => pack.id === id);
}

/** Riyals, for display only. Never use this to compute a charge. */
export function riyalsOf(pack: TokenPack): number {
  return pack.priceHalalas / HALALAS_PER_RIYAL;
}

/**
 * The ids the shop will accept on the wire.
 *
 * Derived from the catalogue rather than written out again, so adding a pack
 * cannot leave the endpoint refusing to sell it.
 */
export const TOKEN_PACK_IDS: string[] = TOKEN_PACKS.map((pack) => pack.id);
