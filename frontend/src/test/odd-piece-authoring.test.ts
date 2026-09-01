import { describe, expect, it } from "vitest";
import {
  buildContentItemPayload,
  emptyContentItemForm,
  findLocalFormProblems,
  hasOddPieceMechanic,
  toContentItemForm,
} from "@/features/world-management/services/content-item-form.service";
import type { ContentItem } from "@/features/world-management/types";

const complete = () => {
  const values = emptyContentItemForm("scope-cars");
  values.promptAr = "اختر القطعة الدخيلة";
  values.compatibleChallengeTypeIds = ["ct-odd-piece"];
  values.answer.mode = "odd_piece";
  values.oddPiece = {
    enabled: true,
    targetVehicleIdentity: "bmw-m4",
    targetVehicleLabel: "BMW M4",
    targetRevealImageUrl: "https://test/full.jpg",
    pieces: ["a", "b", "c", "d"].map((localId, index) => ({
      localId,
      vehicleIdentity: index < 3 ? "bmw-m4" : "amg-c63",
      vehicleLabel: index < 3 ? "BMW M4" : "Mercedes-AMG C63",
      imageUrl: `https://test/${localId}.jpg`,
    })),
  };
  return values;
};

describe("Odd Piece authoring", () => {
  it("is selected only by the canonical mechanic slug", () => {
    expect(
      hasOddPieceMechanic([{ challengeType: { slug: "odd-piece" } }]),
    ).toBe(true);
    expect(hasOddPieceMechanic([{ challengeType: { slug: "bomb" } }])).toBe(
      false,
    );
  });

  it("builds the canonical four-image plus full-reveal payload", () => {
    const values = complete();
    expect(findLocalFormProblems(values)).toEqual([]);
    const payload = buildContentItemPayload(values);
    expect(payload.answerPayload).toEqual({ mode: "odd_piece" });
    expect(payload.mechanicPayload).toMatchObject({
      variant: "odd-piece",
      targetVehicleIdentity: "bmw-m4",
      pieces: expect.arrayContaining([
        expect.objectContaining({ localId: "d", vehicleIdentity: "amg-c63" }),
      ]),
    });
  });

  it("rejects malformed splits and hydrates existing data for edit", () => {
    const values = complete();
    values.oddPiece.pieces[2].vehicleIdentity = "amg-c63";
    expect(findLocalFormProblems(values)).toContain(
      "يجب أن تكون ثلاث قطع من السيارة الأساسية وقطعة واحدة دخيلة.",
    );
    const saved = {
      id: "item-1",
      worldId: "cars",
      scopeId: "scope-cars",
      prompt: { ar: values.promptAr },
      compatibleChallengeTypeIds: ["ct-odd-piece"],
      answerPayload: { mode: "odd_piece" },
      mechanicPayload: buildContentItemPayload(complete()).mechanicPayload,
      isReusableAcrossSessions: false,
      status: "ready",
    } as ContentItem;
    const hydrated = toContentItemForm(saved);
    expect(hydrated.oddPiece.enabled).toBe(true);
    expect(hydrated.oddPiece.targetRevealImageUrl).toBe(
      "https://test/full.jpg",
    );
    expect(hydrated.oddPiece.pieces).toHaveLength(4);
  });
});
