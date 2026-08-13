import type { Question } from "@/types";

import { mediaTimingDefaults } from "./media-time";
import type { QuestionFormData } from "./question-form-schema";

export function getQuestionAuthoringType(
  question?: Question,
): QuestionFormData["authoringType"] {
  if (question?.questionType === "ranked_list") return "top10";
  if (question?.questionType === "bomb_sequence") return "bomb";
  if (question?.type === "video") return "video";
  if (question?.type === "audio" || question?.requiresAudio) return "audio";
  if (question?.type === "image") return "image";

  return "text";
}

export interface QuestionFormInitialClassification {
  worldId?: string;
  challengeTypeId?: string;
}

export function getQuestionFormDefaultValues(
  question?: Question,
  initialClassification?: QuestionFormInitialClassification,
): QuestionFormData {
  const timingDefaults = mediaTimingDefaults(
    question?.audioRequest ?? undefined,
  );

  const categoryId =
    typeof question?.category === "string"
      ? question.category
      : (question?.category?._id ?? question?.categoryId ?? "");

  return {
    authoringType: getQuestionAuthoringType(question),
    categoryId,
    worldId: question?.worldId ?? initialClassification?.worldId ?? "",
    contentCategoryId: question?.contentCategoryId ?? "",
    challengeTypeId:
      question?.challengeTypeId ?? initialClassification?.challengeTypeId ?? "",
    question: question?.question ?? "",
    questionEn: question?.text?.en ?? "",
    answer: question?.answer ?? "",
    explanation: question?.explanation ?? "",
    difficulty: question?.difficulty,
    points: question?.points
      ? (String(question.points) as QuestionFormData["points"])
      : undefined,
    status:
      question?.status === "approved" || question?.status === "rejected"
        ? question.status
        : "draft",
    isFreeGameQuestion: question?.isFreeGameQuestion ?? false,
    audioKind: question?.audioRequest?.kind ?? question?.audioKind ?? "custom",
    searchQuery: question?.audioRequest?.searchQuery ?? "",
    targetName: question?.audioRequest?.targetName ?? "",
    sourceTitle: question?.audioRequest?.sourceTitle ?? "",
    provider: question?.audioRequest?.provider ?? "",
    audioLanguage: question?.audioRequest?.language ?? "ar",
    clipDurationTime: timingDefaults.clipDurationTime,
    clipStartTime: timingDefaults.clipStartTime,
  };
}
