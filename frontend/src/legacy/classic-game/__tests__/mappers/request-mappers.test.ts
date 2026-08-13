import { describe, expect, it } from "vitest";
import {
  toLoginRequest,
  toRegisterRequest,
} from "@/features/auth/mappers/auth-request.mapper";
import { toCreateGameRequest } from "@/legacy/classic-game/mappers/game-request.mapper";
import { toGenerateReviewedRequest } from "@/features/ai-generation/mappers/ai-generation-request.mapper";
import { toMusicUploadRequest } from "@/features/music/mappers/music-request.mapper";
import {
  toCreateQuestionRequest,
  toUpdateQuestionRequest,
} from "@/features/questions/mappers/question-request.mapper";
import { toCategoryRequest } from "@/features/categories/mappers/category-request.mapper";
import type { Question } from "@/types";

describe("request mappers", () => {
  it("persists explicit category gameplay mode without inferring it from media", () => {
    const request = toCategoryRequest({
      name: "Top 10 صور",
      gameplayMode: "TOP_10",
      audioPolicy: "optional",
    });
    expect(JSON.parse(request.category)).toMatchObject({
      name: "Top 10 صور",
      gameplayMode: "TOP_10",
      audioPolicy: "optional",
    });
  });

  it("maps auth values exactly", () => {
    expect(
      toLoginRequest({ email: "a@example.invalid", password: "pw" }),
    ).toEqual({
      email: "a@example.invalid",
      password: "pw",
    });
    expect(
      toRegisterRequest({
        fullName: "Fixture User",
        email: "a@example.invalid",
        password: "pw",
      }),
    ).toEqual({
      fullName: "Fixture User",
      email: "a@example.invalid",
      password: "pw",
    });
  });

  it("preserves team and category ordering for game creation", () => {
    expect(
      toCreateGameRequest({
        name: "Game",
        teams: [
          { name: "A", members: [], color: "blue" },
          { name: "B", members: [], color: "red" },
        ],
        categoryIds: ["c2", "c1"],
      }),
    ).toEqual({
      name: "Game",
      teams: [
        { name: "A", members: [], color: "blue" },
        { name: "B", members: [], color: "red" },
      ],
      categoryIds: ["c2", "c1"],
    });
  });

  it("applies reviewed-generation defaults and omits empty names", () => {
    expect(toGenerateReviewedRequest({ categoryId: "category-1" })).toEqual({
      categoryId: "category-1",
      count: 2,
      difficulty: "medium",
      language: "ar",
      strategy: "source-curated",
      allowGeneratedFallback: false,
    });
  });

  it("maps synthetic music upload values to the generated body", () => {
    const file = new File([new Uint8Array([0, 1, 2])], "tone.wav", {
      type: "audio/wav",
    });
    expect(
      toMusicUploadRequest(file, {
        title: "Tone",
        artist: "Fixture",
        language: "ar",
        difficulty: "easy",
        snippetStartSecond: 1,
        snippetDurationSeconds: 5,
      }),
    ).toMatchObject({
      file,
      title: "Tone",
      artist: "Fixture",
      snippetStartSecond: 1,
      snippetDurationSeconds: 5,
    });
  });

  it("does not send client-owned rank or point values for Top 10 entries", () => {
    const request = toCreateQuestionRequest({
      rankedList: {
        displayName: { ar: "توب 10", en: "Top 10" },
        entries: [
          {
            id: "row-1",
            clientId: "client-1",
            rank: 99,
            answer: { ar: "الإجابة" },
            aliases: ["بديل"],
            points: 999,
          },
        ],
      },
    } as Partial<Question>);
    expect(request.rankedList?.entries[0]).toEqual({
      id: "row-1",
      clientId: "client-1",
      answer: { ar: "الإجابة" },
      aliases: ["بديل"],
    });
  });

  it("forwards world/content-scope/challenge-type classification for new questions", () => {
    const request = toCreateQuestionRequest({
      question: "سؤال جديد",
      worldId: "world-1",
      contentCategoryId: "scope-1",
      challengeTypeId: "challenge-1",
    } as Partial<Question>);

    expect(request).toMatchObject({
      worldId: "world-1",
      contentCategoryId: "scope-1",
      challengeTypeId: "challenge-1",
    });
  });

  it("keeps regular question updates content-only", () => {
    const request = toUpdateQuestionRequest({
      question: "سؤال محدّث",
      primaryAsset: {
        type: "image",
        url: "/uploads/questions/images/current.webp",
        source: "admin-upload",
      },
      mediaUrl: "/uploads/questions/images/current.webp",
      mediaKey: "current.webp",
      assetStatus: "READY",
      assetFailureReason: "stale",
    } as Partial<Question>);

    expect(request).toMatchObject({ question: "سؤال محدّث" });
    expect(request).not.toHaveProperty("primaryAsset");
    expect(request).not.toHaveProperty("mediaUrl");
    expect(request).not.toHaveProperty("mediaKey");
    expect(request).not.toHaveProperty("assetStatus");
    expect(request).not.toHaveProperty("assetFailureReason");
  });
});
