import type {
  AudioQuestionKind,
  Question,
  RankedListEntry,
  BombQuestionItem,
} from "@/types";

import { mediaTimingPayload } from "./media-time";
import type { QuestionFormData } from "./question-form-schema";

interface BuildQuestionPayloadParams {
  data: QuestionFormData;
  question?: Question;
  acceptedAnswers: string[];
  rankedEntries: RankedListEntry[];
  bombItems: BombQuestionItem[];
  forcedStatus?: "draft";
}

export function buildQuestionPayload({
  data,
  question,
  acceptedAnswers,
  rankedEntries,
  bombItems,
  forcedStatus,
}: BuildQuestionPayloadParams): Partial<Question> {
  const isTop10 = data.authoringType === "top10";
  const isBomb = data.authoringType === "bomb";
  const isAudio = data.authoringType === "audio";
  const isVideo = data.authoringType === "video";
  const isImage = data.authoringType === "image";
  const isMedia = isAudio || isVideo;
  const usesStructuredAnswers = isTop10 || isBomb;

  const timing = mediaTimingPayload(data);

  const audioRequest =
    isMedia && data.searchQuery?.trim()
      ? {
          kind: data.audioKind as AudioQuestionKind,
          searchQuery: data.searchQuery.trim(),
          targetName:
            data.targetName?.trim() || undefined,
          sourceTitle:
            data.sourceTitle?.trim() || undefined,
          language:
            data.audioLanguage?.trim() || undefined,
          preferredDurationSeconds:
            timing.preferredDurationSeconds,
          preferredStartSeconds:
            timing.preferredStartSeconds,
        }
      : undefined;

  return {
    categoryId: data.categoryId,
    question: data.question.trim(),

    questionType: isTop10
      ? "ranked_list"
      : isBomb
        ? "bomb_sequence"
        : "standard",

    text: isTop10
      ? {
          ar: data.question.trim(),
          en: data.questionEn?.trim() || undefined,
        }
      : undefined,

    ...(!usesStructuredAnswers
      ? {
          answer: data.answer?.trim(),
          acceptedAnswers,
        }
      : {}),

    explanation:
      data.explanation?.trim() || undefined,

    difficulty: data.difficulty,

    points: isTop10
      ? 600
      : Number(data.points),

    maxPoints: isTop10 ? 600 : undefined,
    turnDurationSeconds: isTop10 ? 20 : undefined,
    maxStrikesPerTeam: isTop10 ? 3 : undefined,

    rankedList: isTop10
      ? {
          displayName:
            question?.rankedList?.displayName ?? {
              ar: "توب 10",
              en: "Top 10",
            },

          entries: rankedEntries.map(
            (entry, index) => ({
              ...entry,
              clientId:
                entry.clientId ??
                entry.id ??
                `row-${index}`,
            }),
          ),
        }
      : undefined,
    bombContent: isBomb
      ? {
          items: bombItems.map((item, order) => ({
            ...item,
            order,
            image: item.image
              ? {
                  ...item.image,
                  url: `/${item.image.storageKey.replace(/^\/+/, "")}`,
                }
              : item.image!,
          })),
        }
      : undefined,

    type: isVideo
      ? "video"
      : isAudio
        ? "audio"
        : isImage
          ? "image"
          : isBomb
            ? "image"
            : "text",

    status: forcedStatus ?? data.status,
    source: question?.source ?? "manual",
    isFreeGameQuestion: data.isFreeGameQuestion,

    requiresAudio: Boolean(audioRequest),
    audioKind: audioRequest?.kind,
    audioRequest,
  };
}
