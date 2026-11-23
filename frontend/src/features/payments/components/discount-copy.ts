import type { DiscountRefusal, Quote } from "../api/shop";

/**
 * Why a code did not work, in the player's own words.
 *
 * Every one of these names the actual reason. "الكود غير صالح" for all six
 * would be shorter and would leave a player retyping a code that is perfectly
 * well spelled and simply expired.
 */
const REFUSALS: Record<DiscountRefusal, string> = {
  unknown: "ما لقينا الكود ذا، تأكد من كتابته",
  inactive: "الكود ذا موقوف",
  expired: "الكود ذا انتهت صلاحيته",
  "used-up": "الكود ذا خلص عدد استخداماته",
  "wrong-pack": "الكود ذا ما ينفع على الباقة ذي، جرّبه على باقة ثانية",
  "too-small": "الكود ذا يخلي المبلغ أقل من الحد، جرّبه على باقة أكبر",
};

export function refusalMessage(refused: DiscountRefusal | undefined) {
  return refused ? REFUSALS[refused] : undefined;
}

/** Halalas to the riyals a player reads. Two places only when there are any. */
export function riyals(halalas: number): string {
  const amount = halalas / 100;
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

/** What the pay button says it will take. */
export function totalLabel(quote: Quote | undefined): string | undefined {
  return quote ? riyals(quote.totalHalalas) : undefined;
}

/** How much the code saved, when it saved anything. */
export function savingLabel(quote: Quote | undefined): string | undefined {
  if (!quote || quote.discountHalalas <= 0) return undefined;
  return riyals(quote.discountHalalas);
}
