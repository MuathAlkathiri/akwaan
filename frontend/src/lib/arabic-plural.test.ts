import { describe, expect, it } from "vitest";
import { ARABIC_NOUNS, arabicCount, arabicNoun } from "./arabic-plural";

/**
 * Arabic counting, which is not pluralisation with an extra case.
 *
 * The module had no test and `arabicCount` had no caller, so its one
 * hard-coded "واحد" had never met a feminine noun. The shop counts in
 * مباراة — feminine — so it does now.
 */
describe("the noun alone", () => {
  it.each([
    [1, "عالم"],
    [2, "عالمان"],
    [3, "عوالم"],
    [10, "عوالم"],
    [11, "عالمًا"],
    [100, "عالمًا"],
  ])("gives %i the right form", (count, expected) => {
    expect(arabicNoun(count, ARABIC_NOUNS.world)).toBe(expected);
  });
});

describe("the whole phrase", () => {
  it("agrees with a masculine noun", () => {
    expect(arabicCount(1, ARABIC_NOUNS.world)).toBe("عالم واحد");
  });

  it("agrees with a feminine noun", () => {
    // "مباراة واحد" is the tell of an interface translated rather than written.
    expect(arabicCount(1, ARABIC_NOUNS.match)).toBe("مباراة واحدة");
    expect(arabicCount(1, ARABIC_NOUNS.card)).toBe("بطاقة واحدة");
  });

  it("leaves the numeral off one and two, which already say how many", () => {
    expect(arabicCount(2, ARABIC_NOUNS.match)).toBe("مباراتان");
    expect(arabicCount(1, ARABIC_NOUNS.match)).not.toMatch(/\d/);
  });

  it("counts the way the shop prices do", () => {
    // The packs read "5 مباريات" and "15 مباراة" — three to ten take the
    // plural, eleven and above take the singular.
    expect(arabicCount(5, ARABIC_NOUNS.match)).toBe("5 مباريات");
    expect(arabicCount(15, ARABIC_NOUNS.match)).toBe("15 مباراة");
  });

  it("gives every noun a gender, since one has to agree with it", () => {
    for (const forms of Object.values(ARABIC_NOUNS)) {
      expect(["masculine", "feminine"]).toContain(forms.gender);
    }
  });
});
