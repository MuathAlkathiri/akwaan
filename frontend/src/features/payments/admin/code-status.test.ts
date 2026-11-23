import { describe, expect, it } from "vitest";
import { codeStatus, discountLabel, usageLabel } from "./code-status";
import type { AdminDiscountCode } from "./discount-codes.api";

const NOW = new Date("2026-12-05T10:00:00.000Z");

const code = (over: Partial<AdminDiscountCode> = {}): AdminDiscountCode => ({
  code: "AKWAAN20",
  percentOff: 20,
  packIds: [],
  maxRedemptions: null,
  redeemedCount: 0,
  active: true,
  ...over,
});

describe("what a code is really doing", () => {
  it("is live when nothing stops it", () => {
    expect(codeStatus(code(), NOW)).toBe("live");
  });

  it("calls a switched-off code off, whatever else is true of it", () => {
    expect(codeStatus(code({ active: false }), NOW)).toBe("off");
  });

  it("does not call a code live when its date has passed", () => {
    // The trap this exists for: `active: true` on a code that refuses every
    // player who types it.
    expect(codeStatus(code({ expiresAt: "2026-12-01T00:00:00.000Z" }), NOW))
      .toBe("expired");
  });

  it("does not call a code live when the allocation is gone", () => {
    expect(
      codeStatus(code({ maxRedemptions: 100, redeemedCount: 100 }), NOW),
    ).toBe("used-up");
  });

  it("is live with one redemption left", () => {
    expect(
      codeStatus(code({ maxRedemptions: 100, redeemedCount: 99 }), NOW),
    ).toBe("live");
  });

  it("is live on a date still ahead", () => {
    expect(codeStatus(code({ expiresAt: "2027-01-01T00:00:00.000Z" }), NOW))
      .toBe("live");
  });
});

describe("how a code reads in the list", () => {
  it("shows a percentage as a percentage", () => {
    expect(discountLabel(code())).toBe("20%");
  });

  it("shows a fixed amount in riyals", () => {
    expect(
      discountLabel(code({ percentOff: undefined, amountOffHalalas: 2500 })),
    ).toBe("25 ريال");
  });

  it("keeps halalas when an amount has them", () => {
    expect(
      discountLabel(code({ percentOff: undefined, amountOffHalalas: 2550 })),
    ).toBe("25.50 ريال");
  });

  it("shows a bare count for an unlimited code", () => {
    expect(usageLabel(code({ redeemedCount: 12 }))).toBe("12");
  });

  it("shows the allocation for a capped one", () => {
    expect(usageLabel(code({ redeemedCount: 12, maxRedemptions: 50 }))).toBe(
      "12 / 50",
    );
  });
});
