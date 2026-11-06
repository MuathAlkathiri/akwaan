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

  it("builds and hydrates the versioned hotspot contract without changing V1", () => {
    const values = emptyContentItemForm("scope-cars");
    values.promptAr = "حدد موضع القطعة الدخيلة";
    values.compatibleChallengeTypeIds = ["ct-odd-piece"];
    values.answer.mode = "odd_piece";
    values.oddPiece = {
      enabled: true,
      version: 2,
      targetVehicleIdentity: "bmw-m4-g82",
      targetVehicleLabel: "BMW M4 G82",
      targetRevealImageUrl: "",
      pieces: [],
      v2: {
        difficulty: "medium",
        modifiedImage: {
          url: "https://media.test/modified.jpg",
          width: "1200",
          height: "800",
          orientation: "landscape",
          assetOrigin: "ai-edited",
          sourceUrl: "https://source.test/modified",
          licenceNote: "CC BY-SA 4.0",
          editedRegion: "localized body area",
          editModel: "local-mask-v1",
        },
        originalImage: {
          url: "https://media.test/original.jpg",
          width: "1200",
          height: "800",
          orientation: "landscape",
          assetOrigin: "authentic",
          sourceUrl: "https://source.test/original",
          licenceNote: "CC BY-SA 4.0",
          editedRegion: "",
          editModel: "",
        },
        intruderVehicleIdentity: "mercedes-amg-c63-w206",
        intruderVehicleLabel: "Mercedes-AMG C63 W206",
        intruderPartIdentity: "front-lamp",
        intruderPartLabel: "المصباح الأمامي",
        polygon: [
          { x: 0.4, y: 0.4 },
          { x: 0.6, y: 0.4 },
          { x: 0.6, y: 0.6 },
          { x: 0.4, y: 0.6 },
        ],
        tolerance: "0.02",
      },
    };
    expect(findLocalFormProblems(values)).toEqual([]);
    const payload = buildContentItemPayload(values);
    expect(payload.mechanicPayload).toMatchObject({
      variant: "odd-piece",
      version: 2,
      difficulty: "medium",
      modifiedImage: {
        media: { assets: [{ url: "https://media.test/modified.jpg" }] },
      },
      hotspot: { tolerance: 0.02 },
    });

    const saved = {
      id: "item-v2",
      worldId: "cars",
      scopeId: "scope-cars",
      prompt: { ar: values.promptAr },
      compatibleChallengeTypeIds: ["ct-odd-piece"],
      answerPayload: { mode: "odd_piece" },
      mechanicPayload: payload.mechanicPayload,
      isReusableAcrossSessions: false,
      status: "draft",
    } as ContentItem;
    const hydrated = toContentItemForm(saved);
    expect(hydrated.oddPiece.version).toBe(2);
    expect(hydrated.oddPiece.v2?.difficulty).toBe("medium");
    expect(hydrated.oddPiece.v2?.polygon).toHaveLength(4);
    expect(hydrated.oddPiece.v2?.modifiedImage.url).toBe(
      "https://media.test/modified.jpg",
    );
  });

  it("requires explicit V2 provenance, matching dimensions and bounded geometry", () => {
    const values = emptyContentItemForm("scope-cars");
    values.promptAr = "حدد موضع القطعة الدخيلة";
    values.compatibleChallengeTypeIds = ["ct-odd-piece"];
    values.answer.mode = "odd_piece";
    values.oddPiece.version = 2;
    values.oddPiece.enabled = true;
    values.oddPiece.targetVehicleIdentity = "bmw-m4-g82";
    values.oddPiece.targetVehicleLabel = "BMW M4 G82";
    values.oddPiece.v2!.difficulty = "easy";
    values.oddPiece.v2!.modifiedImage.url = "https://media.test/bmw-m4-g82.jpg";
    values.oddPiece.v2!.modifiedImage.width = "1200";
    values.oddPiece.v2!.modifiedImage.height = "800";
    values.oddPiece.v2!.modifiedImage.sourceUrl = "https://source.test";
    values.oddPiece.v2!.originalImage.url = "https://media.test/original.jpg";
    values.oddPiece.v2!.originalImage.width = "1000";
    values.oddPiece.v2!.originalImage.height = "800";
    values.oddPiece.v2!.originalImage.sourceUrl = "https://source.test";
    values.oddPiece.v2!.intruderVehicleIdentity = "amg-c63";
    values.oddPiece.v2!.intruderVehicleLabel = "AMG C63";
    values.oddPiece.v2!.intruderPartIdentity = "lamp";
    values.oddPiece.v2!.intruderPartLabel = "مصباح";
    values.oddPiece.v2!.polygon = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: 1, y: 0 },
    ];
    values.oddPiece.v2!.tolerance = "0.4";
    const problems = findLocalFormProblems(values);
    expect(problems.some((problem) => problem.includes("الأبعاد"))).toBe(true);
    expect(problems.some((problem) => problem.includes("التسامح"))).toBe(true);
    expect(problems.some((problem) => problem.includes("تتقاطع"))).toBe(true);
    expect(problems.some((problem) => problem.includes("تكشف هوية"))).toBe(
      true,
    );
  });
});
