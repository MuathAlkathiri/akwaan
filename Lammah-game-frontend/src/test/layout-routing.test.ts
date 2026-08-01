import { describe, expect, it } from "vitest";
import { isGameBoardPath } from "@/components/layout";

describe("player layout route classification", () => {
  it("keeps the new-game form in the normal scrollable page shell", () => {
    expect(isGameBoardPath("/games/new")).toBe(false);
  });

  it("uses the fixed board shell only for a game detail route", () => {
    expect(isGameBoardPath("/games/6a6a56ee011b008767874299")).toBe(true);
    expect(
      isGameBoardPath(
        "/games/6a6a56ee011b008767874299/questions/question-1",
      ),
    ).toBe(false);
    expect(isGameBoardPath("/games")).toBe(false);
  });
});
