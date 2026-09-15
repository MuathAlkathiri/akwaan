import { describe, expect, it } from "vitest";
import {
  buildContentItemPayload,
  emptyContentItemForm,
  toContentItemForm,
} from "@/features/world-management/services/content-item-form.service";

describe("Closest slider authoring", () => {
  it("serializes numeric ranges and keeps legacy content metadata-free", () => {
    const values = emptyContentItemForm("scope-1");
    values.answer.mode = "closest";
    values.answer.correctValue = "50";
    expect(buildContentItemPayload(values).mechanicPayload).toBeUndefined();

    values.answer.closestInteraction = "numeric-range";
    values.answer.closestMin = "0";
    values.answer.closestMax = "100";
    values.answer.closestStep = "5";
    values.answer.closestUnit = "كم";
    expect(buildContentItemPayload(values).mechanicPayload).toEqual({
      closestSlider: {
        mode: "numeric-range",
        min: 0,
        max: 100,
        step: 5,
        unit: "كم",
      },
    });
  });

  it("round-trips a between-anchors configuration", () => {
    const values = emptyContentItemForm("scope-1");
    values.answer.mode = "closest";
    values.answer.correctValue = "0.35";
    values.answer.closestInteraction = "between-anchors";
    values.answer.closestMin = "0";
    values.answer.closestMax = "1";
    values.answer.closestStep = "0.01";
    values.answer.closestLeftAnchor = "خفيف";
    values.answer.closestRightAnchor = "ثقيل";
    const payload = buildContentItemPayload(values);
    const restored = toContentItemForm({
      id: "item-1",
      scopeId: "scope-1",
      worldId: "world-1",
      prompt: { ar: "قدّر" },
      compatibleChallengeTypeIds: [],
      answerPayload: payload.answerPayload,
      mechanicPayload: payload.mechanicPayload,
      status: "draft",
      isReusableAcrossSessions: false,
      readiness: { readiness: "not_ready", blockers: [], warnings: [] },
      compatibleFamilies: [],
      isSessionReuseExempt: false,
    });
    expect(restored.answer).toMatchObject({
      closestInteraction: "between-anchors",
      closestMin: "0",
      closestMax: "1",
      closestStep: "0.01",
      closestLeftAnchor: "خفيف",
      closestRightAnchor: "ثقيل",
    });
  });
});
