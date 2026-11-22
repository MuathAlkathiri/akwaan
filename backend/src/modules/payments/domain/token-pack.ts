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
 * The single token exists to lower the cost of trying the game, not because it
 * is good business: a fixed fee of about one riyal per transaction eats roughly
 * 8% of a 15-riyal sale and under 3% of a 60-riyal one. The packs are where the
 * margin is, which is why they are cheaper per Match and listed first.
 */
export const TOKEN_PACKS: readonly TokenPack[] = [
  { id: 'single', tokens: 1, priceHalalas: 1500, label: 'مباراة وحدة' },
  { id: 'five', tokens: 5, priceHalalas: 6000, label: '5 مباريات' },
  { id: 'fifteen', tokens: 15, priceHalalas: 15000, label: '15 مباراة' },
] as const;

export function tokenPackById(id: string): TokenPack | undefined {
  return TOKEN_PACKS.find((pack) => pack.id === id);
}

/** Riyals, for display only. Never use this to compute a charge. */
export function riyalsOf(pack: TokenPack): number {
  return pack.priceHalalas / HALALAS_PER_RIYAL;
}
