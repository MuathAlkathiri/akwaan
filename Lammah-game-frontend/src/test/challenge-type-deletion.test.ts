import { describe, expect, it } from "vitest";
import { presentChallengeTypeDeletion } from "@/features/world-management/utils/challenge-type-deletion.presenter";
import type { ChallengeTypeDeletionPreview } from "@/features/world-management/types";

const preview = (
  overrides: Partial<ChallengeTypeDeletionPreview> = {},
): ChallengeTypeDeletionPreview => ({
  challengeTypeId: "type-1",
  name: "تجريبية",
  historicalMatchUsageCount: 0,
  contentItemCount: 36,
  worldAssignmentCount: 3,
  scopeExclusionCount: 2,
  canHardDelete: true,
  archiveRequired: false,
  productionMechanic: false,
  ...overrides,
});

describe("ChallengeType deletion confirmation", () => {
  it("shows cascade counts and a destructive hard-delete confirmation", () => {
    const result = presentChallengeTypeDeletion("تجريبية", preview());
    expect(result.title).toContain("حذف «تجريبية» نهائيًا");
    expect(result.description).toContain("36 عنصر محتوى");
    expect(result.description).toContain("3 عوالم");
    expect(result.confirmLabel).toBe("حذف نهائي");
    expect(result.destructive).toBe(true);
  });

  it("offers archive without a destructive delete path for Match history", () => {
    const result = presentChallengeTypeDeletion(
      "تاريخية",
      preview({
        historicalMatchUsageCount: 4,
        canHardDelete: false,
        archiveRequired: true,
      }),
    );
    expect(result.title).toContain("لا يمكن حذف");
    expect(result.description).toContain("4 مباراة");
    expect(result.confirmLabel).toBe("أرشفة الميكانيكا");
    expect(result.destructive).toBe(false);
  });
});
