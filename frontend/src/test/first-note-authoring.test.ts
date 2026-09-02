import { describe, expect, it } from "vitest";
import {
  buildContentItemPayload,
  emptyContentItemForm,
  findLocalFormProblems,
  hasFirstNoteMechanic,
  toContentItemForm,
} from "@/features/world-management/services/content-item-form.service";
import type { ContentItem } from "@/features/world-management/types";

const complete = () => {
  const values = emptyContentItemForm("scope-music");
  values.compatibleChallengeTypeIds = ["ct-first-note"];
  values.firstNote = {
    enabled: true,
    title: "الأماكن",
    clue: "أغنية خليجية من التسعينات",
    clueLabel: "الحقبة",
    audioUrl: "https://cdn/song.mp3",
  };
  values.answer.mode = "match";
  values.answer.acceptedAnswers = "الاماكن\nal amaken";
  return values;
};
describe("First Note authoring", () => {
  it("selects only the canonical slug", () => {
    expect(
      hasFirstNoteMechanic([{ challengeType: { slug: "first-note" } }]),
    ).toBe(true);
    expect(
      hasFirstNoteMechanic([{ challengeType: { slug: "one-clue" } }]),
    ).toBe(false);
  });
  it("builds one clue, canonical audio, title, and accepted answers", () => {
    const values = complete();
    expect(findLocalFormProblems(values)).toEqual([]);
    expect(buildContentItemPayload(values)).toMatchObject({
      media: { type: "audio", assets: [{ url: "https://cdn/song.mp3" }] },
      mechanicPayload: {
        variant: "first-note",
        contextualClue: { ar: "أغنية خليجية من التسعينات" },
        clueLabel: { ar: "الحقبة" },
      },
      answerPayload: {
        mode: "match",
        acceptedAnswers: ["الأماكن", "الاماكن", "al amaken"],
      },
    });
  });
  it("rejects missing clue, title, and audio", () => {
    const values = complete();
    values.firstNote = {
      ...values.firstNote,
      title: "",
      clue: "",
      audioUrl: "",
    };
    expect(findLocalFormProblems(values)).toEqual(
      expect.arrayContaining([
        "اسم الأغنية مطلوب.",
        "الدليل السياقي مطلوب.",
        "مقطع الصوت مطلوب.",
      ]),
    );
  });
  it("hydrates edit state without exposing the canonical title as an extra answer", () => {
    const payload = buildContentItemPayload(complete());
    const item = { id: "i", worldId: "music", ...payload } as ContentItem;
    const form = toContentItemForm(item);
    expect(form.firstNote).toMatchObject({
      enabled: true,
      title: "الأماكن",
      clue: "أغنية خليجية من التسعينات",
      audioUrl: "https://cdn/song.mp3",
    });
    expect(form.answer.acceptedAnswers).toBe("الاماكن\nal amaken");
  });
});
