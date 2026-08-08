import { describe, expect, it } from "vitest";
import type {
  CategoryResponseDto,
  GameResponseDto,
  QuestionResponseDto,
} from "@/api/generated/models";
import { toQuestion } from "@/features/questions/mappers/question-response.mapper";
import { toGame } from "@/legacy/classic-game/mappers/game-response.mapper";

const category: CategoryResponseDto = {
  _id: "category-1",
  name: "اختبار",
  slug: "test",
  isActive: true,
  audioPolicy: "optional",
  gameplayMode: "STANDARD",
  sortOrder: 0,
};

const question: QuestionResponseDto = {
  _id: "question-1",
  questionType: "standard",
  category: "category-1",
  question: "سؤال اختباري؟",
  correctAnswer: "إجابة",
  wrongAnswers: [],
  difficulty: "easy",
  points: 200,
  status: "approved",
  source: "manual",
  requiresAudio: false,
  audioStatus: "not_required",
  primaryAsset: {
    type: "image",
    url: "/uploads/test.png",
    source: "fixture",
  },
  metadata: { extensible: { retained: true } },
};

describe("Question and Game response mappers", () => {
  it("maps nullable assets, empty answers, and flexible metadata", () => {
    expect(toQuestion(question)).toMatchObject({
      id: "question-1",
      categoryId: "category-1",
      wrongAnswers: [],
      primaryAsset: { url: expect.stringContaining("/uploads/test.png") },
      metadata: { extensible: { retained: true } },
    });
  });

  it("carries world/content-scope/challenge-type ids through from the API response", () => {
    const taxonomyQuestion = {
      ...question,
      worldId: "world-1",
      contentCategoryId: "scope-1",
      challengeTypeId: "challenge-1",
    } as QuestionResponseDto;

    expect(toQuestion(taxonomyQuestion)).toMatchObject({
      worldId: "world-1",
      contentCategoryId: "scope-1",
      challengeTypeId: "challenge-1",
    });
  });

  it("maps category boards and authoritative turn/answered fields", () => {
    const game: GameResponseDto = {
      _id: "game-1",
      name: "Fixture game",
      status: "active",
      teams: [
        {
          _id: "team-a",
          name: "أ",
          members: [],
          score: 200,
          color: "blue",
        },
        {
          _id: "team-b",
          name: "ب",
          members: [],
          score: 0,
          color: "red",
        },
      ],
      selectedCategories: [category],
      board: [
        {
          category,
          questions: [
            {
              _id: "board-1",
              question,
              points: 200,
              isAnswered: true,
              isAnswerRevealed: true,
            },
          ],
        },
      ],
      currentTurnTeamIndex: 1,
    };
    expect(toGame(game)).toMatchObject({
      id: "game-1",
      currentTeamIndex: 1,
      currentTeamTurn: "B",
      categories: [{ id: "category-1" }],
      board: [[{ id: "board-1", points: 200, answered: true }]],
    });
  });
});
