"use client";

import type { AxiosError } from "axios";
import { useQueryClient } from "@tanstack/react-query";
import {
  useAiGenerateReviewed,
  useAiSaveReviewedDrafts,
} from "@/api/generated/admin-ai-generator/admin-ai-generator";
import type {
  ErrorResponseDto,
  GenerateReviewedQuestionsErrorResponseDto,
} from "@/api/generated/models";
import {
  questionKeys,
  useAiGeneratedQuestions,
  useBulkQuestionAction,
  useRetryQuestionAsset as useQuestionAssetRetry,
} from "@/features/questions";
import {
  toGenerateReviewedRequest,
  toSaveReviewedDraftsRequest,
} from "../mappers/ai-generation-request.mapper";
import {
  toReviewedGenerationResult,
  toSavedQuestion,
} from "../mappers/ai-generation-response.mapper";
import type {
  GenerateReviewedInput,
  ReviewedQuestionDraft,
} from "../types/ai-generation.types";

type GenerateReviewedApiError =
  AxiosError<GenerateReviewedQuestionsErrorResponseDto>;
type AiGenerationApiError = AxiosError<ErrorResponseDto>;

export const aiGenerationKeys = {
  all: ["ai-generation"] as const,
  reviewed: (filters: Record<string, string>) =>
    [...aiGenerationKeys.all, "reviewed", filters] as const,
};

const longRunningRequest = { timeout: 0 };

export function useGenerateReviewedQuestions() {
  const mutation = useAiGenerateReviewed<GenerateReviewedApiError>({
    mutation: { retry: false },
    request: longRunningRequest,
  });
  return {
    ...mutation,
    mutateAsync: (input: GenerateReviewedInput) =>
      mutation
        .mutateAsync({ data: toGenerateReviewedRequest(input) })
        .then(toReviewedGenerationResult),
  };
}

export function useSaveReviewedDrafts() {
  const client = useQueryClient();
  const mutation = useAiSaveReviewedDrafts<AiGenerationApiError>({
    mutation: {
      retry: false,
      onSuccess: (response) => {
        client.invalidateQueries({ queryKey: questionKeys.all });
        client.invalidateQueries({ queryKey: aiGenerationKeys.all });
        for (const dto of response.savedQuestions) {
          const question = toSavedQuestion(dto);
          client.setQueryData(questionKeys.detail(question.id), question);
        }
      },
    },
  });
  return {
    ...mutation,
    mutateAsync: ({
      drafts,
      categoryId,
      catalogId,
    }: {
      drafts: ReviewedQuestionDraft[];
      categoryId: string;
      catalogId?: string;
    }) =>
      mutation.mutateAsync({
        data: toSaveReviewedDraftsRequest(drafts, categoryId, catalogId),
      }),
  };
}

export function useAiGenerated(filters: Record<string, string>) {
  return useAiGeneratedQuestions(filters);
}
export function useAiBulkAction() {
  return useBulkQuestionAction();
}
export function useRetryQuestionAsset() {
  return useQuestionAssetRetry();
}
