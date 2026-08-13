import type { QuestionsListAiGeneratedParams } from "@/api/generated/models";

export type QuestionFilterState = Record<string, string>;

export const toQuestionFilters = (
  filters: QuestionFilterState,
): QuestionsListAiGeneratedParams => ({
  ...(filters.status?.trim() ? { status: filters.status } : {}),
  ...(filters.difficulty?.trim() ? { difficulty: filters.difficulty } : {}),
  ...(filters.gameMode?.trim() ? { gameMode: filters.gameMode } : {}),
  ...(filters.assetStatus?.trim() ? { assetStatus: filters.assetStatus } : {}),
  ...(filters.source?.trim() ? { source: filters.source } : {}),
  ...(filters.category?.trim() ? { category: filters.category } : {}),
  ...(filters.catalog?.trim() ? { catalog: filters.catalog } : {}),
  ...(filters.search?.trim() ? { search: filters.search } : {}),
});
