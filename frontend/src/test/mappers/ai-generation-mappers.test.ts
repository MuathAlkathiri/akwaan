import { describe, expect, it } from "vitest";
import type { GenerateReviewedQuestionsResponseDto } from "@/api/generated/models";
import {
  toReviewedGenerationResult,
  toReviewedDraft,
} from "@/features/ai-generation/mappers/ai-generation-response.mapper";

const response: GenerateReviewedQuestionsResponseDto = {
  statusCode: 201,
  message: "generated",
  count: 1,
  meta: { safeFlag: true, prompt: "must not escape" },
  data: {
    questions: [
      {
        question: "من؟",
        correctAnswer: "شخص",
        wrongAnswers: [],
        difficulty: "medium",
        gameMode: "identifyCharacter",
        type: "image",
        assetRequest: { type: "image", entity: "Fixture" },
        assetStatus: "FAILED",
        asset: null,
        primaryAssetRequest: { type: "image", entity: "Fixture" },
        primaryAssetStatus: "FAILED",
        primaryAsset: null,
        coverImageRequest: null,
        coverImageStatus: "FAILED",
        coverImage: null,
        assetFailureDiagnostics: {
          attemptedQueries: ["Fixture"],
          localPath: "/Users/test/private.png",
          nested: { command: "ffmpeg -i private.wav" },
        },
        explanation: "شرح",
        qualityScore: 8,
        issues: [],
        aiMetadata: { safe: true, apiKey: "secret" },
      },
    ],
  },
};

describe("AI Generation response mapper", () => {
  it("normalizes nullable assets and sanitizes diagnostics", () => {
    const draft = toReviewedDraft(response.data.questions[0]);
    expect(draft.asset).toBeNull();
    expect(draft.wrongAnswers).toEqual([]);
    expect(draft.assetFailureDiagnostics).toEqual({
      attemptedQueries: ["Fixture"],
      nested: {},
    });
    expect(draft.aiMetadata).toEqual({ safe: true });
  });

  it("preserves safe flexible generation metadata", () => {
    const result = toReviewedGenerationResult(response);
    expect(result.meta).toEqual({ safeFlag: true });
    expect(result.data.questions).toHaveLength(1);
  });
});
