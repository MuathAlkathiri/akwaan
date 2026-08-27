import { describe, expect, it } from "vitest";
import { normalizeDigits } from "@/lib/normalize-digits";

describe("normalizeDigits", () => {
  it.each([
    ["123456", "123456"],
    ["١٢٣٤٥٦", "123456"],
    ["۱۲۳۴۵۶", "123456"],
    ["1٢۳4٥۶", "123456"],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeDigits(input)).toBe(expected);
  });

  it.each([
    // Non-digit text (Arabic letters, spaces, symbols, empty) is passed through
    // untouched; only the numerals inside it are converted.
    ["", ""],
    ["الكود ٧٨٩ الآن", "الكود 789 الآن"],
    ["+٩٦٦-٥٠", "+966-50"],
    ["لا أرقام هنا", "لا أرقام هنا"],
  ])("preserves non-digit text: %s -> %s", (input, expected) => {
    expect(normalizeDigits(input)).toBe(expected);
  });
});
