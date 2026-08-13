"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { useCategories } from "@/features/categories";
import { showToast } from "@/components/ui/toast";
import { getApiErrorMessage, getEntityId } from "@/lib/utils";
import type { BombQuestionItem, Question, RankedListEntry } from "@/types";

import {
  useCreateQuestion,
  usePatchQuestion,
  useQuestionAudioActions,
  useQuestionAudioCandidates,
  useQuestionImageActions,
  useBombItemImageUpload,
} from "./use-questions";

import {
  confirmUnsavedChanges,
  useUnsavedChangesWarning,
} from "./use-unsaved-changes-warning";

import {
  createDefaultRankedListEntries,
  getRankedListConflictRows,
  validateRankedListEntries,
} from "../models/ranked-list-form";

import {
  questionFormSchema,
  type QuestionFormData,
} from "../models/question-form-schema";

import {
  getQuestionAuthoringType,
  getQuestionFormDefaultValues,
  type QuestionFormInitialClassification,
} from "../models/question-form-defaults";

import { buildQuestionPayload } from "../models/question-form-payload";

import { mediaTimingPayload } from "../models/media-time";

import { mapQuestionAudioRequestToDto } from "../mappers/question-audio-request.mapper";

import { useQuestionAliasGeneration } from "./use-question-alias-generation";

const getCanonicalImageUrl = (question?: Question): string | undefined => {
  if (question?.primaryAsset?.type === "image") {
    return question.primaryAsset.url;
  }

  if (question?.effectivePresentationType === "image") {
    return question.resolvedMedia?.url;
  }

  return undefined;
};

export const mediaRequestFingerprint = (
  request?: Pick<
    NonNullable<Question["audioRequest"]>,
    | "kind"
    | "searchQuery"
    | "targetName"
    | "sourceTitle"
    | "language"
    | "preferredDurationSeconds"
    | "preferredStartSeconds"
    | "provider"
  > | null,
) =>
  JSON.stringify([
    request?.kind,
    request?.searchQuery.trim().replace(/\s+/g, " "),
    request?.targetName?.trim().replace(/\s+/g, " ") || null,
    request?.sourceTitle?.trim().replace(/\s+/g, " ") || null,
    request?.language?.trim().toLowerCase() || null,
    request?.preferredDurationSeconds ?? null,
    request?.preferredStartSeconds ?? null,
    request?.provider?.trim().toLowerCase() || null,
  ]);

interface UseQuestionFormParams {
  question?: Question;
  initialClassification?: QuestionFormInitialClassification;
  onSuccess?: (question: Question) => void;
  onCancel?: () => void;
}

export function useQuestionForm({
  question,
  initialClassification,
  onSuccess,
  onCancel,
}: UseQuestionFormParams) {
  const { data: categories = [] } = useCategories();

  const createQuestion = useCreateQuestion();
  const patchQuestion = usePatchQuestion();

  const imageActions = useQuestionImageActions();
  const bombImageUpload = useBombItemImageUpload();

  const audioActions = useQuestionAudioActions();

  const aliasGeneration = useQuestionAliasGeneration();

  const questionId = question ? getEntityId(question) : "";

  const [storedImageUrl, setStoredImageUrl] = useState<string | undefined>(
    getCanonicalImageUrl(question),
  );

  const [storedMediaUrl, setStoredMediaUrl] = useState<string | undefined>(
    question?.audioAsset?.url,
  );

  const [acceptedAnswers, setAcceptedAnswers] = useState<string[]>(
    question?.acceptedAnswers ?? [],
  );

  const [rankedEntries, setRankedEntries] = useState<RankedListEntry[]>(
    question?.rankedList?.entries ?? createDefaultRankedListEntries(),
  );
  const [bombItems, setBombItems] = useState<BombQuestionItem[]>(
    question?.bombContent?.items ?? [],
  );

  const [rowWarnings, setRowWarnings] = useState<Record<number, string[]>>({});

  const [localDirty, setLocalDirty] = useState(false);

  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,

    formState: { errors, isDirty },
  } = useForm<QuestionFormData>({
    resolver: zodResolver(questionFormSchema),

    defaultValues: getQuestionFormDefaultValues(question, initialClassification),
  });

  const values = watch();

  const isTop10 = values.authoringType === "top10";
  const isBomb = values.authoringType === "bomb";

  const isAudio = values.authoringType === "audio";

  const isVideo = values.authoringType === "video";

  const isImage = values.authoringType === "image";

  const isMedia = isAudio || isVideo;

  const selectedCategory = useMemo(
    () =>
      categories.find(
        (category) => getEntityId(category) === values.categoryId,
      ),
    [categories, values.categoryId],
  );

  const rankedListIssues = useMemo(
    () => validateRankedListEntries(rankedEntries),
    [rankedEntries],
  );

  const dirty = !saved && (isDirty || localDirty);

  useUnsavedChangesWarning(dirty);

  const audioCandidatesQuery = useQuestionAudioCandidates(
    questionId,

    Boolean(
      questionId &&
      ["audio", "video"].includes(getQuestionAuthoringType(question)),
    ),

    question?.audioStatus,
  );

  useEffect(() => {
    if (isTop10) {
      setValue("points", "600");
    }
  }, [isTop10, setValue]);

  useEffect(() => {
    if (selectedCategory?.gameplayMode === "BOMB") {
      setValue("authoringType", "bomb");
    } else if (
      selectedCategory?.gameplayMode &&
      values.authoringType === "bomb"
    ) {
      setValue("authoringType", "text");
    }
  }, [selectedCategory?.gameplayMode, setValue, values.authoringType]);

  useEffect(() => {
    setStoredImageUrl(getCanonicalImageUrl(question));
  }, [question, questionId]);

  useEffect(() => {
    setStoredMediaUrl(question?.audioAsset?.url);
  }, [question, questionId]);

  const updateAcceptedAnswers = (answers: string[]) => {
    setAcceptedAnswers(answers);
    setLocalDirty(true);
    setSaved(false);
  };

  const updateRankedEntries = (entries: RankedListEntry[]) => {
    setRankedEntries(entries);

    setRowWarnings(getRankedListConflictRows(entries));

    setLocalDirty(true);
    setSaved(false);
  };

  const updateBombItems = (items: BombQuestionItem[]) => {
    setBombItems(items.map((item, order) => ({ ...item, order })));
    setLocalDirty(true);
    setSaved(false);
  };

  const generateStandardAliases = async () => {
    if (!values.question.trim() || !values.answer?.trim()) {
      return;
    }

    const next = await aliasGeneration.generateStandard({
      question: values.question,
      answer: values.answer,
      categoryId: values.categoryId || undefined,
      currentAliases: acceptedAnswers,
    });

    updateAcceptedAnswers(next);
  };

  const generateRankedAliases = async () => {
    if (
      !values.question.trim() ||
      rankedEntries.some((entry) => !entry.answer.ar.trim())
    ) {
      return;
    }

    const result = await aliasGeneration.generateRanked({
      question: values.question,
      categoryId: values.categoryId || undefined,
      entries: rankedEntries,
    });

    setRankedEntries(result.entries);

    setRowWarnings({
      ...getRankedListConflictRows(result.entries),
      ...result.warnings,
    });

    setLocalDirty(true);
    setSaved(false);
  };

  const submit = async (data: QuestionFormData, forcedStatus?: "draft") => {
    try {
      const conflicts = getRankedListConflictRows(rankedEntries);

      setRowWarnings(conflicts);

      if (isTop10 && rankedListIssues.length) {
        showToast({
          type: "error",
          message: rankedListIssues[0],
        });

        return;
      }
      if (
        isBomb &&
        (bombItems.length < 10 ||
          bombItems.length > 15 ||
          bombItems.some(
            (item) =>
              !item.image ||
              item.acceptedAnswers.length < 1 ||
              new Set(
                item.acceptedAnswers.map((answer) =>
                  answer.trim().replace(/\s+/g, " ").toLocaleLowerCase(),
                ),
              ).size !== item.acceptedAnswers.length,
          ))
      ) {
        showToast({
          type: "error",
          message:
            "أسئلة القنبلة تحتاج 10–15 عناصر، ولكل عنصر صورة وإجابة فريدة واحدة على الأقل.",
        });
        return;
      }

      const payload = buildQuestionPayload({
        data,
        question,
        acceptedAnswers,
        rankedEntries,
        bombItems,
        forcedStatus,
      });

      const updated = question
        ? await patchQuestion.mutateAsync({
            id: getEntityId(question),
            data: payload,
          })
        : await createQuestion.mutateAsync(payload);

      const nextAudioRequest = payload.audioRequest;

      if (
        question &&
        isMedia &&
        nextAudioRequest &&
        mediaRequestFingerprint(nextAudioRequest) !==
          mediaRequestFingerprint(question.audioRequest)
      ) {
        await audioActions.updateRequest({
          id: getEntityId(question),
          data: {
            audioRequest: mapQuestionAudioRequestToDto(nextAudioRequest),
          },
        });
      }

      setSaved(true);
      setLocalDirty(false);

      showToast({
        type: "success",

        message: question ? "تم تحديث السؤال." : "تم إنشاء السؤال.",
      });

      onSuccess?.(updated);
    } catch (error) {
      const response = (
        error as {
          response?: {
            data?: {
              conflicts?: Array<{
                entryIndex?: number;
                conflictingEntryIndex?: number;
                conflictingValue?: string;
              }>;
            };
          };
        }
      ).response?.data;

      if (response?.conflicts) {
        const warnings: Record<number, string[]> = {};

        response.conflicts.forEach((conflict) => {
          if (conflict.entryIndex === undefined) {
            return;
          }

          const message = `تعارض في "${
            conflict.conflictingValue ?? "القيمة"
          }" مع المرتبة ${(conflict.conflictingEntryIndex ?? 0) + 1}.`;

          for (const index of [
            conflict.entryIndex,
            conflict.conflictingEntryIndex,
          ]) {
            if (index === undefined) {
              continue;
            }

            warnings[index] = [...(warnings[index] ?? []), message];
          }
        });

        setRowWarnings(warnings);
      }

      showToast({
        type: "error",

        message: getApiErrorMessage(error, "تعذر حفظ السؤال."),
      });
    }
  };

  const saveDraft = (data: QuestionFormData) => submit(data, "draft");

  const cancel = () => {
    if (confirmUnsavedChanges(dirty)) {
      onCancel?.();
    }
  };

  const previewCurrentClip = async () => {
    if (!questionId) return;

    try {
      const timing = mediaTimingPayload(values);

      await audioActions.preview({
        id: questionId,

        data: {
          startTimeSeconds: timing.preferredStartSeconds,

          durationSeconds: timing.preferredDurationSeconds,
        },
      });

      showToast({
        type: "success",

        message: "يتم الآن إنشاء معاينة بالتوقيت الحالي.",
      });
    } catch (error) {
      showToast({
        type: "error",

        message: getApiErrorMessage(error, "تعذر إنشاء معاينة المقطع."),
      });
    }
  };

  const uploadImage = async (file: File) => {
    const updated = await imageActions.upload({
      id: questionId,
      file,
    });

    setStoredImageUrl(getCanonicalImageUrl(updated));

    return updated;
  };

  const removeImage = async () => {
    await imageActions.remove(questionId);

    setStoredImageUrl(undefined);
  };

  const uploadMediaFile = async (file: File) => {
    const updated = await audioActions.upload(questionId, file);

    setStoredMediaUrl(updated.audioAsset?.url);

    return updated;
  };

  const removeMediaFile = async () => {
    await audioActions.remove(questionId);

    setStoredMediaUrl(undefined);
  };

  const candidates =
    audioCandidatesQuery.data ?? question?.audioCandidates ?? [];

  const pending =
    createQuestion.isPending ||
    patchQuestion.isPending ||
    audioActions.isPending ||
    imageActions.isUploading ||
    imageActions.isRemoving ||
    bombImageUpload.isPending;

  return {
    form: {
      register,
      handleSubmit,
      setValue,
      errors,
    },

    values,

    state: {
      categories,
      questionId,

      isTop10,
      isBomb,
      isAudio,
      isVideo,
      isImage,
      isMedia,

      selectedCategory,

      acceptedAnswers,
      rankedEntries,
      bombItems,
      rowWarnings,

      generationWarning: aliasGeneration.warning,

      standardAliasPending: aliasGeneration.standardPending,

      rankedAliasPending: aliasGeneration.rankedPending,

      audioCandidates: candidates,

      audioCandidatesLoading: audioCandidatesQuery.isLoading,

      dirty,
      pending,
    },

    media: {
      storedImageUrl,

      imageUploading: imageActions.isUploading,

      imageRemoving: imageActions.isRemoving,

      storedMediaUrl,

      mediaUploading: audioActions.isUploading,

      mediaRemoving: audioActions.isRemoving,

      audioPending: audioActions.isPending,
    },

    actions: {
      submit,
      saveDraft,
      cancel,

      updateAcceptedAnswers,
      updateRankedEntries,
      updateBombItems,

      generateStandardAliases,
      generateRankedAliases,

      uploadImage,
      uploadBombItemImage: bombImageUpload.upload,
      removeImage,

      previewCurrentClip,

      retryMediaResearch: () => audioActions.retry(questionId, "research"),

      retryMediaProcessing: () =>
        audioActions.retry(questionId, "retryProcessing"),

      approveMedia: () => audioActions.approve(questionId),

      rejectMedia: () => audioActions.reject(questionId),

      removeMedia: removeMediaFile,

      uploadMedia: uploadMediaFile,

      selectMediaCandidate: (candidateId: string) =>
        audioActions.selectCandidate(questionId, candidateId),
    },
  };
}
