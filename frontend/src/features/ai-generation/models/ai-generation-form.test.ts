import { describe, expect, it } from "vitest";
import {
  AI_GENERATION_DEFAULTS,
  AI_GENERATION_MAX_COUNT,
  aiGenerationFormSchema,
} from "./ai-generation-form";

describe("AI generation form", () => {
  it("defaults to two medium questions", () => {
    expect(AI_GENERATION_DEFAULTS).toEqual({ count: 2, difficulty: "medium" });
  });

  it.each([0, 1.5, AI_GENERATION_MAX_COUNT + 1])(
    "rejects invalid count %s",
    (count) => {
      expect(
        aiGenerationFormSchema.safeParse({ count, difficulty: "medium" })
          .success,
      ).toBe(false);
    },
  );

  it.each(["easy", "medium", "hard"])(
    "accepts supported difficulty %s",
    (difficulty) => {
      expect(
        aiGenerationFormSchema.safeParse({ count: 2, difficulty }).success,
      ).toBe(true);
    },
  );
});
