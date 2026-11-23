import { describe, expect, it } from "vitest";
import { freeUntilLabel, shopState } from "./shop-state";

const selling = { packs: [], selling: true };
const free = { packs: [], selling: false, freeUntil: "2026-12-31T20:59:59.000Z" };

/**
 * Which face the shop shows.
 *
 * The ordering is the whole point. Each of these has been shown to the wrong
 * person in some shop somewhere: a player told to buy during a free month, a
 * player who just paid being shown a sales pitch instead of their receipt.
 */
describe("choosing the shop's state", () => {
  it("tells a returning player what happened to their money first", () => {
    // Even with an empty balance and a closed shop, the receipt wins.
    expect(
      shopState({ catalogue: free, balance: 0, returning: "settled" }),
    ).toBe("settled");
    expect(
      shopState({ catalogue: free, balance: 0, returning: "unsettled" }),
    ).toBe("unsettled");
  });

  it("refuses to sell during the free month", () => {
    expect(shopState({ catalogue: free, balance: 3 })).toBe("free");
  });

  it("does not call an empty balance a problem while play is free", () => {
    // Nothing is being consumed, so zero costs the player nothing.
    expect(shopState({ catalogue: free, balance: 0 })).toBe("free");
  });

  it("speaks up about an empty balance once buying is possible", () => {
    expect(shopState({ catalogue: selling, balance: 0 })).toBe("empty");
  });

  it("is an ordinary shop otherwise", () => {
    expect(shopState({ catalogue: selling, balance: 7 })).toBe("normal");
  });

  it("does not guess while the catalogue is still loading", () => {
    // No catalogue means we do not know whether the shop sells, and claiming
    // either would be a guess shown to a player.
    expect(shopState({ balance: 0 })).toBe("normal");
  });
});

describe("naming the day the free month closes", () => {
  it("counts the date in Riyadh, where the copy counts it", () => {
    // The instant is 20:59:59Z, which is 23:59:59 in Riyadh on the 31st. Read
    // in UTC it would say the 31st too, but an hour later it would not.
    expect(freeUntilLabel("2026-12-31T20:59:59.000Z")).toContain("31");
  });

  it("says nothing rather than something wrong", () => {
    expect(freeUntilLabel(undefined)).toBeUndefined();
    expect(freeUntilLabel("the end of december")).toBeUndefined();
  });
});
