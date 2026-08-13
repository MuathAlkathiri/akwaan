import { describe, expect, it } from "vitest";
import type { Category } from "@/types";
import { selectNewCategories } from "./select-new-categories";

const category = (
  id: string,
  createdAt: string,
  isActive = true,
): Category => ({
  id,
  name: id,
  slug: id,
  audioPolicy: "optional",
  gameplayMode: "STANDARD",
  isActive,
  createdAt,
  updatedAt: createdAt,
});

describe("selectNewCategories", () => {
  it("selects the newest active categories instead of a static slug list", () => {
    const result = selectNewCategories(
      [
        category("old", "2026-01-01T00:00:00.000Z"),
        category("newest", "2026-08-01T00:00:00.000Z"),
        category("inactive", "2026-08-02T00:00:00.000Z", false),
        category("new", "2026-07-31T00:00:00.000Z"),
      ],
      2,
    );

    expect(result.map(({ id }) => id)).toEqual(["newest", "new"]);
  });
});
