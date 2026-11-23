import type { AdminDiscountCode } from "./discount-codes.api";

/**
 * What a code is actually doing right now.
 *
 * A code can be switched on and still be useless — expired, or out of
 * redemptions. A list that showed only the on/off switch would let someone
 * hand an influencer a code they can see is "active" and that refuses every
 * player who types it. The order below matches the server's, so the badge and
 * the refusal a player gets can never disagree.
 */
export type CodeStatus = "off" | "expired" | "used-up" | "live";

export function codeStatus(code: AdminDiscountCode, now: Date): CodeStatus {
  if (!code.active) return "off";
  if (code.expiresAt && new Date(code.expiresAt).getTime() <= now.getTime()) {
    return "expired";
  }
  if (
    code.maxRedemptions !== null &&
    code.redeemedCount >= code.maxRedemptions
  ) {
    return "used-up";
  }
  return "live";
}

export const STATUS_LABEL: Record<CodeStatus, string> = {
  live: "شغّال",
  off: "موقوف",
  expired: "منتهي",
  "used-up": "خلص",
};

/** What the code takes off, in words. */
export function discountLabel(code: AdminDiscountCode): string {
  if (code.percentOff !== undefined) return `${code.percentOff}%`;
  if (code.amountOffHalalas !== undefined) {
    const riyals = code.amountOffHalalas / 100;
    return `${Number.isInteger(riyals) ? riyals : riyals.toFixed(2)} ريال`;
  }
  return "—";
}

/** How much of the allocation is gone. */
export function usageLabel(code: AdminDiscountCode): string {
  return code.maxRedemptions === null
    ? `${code.redeemedCount}`
    : `${code.redeemedCount} / ${code.maxRedemptions}`;
}
