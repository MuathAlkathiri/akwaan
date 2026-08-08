import { describe, expect, it } from "vitest";
import { gameValidationMessageAr } from "./game-validation-errors";

describe("gameValidationMessageAr", () => {
  it.each([
    "STANDARD_MISSING_200_QUESTIONS",
    "STANDARD_MISSING_400_QUESTIONS",
    "STANDARD_MISSING_600_QUESTIONS",
    "TOP10_NO_APPROVED_QUESTIONS",
    "TOP10_INVALID_ANSWER_COUNT",
    "TOP10_INVALID_SCORE_SEQUENCE",
    "TOP10_DUPLICATE_ANSWER",
    "TOP10_INVALID_RANKING",
    "TOP10_INVALID_ACCEPTED_ANSWERS",
  ])("returns a readable Arabic message for %s", (code) => {
    expect(gameValidationMessageAr(code)).toMatch(/[\u0600-\u06ff]/);
  });

  it("does not replace unknown backend messages", () => {
    expect(gameValidationMessageAr("UNKNOWN")).toBeUndefined();
  });
});
