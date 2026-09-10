import { describe, expect, it } from "vitest";
import {
  buildContentItemPayload,
  emptyContentItemForm,
  findLocalFormProblems,
  hasEkshifniMechanic,
  toContentItemForm,
  EKSHIFNI_REGION_ROLES,
} from "@/features/world-management/services/content-item-form.service";
import type { ContentItem } from "@/features/world-management/types";

/**
 * Authoring one اكشفني celebrity.
 *
 * The Admin runs the same structural contract the launcher does, so the failure
 * this file is really about is the one where a producer publishes on Thursday
 * and the room finds out on Friday that the item will not start.
 */

const complete = () => {
  const values = emptyContentItemForm("scope-celebrities");
  values.compatibleChallengeTypeIds = ["ct-ekshifni"];
  values.mediaType = "image";
  values.mediaUrls = ["https://cdn/fairuz.webp"];
  values.answer.mode = "match";
  values.answer.acceptedAnswers = "Fairuz";
  values.ekshifni = {
    enabled: true,
    targetAnswer: "فيروز",
    regions: EKSHIFNI_REGION_ROLES.map((role, index) => ({
      localId: `region-${index + 1}`,
      role,
      x: String(index * 0.15),
      y: "0.1",
      width: "0.12",
      height: "0.2",
    })),
  };
  return values;
};

describe("اكشفني authoring", () => {
  it("is selected only by the canonical mechanic slug", () => {
    expect(hasEkshifniMechanic([{ challengeType: { slug: "ekshifni" } }])).toBe(
      true,
    );
    expect(hasEkshifniMechanic([{ challengeType: { slug: "laqatha" } }])).toBe(
      false,
    );
  });

  it("builds six regions in image fractions, with a MATCH answer", () => {
    const values = complete();
    expect(findLocalFormProblems(values)).toEqual([]);
    const payload = buildContentItemPayload(values);
    // The celebrity's name is the first accepted answer; there is no second
    // source of truth for what is correct.
    expect(payload.answerPayload).toEqual({
      mode: "match",
      acceptedAnswers: ["فيروز", "Fairuz"],
    });
    expect(payload.mechanicPayload).toMatchObject({ variant: "ekshifni" });
    const regions = (
      payload.mechanicPayload as { regions: Array<Record<string, unknown>> }
    ).regions;
    expect(regions).toHaveLength(6);
    expect(regions[0]).toEqual({
      localId: "region-1",
      role: "eyes",
      shape: { x: 0, y: 0.1, width: 0.12, height: 0.2 },
    });
    // The picture rides the item's ordinary media, not a second pipeline.
    expect(payload.media).toEqual({
      type: "image",
      assets: [{ url: "https://cdn/fairuz.webp" }],
    });
  });

  it.each([
    [
      "no celebrity name",
      (values: ReturnType<typeof complete>) => {
        values.ekshifni.targetAnswer = "";
      },
      "اسم المشهور مطلوب.",
    ],
    [
      "no picture",
      (values: ReturnType<typeof complete>) => {
        values.mediaType = "none";
        values.mediaUrls = [];
      },
      "اكشفني يحتاج صورة واحدة للمشهور.",
    ],
    [
      "five regions",
      (values: ReturnType<typeof complete>) => {
        values.ekshifni.regions.pop();
      },
      "اكشفني يحتاج ستة أجزاء بالضبط.",
    ],
    [
      "duplicate region ids",
      (values: ReturnType<typeof complete>) => {
        values.ekshifni.regions[1].localId = "region-1";
      },
      "معرفات الأجزاء يجب أن تكون موجودة وفريدة.",
    ],
    [
      "the same role twice",
      (values: ReturnType<typeof complete>) => {
        values.ekshifni.regions[1].role = values.ekshifni.regions[0].role;
      },
      "لا تكرر نوع الجزء أكثر من مرة في نفس الصورة.",
    ],
    [
      "geometry in screen pixels",
      (values: ReturnType<typeof complete>) => {
        values.ekshifni.regions[0] = {
          ...values.ekshifni.regions[0],
          x: "240",
          y: "120",
          width: "80",
          height: "90",
        };
      },
      "أبعاد الأجزاء تكون نسبة من الصورة بين 0 و 1، وداخل حدود الصورة.",
    ],
    [
      "a box that spills off the picture",
      (values: ReturnType<typeof complete>) => {
        values.ekshifni.regions[0] = {
          ...values.ekshifni.regions[0],
          x: "0.9",
          width: "0.5",
        };
      },
      "أبعاد الأجزاء تكون نسبة من الصورة بين 0 و 1، وداخل حدود الصورة.",
    ],
  ])("refuses to save with %s", (_label, mutate, problem) => {
    const values = complete();
    mutate(values);
    expect(findLocalFormProblems(values)).toContain(problem);
  });

  it("reads a saved item back into the same form, region for region", () => {
    const payload = buildContentItemPayload(complete());
    const restored = toContentItemForm({
      id: "item-1",
      scopeId: "scope-celebrities",
      prompt: payload.prompt,
      media: payload.media,
      answerPayload: payload.answerPayload,
      mechanicPayload: payload.mechanicPayload,
      compatibleChallengeTypeIds: ["ct-ekshifni"],
    } as unknown as ContentItem);
    expect(restored.ekshifni.enabled).toBe(true);
    expect(restored.ekshifni.targetAnswer).toBe("فيروز");
    expect(restored.ekshifni.regions[0]).toEqual({
      localId: "region-1",
      role: "eyes",
      x: "0",
      y: "0.1",
      width: "0.12",
      height: "0.2",
    });
  });

  it("stops emitting the payload once the mechanic is deselected", () => {
    const values = complete();
    values.ekshifni.enabled = false;
    expect(buildContentItemPayload(values).mechanicPayload).toBeUndefined();
  });
});
