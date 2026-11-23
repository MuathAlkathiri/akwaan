import { TokenPack } from './token-pack';

/**
 * A code that lowers the price of a pack.
 *
 * Two shapes, because the two reasons to hand one out are different. A
 * percentage follows the pack — a creator's 20% is worth more on the fifteen
 * than on the single, which is the point of giving it to someone whose
 * audience buys. A fixed amount is a flat gift, and is what a support
 * apology or a printed card wants to be.
 *
 * Only one of the two is ever set. A code carrying both would have to pick an
 * order to apply them in, and whichever order it picked would be a surprise to
 * somebody.
 */
export interface DiscountCode {
  /** Always upper case and trimmed. See `normaliseCode`. */
  code: string;
  percentOff?: number;
  amountOffHalalas?: number;
  /** Packs this code may be used on. Empty means every pack. */
  packIds: string[];
  /** How many paid purchases may use it. Null means no limit. */
  maxRedemptions: number | null;
  redeemedCount: number;
  expiresAt?: Date;
  active: boolean;
}

/**
 * The smallest charge worth opening.
 *
 * Below a riyal the provider's fixed fee is most of the sale, and some
 * gateways refuse the charge outright. A code that would take the total under
 * this is refused rather than quietly clamped — a player who typed a code and
 * saw a price that is not the one the code promised has been lied to.
 */
export const MIN_CHARGE_HALALAS = 100;

/** Why a code was not applied, in a form the shop can turn into Arabic. */
export type DiscountRefusal =
  'unknown' | 'inactive' | 'expired' | 'used-up' | 'wrong-pack' | 'too-small';

export interface Quote {
  packId: string;
  listPriceHalalas: number;
  discountHalalas: number;
  totalHalalas: number;
  /** The code that was applied, if one was. */
  code?: string;
  /** Set when a code was offered and not applied. The price is the list price. */
  refused?: DiscountRefusal;
}

/**
 * The one spelling of a code.
 *
 * Players type codes off a story, a sticker or their own memory, with whatever
 * case and spaces come out. Matching has to happen on one form, and it is this
 * one — used when a code is stored and again when it is looked up, so the two
 * can never drift apart.
 */
export function normaliseCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/** The price of a pack with nothing applied. */
export function listQuote(pack: TokenPack): Quote {
  return {
    packId: pack.id,
    listPriceHalalas: pack.priceHalalas,
    discountHalalas: 0,
    totalHalalas: pack.priceHalalas,
  };
}

/**
 * What a pack costs with a code, or why the code does not apply.
 *
 * Pure, and the only place a discounted total is worked out. The amount it
 * returns is what gets charged and what gets written to the intent, so a
 * second implementation of this arithmetic anywhere else is a second answer to
 * what the player owes.
 *
 * Rounding goes down, to the player's benefit. A percentage of an odd price
 * lands between halalas, and the half-riyal a year this costs is cheaper than
 * explaining why 20% off came to 20.0001.
 */
export function quoteWithCode(
  pack: TokenPack,
  code: DiscountCode | undefined,
  now: Date,
): Quote {
  const list = listQuote(pack);
  if (!code) {
    return list;
  }

  const refusal = refuse(pack, code, now);
  if (refusal) {
    return { ...list, refused: refusal };
  }

  const discount = Math.min(
    pack.priceHalalas,
    code.percentOff !== undefined
      ? Math.floor((pack.priceHalalas * code.percentOff) / 100)
      : (code.amountOffHalalas ?? 0),
  );
  const total = pack.priceHalalas - discount;

  if (total < MIN_CHARGE_HALALAS) {
    return { ...list, refused: 'too-small' };
  }

  return {
    ...list,
    discountHalalas: discount,
    totalHalalas: total,
    code: code.code,
  };
}

function refuse(
  pack: TokenPack,
  code: DiscountCode,
  now: Date,
): DiscountRefusal | undefined {
  if (!code.active) return 'inactive';
  if (code.expiresAt && code.expiresAt.getTime() <= now.getTime()) {
    return 'expired';
  }
  if (
    code.maxRedemptions !== null &&
    code.redeemedCount >= code.maxRedemptions
  ) {
    return 'used-up';
  }
  if (code.packIds.length > 0 && !code.packIds.includes(pack.id)) {
    return 'wrong-pack';
  }
  return undefined;
}
