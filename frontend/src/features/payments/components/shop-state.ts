import type { ShopCatalogue } from "../api/shop";

/**
 * Which of the shop's five faces to show.
 *
 * Kept apart from the rendering because the decision is the interesting part
 * and the only part worth testing: every one of these states has been shown to
 * the wrong person at some point in some shop, and the ordering below is what
 * stops that.
 */
export type ShopState =
  | "free" // the launch month: prices shown, nothing sold
  | "settled" // just back from a payment that landed
  | "unsettled" // just back from a payment we cannot confirm
  | "empty" // nothing left to play with
  | "normal";

export interface ShopSituation {
  catalogue?: ShopCatalogue;
  balance?: number;
  /** A charge the player came back carrying, if any. */
  returning?: "settled" | "unsettled";
}

export function shopState(situation: ShopSituation): ShopState {
  // A player who has just come back from paying is told what happened to their
  // money before anything else. Even during the free month: if they somehow
  // paid, that is the most important thing on the screen.
  if (situation.returning === "settled") return "settled";
  if (situation.returning === "unsettled") return "unsettled";

  // Then the campaign, because while it runs nothing is for sale and an empty
  // balance costs the player nothing.
  if (situation.catalogue && !situation.catalogue.selling) return "free";

  // A balance of zero is only worth shouting about once buying is possible —
  // and only once we KNOW it is. Without the catalogue we do not know whether
  // the shop sells, and telling a player their balance ran out is not
  // something to say on a guess.
  if (situation.catalogue?.selling && situation.balance === 0) return "empty";

  return "normal";
}

/** The day the free month closes, for the banner that names it. */
export function freeUntilLabel(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const closesAt = new Date(iso);
  if (Number.isNaN(closesAt.getTime())) return undefined;
  // Riyadh, because that is where the date in the copy is counted.
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", {
    day: "numeric",
    month: "long",
    timeZone: "Asia/Riyadh",
  }).format(closesAt);
}
