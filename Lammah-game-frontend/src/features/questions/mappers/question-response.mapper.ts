import type { QuestionResponseDto } from "@/api/generated/models";
import type {
  AssetRequest,
  Question,
  QuestionAudioRequest,
  QuestionCoverImage,
  QuestionPrimaryAsset,
} from "@/types";
import { getMediaUrl } from "@/lib/api/media-url";
import { TOP_10_POINTS } from "../models/ranked-list-form";

const toAsset = (
  asset: QuestionResponseDto["primaryAsset"],
): QuestionPrimaryAsset | null | undefined =>
  asset === null
    ? null
    : asset
      ? { ...asset, url: getMediaUrl(asset.url) }
      : undefined;

const toCover = (
  asset: QuestionResponseDto["coverImage"],
): QuestionCoverImage | null | undefined =>
  asset === null
    ? null
    : asset
      ? { ...asset, type: "image", url: getMediaUrl(asset.url) }
      : undefined;

function toAssetRequest(value: unknown): AssetRequest | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== "object" || !("type" in value))
    return undefined;
  const type = value.type;
  if (
    type !== "text" &&
    type !== "image" &&
    type !== "audio" &&
    type !== "video" &&
    type !== "quote" &&
    type !== "emoji" &&
    type !== "timeline" &&
    type !== "gif"
  )
    return undefined;
  return { ...value, type };
}

function toAudioRequest(
  value: QuestionResponseDto["audioRequest"],
): QuestionAudioRequest | null | undefined {
  if (value === null) return null;
  if (!value) return undefined;
  return {
    kind: value.kind,
    searchQuery: value.searchQuery,
    targetName: value.targetName,
    sourceTitle: value.sourceTitle,
    language: value.language,
    preferredStartSeconds: value.preferredStartSeconds,
    preferredDurationSeconds: value.preferredDurationSeconds,
    provider: value.provider,
    requestVersion: value.requestVersion,
    requestHash: value.requestHash,
    requestedAt: value.requestedAt,
    selectedCandidateId:
      typeof value.selectedCandidateId === "string"
        ? value.selectedCandidateId
        : null,
    candidateSetVersion:
      typeof value.candidateSetVersion === "number"
        ? value.candidateSetVersion
        : null,
  };
}

export function toQuestion(dto: QuestionResponseDto): Question {
  return {
    id: dto.id || dto._id,
    _id: dto._id,
    categoryId: dto.categoryId || dto.category || "",
    category: dto.category,
    question: dto.question,
    questionType: dto.questionType,
    text: dto.text,
    maxPoints: dto.maxPoints,
    turnDurationSeconds: dto.turnDurationSeconds,
    maxStrikesPerTeam: dto.maxStrikesPerTeam,
    rankedList: dto.rankedList
      ? {
          displayName: dto.rankedList.displayName,
          entries: dto.rankedList.entries.map((entry, index) => ({
            id: entry.id,
            rank: entry.rank ?? index + 1,
            answer: entry.answer,
            aliases: entry.aliases,
            points: entry.points ?? TOP_10_POINTS[index] ?? 0,
          })),
        }
      : undefined,
    answer: dto.answer || dto.correctAnswer || "",
    correctAnswer: dto.correctAnswer || dto.answer,
    wrongAnswers: dto.wrongAnswers,
    acceptedAnswers: dto.acceptedAnswers,
    explanation: dto.explanation,
    difficulty: dto.difficulty,
    points: dto.points || dto.score || 200,
    score: dto.score,
    gameMode: dto.gameMode,
    type:
      dto.type === "image" ||
      dto.type === "audio" ||
      dto.type === "video" ||
      dto.type === "gif"
        ? dto.type
        : "text",
    preferredPresentationType:
      dto.preferredPresentationType === "image" ||
      dto.preferredPresentationType === "audio" ||
      dto.preferredPresentationType === "video" ||
      dto.preferredPresentationType === "gif"
        ? dto.preferredPresentationType
        : "text",
    effectivePresentationType:
      dto.effectivePresentationType === "image" ||
      dto.effectivePresentationType === "audio" ||
      dto.effectivePresentationType === "video"
        ? dto.effectivePresentationType
        : "text",
    mediaAvailable: dto.mediaAvailable,
    mediaFallbackReason: dto.mediaFallbackReason,
    resolvedMedia: dto.resolvedMedia
      ? {
          ...dto.resolvedMedia,
          url: getMediaUrl(dto.resolvedMedia.url),
        }
      : dto.resolvedMedia,
    primaryAsset: toAsset(dto.primaryAsset),
    requiresAudio: dto.requiresAudio,
    audioKind: dto.audioKind,
    audioRequest: toAudioRequest(dto.audioRequest),
    audioCandidates: dto.audioCandidates,
    audioStatus: dto.audioStatus,
    audioAsset: toAsset(dto.audioAsset),
    audioReviewStatus: dto.audioReviewStatus,
    audioDiagnostics: dto.audioDiagnostics,
    audioRequestStale: dto.audioRequestStale,
    coverImage: toCover(dto.coverImage),
    primaryAssetRequest: toAssetRequest(dto.primaryAssetRequest),
    coverImageRequest: toAssetRequest(dto.coverImageRequest),
    coverImageStatus: dto.coverImageStatus,
    coverImageFailureReason: dto.coverImageFailureReason,
    mediaUrl: dto.mediaUrl ? getMediaUrl(dto.mediaUrl) : undefined,
    assetStatus: dto.assetStatus,
    assetFailureReason: dto.assetFailureReason,
    assetFailureStep: dto.assetFailureStep,
    assetFailureDiagnostics: dto.assetFailureDiagnostics,
    gameplayMetadata: dto.gameplayMetadata,
    aiMetadata: dto.aiMetadata,
    metadata: dto.metadata,
    qualityScore: dto.qualityScore,
    issues: dto.issues,
    status: dto.status,
    source: dto.source,
    isFreeGameQuestion: dto.isFreeGameQuestion ?? false,
    createdAt: dto.createdAt || "",
    updatedAt: dto.updatedAt || "",
  };
}

export const toQuestions = (questions: QuestionResponseDto[]): Question[] =>
  questions.map(toQuestion);
