import { describe, expect, it } from "vitest";
import { refusalMessage, riyals, savingLabel, totalLabel } from "./discount-copy";
import type { Quote } from "../api/shop";

const quote = (over: Partial<Quote> = {}): Quote => ({
  packId: "fifteen",
  listPriceHalalas: 15000,
  discountHalalas: 0,
  totalHalalas: 15000,
  ...over,
});

describe("riyals", () => {
  it("drops the decimals on a whole amount", () => {
    expect(riyals(15000)).toBe("150");
  });

  it("keeps two places when there are halalas", () => {
    expect(riyals(12050)).toBe("120.50");
  });

  it("never prints a bare dot", () => {
    expect(riyals(100)).toBe("1");
  });
});

describe("what the player is told", () => {
  it("names the real reason rather than one blanket refusal", () => {
    expect(refusalMessage("expired")).not.toBe(refusalMessage("used-up"));
    expect(refusalMessage("expired")).toContain("صلاحيته");
  });

  it("says nothing when the code applied", () => {
    expect(refusalMessage(undefined)).toBeUndefined();
  });

  it("puts the discounted total on the button", () => {
    expect(totalLabel(quote({ discountHalalas: 3000, totalHalalas: 12000 })))
      .toBe("120");
  });

  it("shows the saving only when there is one", () => {
    expect(savingLabel(quote())).toBeUndefined();
    expect(savingLabel(quote({ discountHalalas: 3000 }))).toBe("30");
  });
});
