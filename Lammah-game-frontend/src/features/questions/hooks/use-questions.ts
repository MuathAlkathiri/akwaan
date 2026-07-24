"use client";

import type { AxiosError } from "axios";
import { useQueryClient } from "@tanstack/react-query";
import {
  questionsCreate,
  useQuestionsCreate,
  useQuestionsDelete,
  useQuestionsUpdate,
} from "@/api/generated/questions/questions";
import {
  useAdminQuestionsGetById,
  useAdminQuestionsList,
  useQuestionsBulkAction,
  useQuestionsListAiGenerated,
  useQuestionsRetryCoverImage,
  useQuestionsRetryPrimaryAsset,
  useQuestionsRetryAudio,
  useQuestionsApproveAudio,
  useQuestionsRejectAudio,
  useQuestionsUpdateAudioRequest,
  useQuestionsUploadAudio,
  useQuestionsListAudioCandidates,
  useQuestionsSelectAudioCandidate,
  useQuestionsPreviewMediaClip,
  useQuestionsRemoveAudioAsset,
  useQuestionsGenerateAcceptedAnswers,
  useQuestionsGenerateRankedAcceptedAnswers,
  useQuestionsUploadImage,
  useQuestionsRemoveImage,
} from "@/api/generated/admin-questions/admin-questions";
import type {
  ErrorResponseDto,
  QuestionsCreateBodyOne,
} from "@/api/generated/models";
import type { Question } from "@/types";
import {
  toQuestionFilters,
  type QuestionFilterState,
} from "../mappers/question-filter.mapper";
import {
  toCreateQuestionRequest,
  toUpdateQuestionRequest,
} from "../mappers/question-request.mapper";
import { toQuestion, toQuestions } from "../mappers/question-response.mapper";

type QuestionApiError = AxiosError<ErrorResponseDto>;
const MEDIA_DETAIL_POLLING_STATUSES = new Set([
  "pending",
  "searching",
  "processing",
]);
const MEDIA_CANDIDATE_POLLING_STATUSES = new Set([
  "searching",
  "processing",
]);

export const mediaDetailRefetchInterval = (response?: {
  data?: { audioStatus?: string };
}) =>
  MEDIA_DETAIL_POLLING_STATUSES.has(response?.data?.audioStatus ?? "")
    ? 1_000
    : false;

export const mediaCandidatesRefetchInterval = (
  enabled: boolean,
  audioStatus?: string,
) =>
  enabled && MEDIA_CANDIDATE_POLLING_STATUSES.has(audioStatus ?? "")
    ? 2_000
    : false;

export const questionKeys = {
  all: ["questions"] as const,
  detail: (id: string) => ["questions", id] as const,
  aiGenerated: (filters: QuestionFilterState) =>
    ["ai-generation", "reviewed", filters] as const,
};

const useInvalidateQuestions = () => {
  const client = useQueryClient();
  return (id?: string) => {
    client.invalidateQueries({ queryKey: questionKeys.all });
    client.invalidateQueries({ queryKey: ["ai-generation"] });
    if (id) {
      client.invalidateQueries({ queryKey: questionKeys.detail(id) });
      client.invalidateQueries({
        queryKey: [`/admin/questions/${id}/audio/candidates`],
      });
    }
  };
};

export const useQuestions = () =>
  useAdminQuestionsList({
    query: { queryKey: questionKeys.all, select: (r) => toQuestions(r.data) },
  });
export const useQuestion = (id: string) =>
  useAdminQuestionsGetById(id, {
    query: {
      queryKey: questionKeys.detail(id),
      enabled: Boolean(id),
      select: (r) => toQuestion(r.data),
      refetchInterval: (query) => {
        const response = query.state.data as
          | { data?: { audioStatus?: string } }
          | undefined;
        return mediaDetailRefetchInterval(response);
      },
    },
  });
export const useAiGeneratedQuestions = (filters: QuestionFilterState) =>
  useQuestionsListAiGenerated(toQuestionFilters(filters), {
    query: {
      queryKey: questionKeys.aiGenerated(filters),
      select: (r) => toQuestions(r.data),
    },
  });

export function useCreateQuestion() {
  const invalidate = useInvalidateQuestions();
  const mutation = useQuestionsCreate<QuestionApiError>({
    mutation: { onSuccess: () => invalidate() },
  });
  return {
    ...mutation,
    mutateAsync: async (data: Partial<Question>, image?: File | null) => {
      if (!image) {
        return mutation
          .mutateAsync({ data: toCreateQuestionRequest(data) })
          .then((r) => toQuestion(r.data));
      }
      const formData = new FormData();
      formData.append(
        "question",
        JSON.stringify(toCreateQuestionRequest(data)),
      );
      formData.append("image", image);
      const response = await questionsCreate(
        formData as unknown as QuestionsCreateBodyOne,
      );
      invalidate();
      return toQuestion(response.data);
    },
  };
}
export function usePatchQuestion() {
  const invalidate = useInvalidateQuestions();
  const mutation = useQuestionsUpdate<QuestionApiError>({
    mutation: { onSuccess: (_, variables) => invalidate(variables.id) },
  });
  return {
    ...mutation,
    mutate: (
      input: { id: string; data: Partial<Question> },
      options?: Parameters<typeof mutation.mutate>[1],
    ) =>
      mutation.mutate(
        { id: input.id, data: toUpdateQuestionRequest(input.data) },
        options,
      ),
    mutateAsync: async (input: {
      id: string;
      data: Partial<Question>;
    }) =>
      mutation
        .mutateAsync({
          id: input.id,
          data: toUpdateQuestionRequest(input.data),
        })
        .then((r) => toQuestion(r.data)),
  };
}

export function useQuestionImageActions() {
  const invalidate = useInvalidateQuestions();
  const upload = useQuestionsUploadImage<QuestionApiError>({
    mutation: {
      onSuccess: (_, variables) => invalidate(variables.id),
    },
  });
  const remove = useQuestionsRemoveImage<QuestionApiError>({
    mutation: {
      onSuccess: (_, variables) => invalidate(variables.id),
    },
  });
  return {
    upload: async (input: { id: string; file: File }) =>
      upload
        .mutateAsync({ id: input.id, data: { file: input.file } })
        .then((response) => toQuestion(response.data)),
    remove: async (id: string) =>
      remove.mutateAsync({ id }).then((response) => toQuestion(response.data)),
    isUploading: upload.isPending,
    isRemoving: remove.isPending,
    error: upload.error ?? remove.error,
  };
}
export function useUpdateQuestion(id: string) {
  const patch = usePatchQuestion();
  return {
    ...patch,
    mutateAsync: (data: Partial<Question>) => patch.mutateAsync({ id, data }),
  };
}

export const useGenerateAcceptedAnswers = () =>
  useQuestionsGenerateAcceptedAnswers<QuestionApiError>();

export const useGenerateRankedAcceptedAnswers = () =>
  useQuestionsGenerateRankedAcceptedAnswers<QuestionApiError>();
export function useUpdateQuestionStatus() {
  const patch = usePatchQuestion();
  return {
    ...patch,
    mutate: (
      input: { id: string; status: Question["status"] },
      options?: Parameters<typeof patch.mutate>[1],
    ) =>
      patch.mutate({ id: input.id, data: { status: input.status } }, options),
    mutateAsync: (input: { id: string; status: Question["status"] }) =>
      patch.mutateAsync({ id: input.id, data: { status: input.status } }),
  };
}
export function useDeleteQuestion() {
  const invalidate = useInvalidateQuestions();
  const mutation = useQuestionsDelete<QuestionApiError>({
    mutation: { onSuccess: () => invalidate() },
  });
  return {
    ...mutation,
    mutate: (id: string, options?: Parameters<typeof mutation.mutate>[1]) =>
      mutation.mutate({ id }, options),
    mutateAsync: (id: string) => mutation.mutateAsync({ id }),
  };
}
export function useBulkQuestionAction() {
  const invalidate = useInvalidateQuestions();
  const mutation = useQuestionsBulkAction<QuestionApiError>({
    mutation: { onSuccess: () => invalidate() },
  });
  return {
    ...mutation,
    mutate: (
      data: { ids: string[]; action: "approve" | "reject" | "delete" },
      options?: Parameters<typeof mutation.mutate>[1],
    ) => mutation.mutate({ data }, options),
    mutateAsync: (data: {
      ids: string[];
      action: "approve" | "reject" | "delete";
    }) => mutation.mutateAsync({ data }),
  };
}
export function useRetryQuestionAsset() {
  const invalidate = useInvalidateQuestions();
  const primary = useQuestionsRetryPrimaryAsset<QuestionApiError>({
    mutation: { onSuccess: (_, variables) => invalidate(variables.id) },
  });
  const cover = useQuestionsRetryCoverImage<QuestionApiError>({
    mutation: { onSuccess: (_, variables) => invalidate(variables.id) },
  });
  return {
    isPending: primary.isPending || cover.isPending,
    mutate: (
      input: { id: string; target: "primary" | "cover" },
      options?: { onSuccess?: (question: Question) => void },
    ) => {
      const selected = input.target === "primary" ? primary : cover;
      selected.mutate(
        { id: input.id },
        { onSuccess: (r) => options?.onSuccess?.(toQuestion(r.data)) },
      );
    },
    mutateAsync: async (input: { id: string; target: "primary" | "cover" }) =>
      toQuestion(
        (
          await (input.target === "primary"
            ? primary.mutateAsync({ id: input.id })
            : cover.mutateAsync({ id: input.id }))
        ).data,
      ),
  };
}

export function useQuestionAudioActions() {
  const invalidate = useInvalidateQuestions();
  const options = {
    mutation: {
      onSuccess: (_data: unknown, variables: { id: string }) =>
        invalidate(variables.id),
    },
  };
  const retry = useQuestionsRetryAudio<QuestionApiError>(options);
  const approve = useQuestionsApproveAudio<QuestionApiError>(options);
  const reject = useQuestionsRejectAudio<QuestionApiError>(options);
  const updateRequest = useQuestionsUpdateAudioRequest<QuestionApiError>({
    mutation: { onSuccess: (_, variables) => invalidate(variables.id) },
  });
  const upload = useQuestionsUploadAudio<QuestionApiError>({
    mutation: { onSuccess: (_, variables) => invalidate(variables.id) },
  });
  const selectCandidate = useQuestionsSelectAudioCandidate<QuestionApiError>({
    mutation: { onSuccess: (_, variables) => invalidate(variables.id) },
  });
  const preview = useQuestionsPreviewMediaClip<QuestionApiError>({
    mutation: { onSuccess: (_, variables) => invalidate(variables.id) },
  });
  const remove = useQuestionsRemoveAudioAsset<QuestionApiError>({
    mutation: { onSuccess: (_, variables) => invalidate(variables.id) },
  });
  return {
    isPending:
      retry.isPending ||
      approve.isPending ||
      reject.isPending ||
      updateRequest.isPending ||
      upload.isPending ||
      selectCandidate.isPending ||
      preview.isPending ||
      remove.isPending,
    retry: (id: string, mode: "research" | "retryProcessing") =>
      retry.mutate({ id, data: { mode } }),
    approve: (id: string) => approve.mutate({ id }),
    reject: (id: string) => reject.mutate({ id }),
    updateRequest: updateRequest.mutateAsync,
    preview: preview.mutateAsync,
    upload: (id: string, audio: File) => upload.mutate({ id, data: { audio } }),
    remove: (id: string) => remove.mutate({ id }),
    selectCandidate: (id: string, candidateId: string) =>
      selectCandidate.mutate({ id, candidateId }),
  };
}

export function useQuestionAudioCandidates(
  id: string,
  enabled: boolean,
  audioStatus?: string,
) {
  return useQuestionsListAudioCandidates(id, {
    query: {
      enabled: Boolean(id && enabled),
      refetchInterval: mediaCandidatesRefetchInterval(enabled, audioStatus),
      select: (response) => response.data,
    },
  });
}
