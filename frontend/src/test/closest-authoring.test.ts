import { describe, expect, it } from "vitest";
import {
  buildContentItemPayload,
  emptyContentItemForm,
  findLocalFormProblems,
  hasClosestSliderMode,
  toContentItemForm,
} from "@/features/world-management/services/content-item-form.service";
import type { ContentItem } from "@/features/world-management/types";

describe("Closest slider authoring", () => {
  it("serializes numeric ranges and keeps legacy content metadata-free", () => {
    const values = emptyContentItemForm("scope-1");
    values.answer.mode = "closest";
    values.answer.correctValue = "50";
    // A form that has not chosen yet emits no slider — it must not be mistaken
    // for a deliberate legacy choice, and it must not invent one either.
    expect(values.answer.closestInteraction).toBe("");
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

/**
 * The approved authoring rule: `legacy` is backward compatibility for content
 * written before the slider, never a choice available to new content.
 */
describe("the interaction mode new Closest content must choose", () => {
  const MODE_REQUIRED =
    "اختر طريقة التفاعل لمين أقرب: نطاق رقمي أو بين نقطتي ارتكاز.";

  const newClosest = () => {
    const values = emptyContentItemForm("scope-1");
    values.compatibleChallengeTypeIds = ["closest-type"];
    values.promptAr = "كم عدد الأهداف؟";
    values.answer.mode = "closest";
    values.answer.correctValue = "50";
    return values;
  };

  it("starts unselected rather than defaulting to legacy", () => {
    expect(emptyContentItemForm("scope-1").answer.closestInteraction).toBe("");
    expect(hasClosestSliderMode("")).toBe(false);
    expect(hasClosestSliderMode("legacy")).toBe(false);
    expect(hasClosestSliderMode("numeric-range")).toBe(true);
    expect(hasClosestSliderMode("between-anchors")).toBe(true);
  });

  it("refuses a new item with no mode, and one still calling itself legacy", () => {
    expect(
      findLocalFormProblems(newClosest(), { isNewItem: true }),
    ).toContain(MODE_REQUIRED);
    const legacy = newClosest();
    legacy.answer.closestInteraction = "legacy";
    expect(findLocalFormProblems(legacy, { isNewItem: true })).toContain(
      MODE_REQUIRED,
    );
  });

  it("accepts a new item that authored either continuum", () => {
    const ranged = newClosest();
    ranged.answer.closestInteraction = "numeric-range";
    ranged.answer.closestMin = "0";
    ranged.answer.closestMax = "100";
    expect(findLocalFormProblems(ranged, { isNewItem: true })).toEqual([]);

    const anchored = newClosest();
    anchored.answer.closestInteraction = "between-anchors";
    anchored.answer.closestMin = "0";
    anchored.answer.closestMax = "100";
    anchored.answer.closestLeftAnchor = "قريب";
    anchored.answer.closestRightAnchor = "بعيد";
    expect(findLocalFormProblems(anchored, { isNewItem: true })).toEqual([]);
  });

  it("refuses a continuum that does not contain its own answer", () => {
    const values = newClosest();
    values.answer.closestInteraction = "numeric-range";
    values.answer.closestMin = "0";
    values.answer.closestMax = "10";
    expect(findLocalFormProblems(values, { isNewItem: true })).toContain(
      "الإجابة الصحيحة يجب أن تقع داخل النطاق المحدد.",
    );
  });

  it("refuses an inverted range, a non-positive step, and repeated anchors", () => {
    const inverted = newClosest();
    inverted.answer.closestInteraction = "numeric-range";
    inverted.answer.closestMin = "100";
    inverted.answer.closestMax = "0";
    expect(findLocalFormProblems(inverted, { isNewItem: true })).toContain(
      "حدّد حدًّا أدنى وحدًّا أعلى صحيحين، والأدنى أقل من الأعلى.",
    );

    const badStep = newClosest();
    badStep.answer.closestInteraction = "numeric-range";
    badStep.answer.closestMin = "0";
    badStep.answer.closestMax = "100";
    badStep.answer.closestStep = "-1";
    expect(findLocalFormProblems(badStep, { isNewItem: true })).toContain(
      "الخطوة يجب أن تكون رقمًا موجبًا.",
    );

    const sameAnchors = newClosest();
    sameAnchors.answer.closestInteraction = "between-anchors";
    sameAnchors.answer.closestMin = "0";
    sameAnchors.answer.closestMax = "100";
    sameAnchors.answer.closestLeftAnchor = "نفس الشيء";
    sameAnchors.answer.closestRightAnchor = "نفس الشيء";
    expect(findLocalFormProblems(sameAnchors, { isNewItem: true })).toContain(
      "نقطتا الارتكاز مطلوبتان ويجب أن تكونا مختلفتين.",
    );
  });

  const savedLegacyItem = () =>
    ({
      id: "legacy-1",
      scopeId: "scope-1",
      worldId: "world-1",
      prompt: { ar: "كم عدد الأهداف؟" },
      compatibleChallengeTypeIds: ["closest-type"],
      answerPayload: { mode: "closest", correctValue: 50, acceptedTolerance: 0 },
      status: "ready",
      isReusableAcrossSessions: false,
      readiness: { readiness: "ready", blockers: [], warnings: [] },
      compatibleFamilies: [],
      isSessionReuseExempt: false,
    }) as unknown as ContentItem;

  it("loads an existing legacy item as legacy and lets it be edited", () => {
    const loaded = toContentItemForm(savedLegacyItem());
    expect(loaded.answer.closestInteraction).toBe("legacy");
    // Editing it is not migrating it: the rule is about authoring moment, so an
    // edit raises no complaint and the payload stays metadata-free.
    loaded.promptAr = "كم عدد الأهداف بالضبط؟";
    expect(findLocalFormProblems(loaded)).toEqual([]);
    expect(buildContentItemPayload(loaded).mechanicPayload).toBeUndefined();
    expect(buildContentItemPayload(loaded).answerPayload).toMatchObject({
      mode: "closest",
      correctValue: 50,
    });
  });

  it("applies the full contract once a legacy item is deliberately migrated", () => {
    const migrating = toContentItemForm(savedLegacyItem());
    migrating.answer.closestInteraction = "numeric-range";
    migrating.answer.closestMin = "0";
    migrating.answer.closestMax = "10";
    expect(findLocalFormProblems(migrating)).toContain(
      "الإجابة الصحيحة يجب أن تقع داخل النطاق المحدد.",
    );
    migrating.answer.closestMax = "200";
    expect(findLocalFormProblems(migrating)).toEqual([]);
    const payload = buildContentItemPayload(migrating);
    expect(payload.mechanicPayload).toEqual({
      closestSlider: { mode: "numeric-range", min: 0, max: 200 },
    });
    // The factual answer is untouched by the migration.
    expect(payload.answerPayload).toMatchObject({
      mode: "closest",
      correctValue: 50,
    });
  });

  it("holds a legacy item copied as new to the new rule", () => {
    // Duplication is authoring: the copy is a new item, so carrying the old
    // shape forward has to be refused rather than inherited silently.
    const copy = toContentItemForm(savedLegacyItem());
    expect(copy.answer.closestInteraction).toBe("legacy");
    expect(findLocalFormProblems(copy, { isNewItem: true })).toContain(
      MODE_REQUIRED,
    );
  });
});

/**
 * The defect Pilot Batch 01 exposed.
 *
 * Every slider range in the tests that shipped with the runtime happened to
 * have a midpoint on its own step grid (0→100 step 5 starts at 50). Real
 * authored content does not: eight of the first pilot's seventeen ranges seed a
 * value the step forbids, and the server refuses those with
 * "Estimate does not match the authored step". The `<input type="range">` hid it
 * by snapping itself, so the thumb sat on a legal value while the bubble and the
 * submitted state held an illegal one.
 */
describe("the value a Closest slider starts on", () => {
  it("lands on the authored step grid, not on the raw midpoint", async () => {
    const { seedClosestEstimate } = await import(
      "@/features/live-game-session/components/closest-gameplay-panel"
    );
    const onStep = (value: number, slider: { min: number; step?: number }) => {
      if (!slider.step) return true;
      const steps = (value - slider.min) / slider.step;
      return Math.abs(steps - Math.round(steps)) < 1e-8;
    };
    // The exact ranges Pilot 01 authored whose midpoint is off-grid.
    const pilotRanges = [
      { min: 10, max: 25, step: 1 },
      { min: 1, max: 8, step: 1 },
      { min: 5, max: 20, step: 1 },
      { min: 2, max: 15, step: 1 },
      { min: 0, max: 15, step: 1 },
      { min: 15, max: 40, step: 1 },
    ];
    for (const slider of pilotRanges) {
      const seeded = seedClosestEstimate(slider);
      expect(onStep(seeded, slider), JSON.stringify(slider)).toBe(true);
      expect(seeded).toBeGreaterThanOrEqual(slider.min);
      expect(seeded).toBeLessThanOrEqual(slider.max);
    }
  });

  it("leaves an unstepped range on its exact midpoint", async () => {
    const { seedClosestEstimate } = await import(
      "@/features/live-game-session/components/closest-gameplay-panel"
    );
    expect(seedClosestEstimate({ min: 0, max: 1 })).toBe(0.5);
    // And a stepped range whose midpoint is already legal is left alone.
    expect(seedClosestEstimate({ min: 0, max: 100, step: 5 })).toBe(50);
    expect(seedClosestEstimate({ min: 150, max: 350, step: 5 })).toBe(250);
    expect(seedClosestEstimate({ min: 1900, max: 1960, step: 1 })).toBe(1930);
  });
});
