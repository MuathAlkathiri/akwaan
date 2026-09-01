import { describe, expect, it } from "vitest";
import {
  buildContentItemPayload,
  emptyContentItemForm,
  findLocalFormProblems,
  hasLaqathaMechanic,
  toContentItemForm,
} from "@/features/world-management/services/content-item-form.service";
import type { ContentItem } from "@/features/world-management/types";

const complete = () => {
  const values = emptyContentItemForm("scope-movies");
  values.compatibleChallengeTypeIds = ["ct-laqatha"];
  values.answer.mode = "match";
  values.answer.acceptedAnswers = "the lion king";
  values.laqatha = {
    enabled: true,
    targetAnswer: "الأسد الملك",
    clues: [
      { modality: "text", text: "دليل صعب", mediaUrl: "" },
      { modality: "image", text: "", mediaUrl: "https://cdn/c2.webp" },
      { modality: "audio", text: "", mediaUrl: "https://cdn/c3.mp3" },
      { modality: "text", text: "دليل أسهل", mediaUrl: "" },
      { modality: "text", text: "الأوضح", mediaUrl: "" },
    ],
  };
  return values;
};

describe("القطها authoring", () => {
  it("is selected only by the canonical mechanic slug", () => {
    expect(hasLaqathaMechanic([{ challengeType: { slug: "laqatha" } }])).toBe(
      true,
    );
    expect(hasLaqathaMechanic([{ challengeType: { slug: "one-clue" } }])).toBe(
      false,
    );
  });

  it("builds a five-clue payload with per-clue modality and a MATCH answer", () => {
    const values = complete();
    expect(findLocalFormProblems(values)).toEqual([]);
    const payload = buildContentItemPayload(values);
    expect(payload.answerPayload).toEqual({
      mode: "match",
      acceptedAnswers: ["الأسد الملك", "the lion king"],
    });
    expect(payload.mechanicPayload).toMatchObject({
      variant: "laqatha",
      clues: expect.arrayContaining([
        expect.objectContaining({ order: 1, value: 5, text: { ar: "دليل صعب" } }),
        expect.objectContaining({
          order: 2,
          value: 4,
          media: { type: "image", assets: [{ url: "https://cdn/c2.webp" }] },
        }),
        expect.objectContaining({
          order: 3,
          value: 3,
          media: { type: "audio", assets: [{ url: "https://cdn/c3.mp3" }] },
        }),
      ]),
    });
  });

  it("rejects an incomplete clue", () => {
    const values = complete();
    values.laqatha.clues[2].mediaUrl = "";
    expect(findLocalFormProblems(values)).toContain(
      "اكتب الأدلة الخمسة كاملة (نص أو رابط وسائط).",
    );
  });

  it("hydrates an existing item for edit without misreading it as One Clue", () => {
    const saved = {
      id: "item-1",
      worldId: "movies",
      scopeId: "scope-movies",
      prompt: { ar: "خمّن الفيلم" },
      compatibleChallengeTypeIds: ["ct-laqatha"],
      answerPayload: {
        mode: "match",
        acceptedAnswers: ["الأسد الملك", "the lion king"],
      },
      mechanicPayload: buildContentItemPayload(complete()).mechanicPayload,
      isReusableAcrossSessions: false,
      status: "ready",
    } as ContentItem;
    const hydrated = toContentItemForm(saved);
    expect(hydrated.laqatha.enabled).toBe(true);
    expect(hydrated.oneClue.enabled).toBe(false);
    expect(hydrated.laqatha.targetAnswer).toBe("الأسد الملك");
    expect(hydrated.laqatha.clues[1].modality).toBe("image");
    expect(hydrated.laqatha.clues[2].mediaUrl).toBe("https://cdn/c3.mp3");
    // The extra accepted answer is separated back out from the canonical title.
    expect(hydrated.answer.acceptedAnswers).toBe("the lion king");
  });
});
