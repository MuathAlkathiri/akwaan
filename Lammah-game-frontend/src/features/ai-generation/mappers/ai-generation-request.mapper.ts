import type {
  GenerateReviewedQuestionsDto,
  SaveReviewedDraftsDto,
} from "@/api/generated/models";
import type {
  GenerateReviewedInput,
  ReviewedQuestionDraft,
} from "../types/ai-generation.types";
import { AI_GENERATION_DEFAULTS } from "../models/ai-generation-form";

export function toGenerateReviewedRequest(
  input: GenerateReviewedInput,
): GenerateReviewedQuestionsDto {
  return {
    ...(input.categoryId ? { categoryId: input.categoryId } : {}),
    ...(input.catalogName?.trim()
      ? { catalogName: input.catalogName.trim() }
      : {}),
    ...(input.categoryName?.trim()
      ? { categoryName: input.categoryName.trim() }
      : {}),
    count: input.count ?? AI_GENERATION_DEFAULTS.count,
    difficulty: input.difficulty ?? AI_GENERATION_DEFAULTS.difficulty,
    language: input.language ?? "ar",
    strategy: input.strategy ?? "source-curated",
    ...(input.sourceIds?.length ? { sourceIds: input.sourceIds } : {}),
    allowGeneratedFallback: false,
  };
}

export function toSaveReviewedDraftsRequest(
  drafts: ReviewedQuestionDraft[],
  categoryId: string,
  catalogId?: string,
): SaveReviewedDraftsDto {
  return {
    categoryId,
    ...(catalogId ? { catalogId } : {}),
    drafts: drafts.map((draft) => ({ ...draft })),
  };
}
