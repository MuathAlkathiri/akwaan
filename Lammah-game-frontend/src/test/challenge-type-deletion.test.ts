import { describe, expect, it } from "vitest";
import { presentChallengeTypeDeletion } from "@/features/world-management/utils/challenge-type-deletion.presenter";
import type { ChallengeTypeDeletionPreview } from "@/features/world-management/types";

const preview = (
  overrides: Partial<ChallengeTypeDeletionPreview> = {},
): ChallengeTypeDeletionPreview => ({
  challengeTypeId: "type-1",
  name: "تجريبية",
  historicalMatchUsageCount: 0,
  activeMatchUsageCount: 0,
  contentItemCount: 36,
  worldAssignmentCount: 3,
  scopeExclusionCount: 2,
  canHardDelete: true,
  historicalSnapshotSafe: true,
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

  it("warns strongly but allows deletion for completed Match history", () => {
    const result = presentChallengeTypeDeletion(
      "تاريخية",
      preview({
        historicalMatchUsageCount: 4,
      }),
    );
    expect(result.title).toContain("حذف «تاريخية» نهائيًا");
    expect(result.description).toContain("4 مباراة");
    expect(result.description).toContain("ستبقى نتائج المباريات السابقة محفوظة");
    expect(result.confirmLabel).toBe("حذف نهائي");
    expect(result.destructive).toBe(true);
  });

  it("blocks deletion while an active Match references the mechanic", () => {
    const result = presentChallengeTypeDeletion(
      "نشطة",
      preview({
        activeMatchUsageCount: 2,
        canHardDelete: false,
        blockReason: "active_match",
      }),
    );
    expect(result.description).toContain("2 مباراة نشطة");
    expect(result.canConfirm).toBe(false);
    expect(result.confirmLabel).not.toContain("أرشفة");
  });
});
