import { describe, expect, it } from "vitest";
import { SUPPORTED_TUTORIAL_MECHANIC_KEYS } from "@/features/challenge-explainer";
import { shouldRenderTutorialEditor } from "@/features/world-management/components/challenge-types/challenge-type-form";

describe("world-specific tutorial editor registry", () => {
  it("exposes every supported release mechanic through the Admin gate", () => {
    expect(SUPPORTED_TUTORIAL_MECHANIC_KEYS).toHaveLength(11);
    for (const key of SUPPORTED_TUTORIAL_MECHANIC_KEYS) {
      expect(shouldRenderTutorialEditor(key)).toBe(true);
    }
  });

  it("does not grant historical or excluded mechanics publication access", () => {
    expect(shouldRenderTutorialEditor("one-clue")).toBe(false);
    expect(shouldRenderTutorialEditor("rakkibha")).toBe(false);
    expect(shouldRenderTutorialEditor("moving-xo")).toBe(false);
    expect(shouldRenderTutorialEditor("display-label-only")).toBe(false);
    expect(shouldRenderTutorialEditor()).toBe(false);
  });
});
