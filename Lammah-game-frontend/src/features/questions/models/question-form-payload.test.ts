import { describe, expect, it } from "vitest";

import type { BombQuestionItem } from "@/types";

import { buildQuestionPayload } from "./question-form-payload";
import { questionFormSchema } from "./question-form-schema";

describe("buildQuestionPayload", () => {
  it("uses the new hierarchy without legacy difficulty or point fields", () => {
    const data = questionFormSchema.parse({
      authoringType: "text",
      worldId: "6a67bdeaf3dd6b97e0208201",
      contentCategoryId: "6a67bdeaf3dd6b97e0208202",
      challengeTypeId: "6a67bdeaf3dd6b97e0208203",
      question: "من فاز بالبطولة؟",
      answer: "الفريق الأول",
      status: "draft",
      isFreeGameQuestion: false,
      audioKind: "custom",
    });

    const payload = buildQuestionPayload({
      data,
      acceptedAnswers: [],
      rankedEntries: [],
      bombItems: [],
    });

    expect(payload).toMatchObject({
      worldId: data.worldId,
      contentCategoryId: data.contentCategoryId,
      challengeTypeId: data.challengeTypeId,
    });
    expect(payload).not.toHaveProperty("categoryId");
    expect(payload).not.toHaveProperty("difficulty");
    expect(payload).not.toHaveProperty("points");
  });

  it("omits standard answer fields from Bomb question payloads", () => {
    const data = questionFormSchema.parse({
      authoringType: "bomb",
      categoryId: "6a67bdeaf3dd6b97e020820c",
      question: "ايش هذي الدولة ؟",
      answer: "",
      difficulty: "easy",
      points: "200",
      status: "approved",
      isFreeGameQuestion: true,
      audioKind: "custom",
    });
    const item: BombQuestionItem = {
      id: "9fa96653-57d4-4f36-a2cb-b5f01beb1079",
      order: 0,
      acceptedAnswers: ["اليابان"],
      image: {
        url: "/uploads/questions/bomb-items/japan.png",
        storageKey: "uploads/questions/bomb-items/japan.png",
        mimetype: "image/png",
        size: 932,
      },
    };

    const payload = buildQuestionPayload({
      data,
      acceptedAnswers: [],
      rankedEntries: [],
      bombItems: [item],
    });

    expect(payload).toMatchObject({
      questionType: "bomb_sequence",
      bombContent: { items: [item] },
    });
    expect(payload).not.toHaveProperty("answer");
    expect(payload).not.toHaveProperty("acceptedAnswers");
  });
});
