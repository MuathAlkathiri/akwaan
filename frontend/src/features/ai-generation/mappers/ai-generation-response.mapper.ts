import type {
  GenerateReviewedQuestionsResponseDto,
  ReviewedQuestionDraftResponseDto,
  SaveReviewedDraftsResponseDto,
} from "@/api/generated/models";
import { getMediaUrl } from "@/lib/api/media-url";
import type {
  AssetRequest,
  DraftAsset,
  DraftAssetType,
  Question,
  QuestionCoverImage,
} from "@/types";
import type {
  GenerateReviewedQuestionsResult,
  ReviewedQuestionDraft,
} from "../types/ai-generation.types";

const sensitiveDiagnosticKey =
  /prompt|api.?key|stack|local.?path|absolute.?path|command|shell|environment|raw.*(?:response|output)|ffmpeg.*output/i;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function safeDiagnosticValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const withoutPaths = value.replace(
    /\/(?:Users|home|app)\/[^\s]+/g,
    "[redacted path]",
  );
  if (/^\s*(?:ffmpeg|yt-dlp|bash|sh)\s+.+(?:-|--)/i.test(withoutPaths))
    return "[redacted command]";
  return withoutPaths.slice(0, 2_000);
}

function safeDiagnosticRecord(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !sensitiveDiagnosticKey.test(key))
      .map(([key, item]) => [
        key,
        Array.isArray(item)
          ? item.map((entry) =>
              isRecord(entry)
                ? safeDiagnosticRecord(entry)
                : safeDiagnosticValue(entry),
            )
          : isRecord(item)
            ? safeDiagnosticRecord(item)
            : safeDiagnosticValue(item),
      ]),
  );
}

function toSafeDiagnostics(
  value: ReviewedQuestionDraftResponseDto["assetFailureDiagnostics"],
): Record<string, unknown> | Record<string, unknown>[] | undefined {
  if (Array.isArray(value))
    return value.filter(isRecord).map(safeDiagnosticRecord);
  return isRecord(value) ? safeDiagnosticRecord(value) : undefined;
}

const draftAssetTypes = [
  "text",
  "image",
  "audio",
  "quote",
  "emoji",
  "timeline",
  "gif",
] as const satisfies readonly DraftAssetType[];

function isDraftAssetType(value: string): value is DraftAssetType {
  return draftAssetTypes.some((type) => type === value);
}

function toDraftAssetType(value: string): DraftAssetType {
  return isDraftAssetType(value) ? value : "text";
}

function toAssetRequest(
  value: ReviewedQuestionDraftResponseDto["assetRequest"],
): AssetRequest | null {
  if (!value) return null;
  const safe = safeDiagnosticRecord({ ...value });
  return {
    ...safe,
    type: toDraftAssetType(value.type),
    ...(value.assetType
      ? { assetType: toDraftAssetType(value.assetType) }
      : {}),
  };
}

function toFlexibleAssetRequest(
  value: unknown,
): AssetRequest | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || typeof value.type !== "string") return undefined;
  const type = toDraftAssetType(value.type);
  return { ...safeDiagnosticRecord(value), type };
}

function toAsset(
  value: ReviewedQuestionDraftResponseDto["asset"],
): DraftAsset | null {
  if (!value) return null;
  return {
    ...value,
    type: toDraftAssetType(value.type),
    url: getMediaUrl(value.url),
    metadata: value.metadata ? safeDiagnosticRecord(value.metadata) : undefined,
  };
}

function toCoverImage(
  value: ReviewedQuestionDraftResponseDto["coverImage"],
): QuestionCoverImage | null {
  if (!value) return null;
  return {
    url: getMediaUrl(value.url),
    source: value.source,
    sourceUrl: value.sourceUrl,
    provider: value.provider,
    localPath: value.localPath,
    metadata: value.metadata ? safeDiagnosticRecord(value.metadata) : undefined,
    type: "image",
  };
}

export function toReviewedDraft(
  dto: ReviewedQuestionDraftResponseDto,
): ReviewedQuestionDraft {
  return {
    question: dto.question,
    correctAnswer: dto.correctAnswer,
    wrongAnswers: dto.wrongAnswers ?? [],
    difficulty: dto.difficulty,
    gameMode: dto.gameMode,
    type: toDraftAssetType(dto.type),
    assetRequest: toAssetRequest(dto.assetRequest),
    assetStatus: dto.assetStatus,
    asset: toAsset(dto.asset),
    primaryAssetRequest: toAssetRequest(dto.primaryAssetRequest),
    primaryAssetStatus: dto.primaryAssetStatus,
    primaryAsset: toAsset(dto.primaryAsset),
    coverImageRequest: toAssetRequest(dto.coverImageRequest),
    coverImageStatus: dto.coverImageStatus,
    coverImage: toCoverImage(dto.coverImage),
    coverImageFailureReason:
      dto.coverImageFailureReason === null ||
      typeof dto.coverImageFailureReason === "string"
        ? dto.coverImageFailureReason
        : undefined,
    assetFailureReason: dto.assetFailureReason,
    assetFailureStep: dto.assetFailureStep,
    assetFailureDiagnostics: toSafeDiagnostics(dto.assetFailureDiagnostics),
    wasGameplayAutoFixed: dto.wasGameplayAutoFixed,
    gameplayFixReason: dto.gameplayFixReason,
    explanation: dto.explanation,
    qualityScore: dto.qualityScore,
    issues: dto.issues ?? [],
    agentTrace: dto.agentTrace?.map((trace) => ({
      ...trace,
      reason: trace.reason
        ?.split("\n", 1)[0]
        .replace(/\/(?:Users|home|app)\/[^\s]+/g, "[redacted path]")
        .slice(0, 500),
    })),
    gameplayMetadata: dto.gameplayMetadata,
    aiMetadata: dto.aiMetadata
      ? safeDiagnosticRecord(dto.aiMetadata)
      : undefined,
    verificationDiagnostics: dto.verificationDiagnostics,
  };
}

export function toReviewedGenerationResult(
  response: GenerateReviewedQuestionsResponseDto,
): GenerateReviewedQuestionsResult {
  return {
    statusCode: response.statusCode,
    message: response.message,
    count: response.count,
    meta: safeDiagnosticRecord(response.meta),
    data: { questions: response.data.questions.map(toReviewedDraft) },
  };
}

type SavedQuestionDto = SaveReviewedDraftsResponseDto["savedQuestions"][number];

export function toSavedQuestion(dto: SavedQuestionDto): Question {
  return {
    id: dto.id ?? dto._id,
    _id: dto._id,
    categoryId: dto.categoryId ?? dto.category ?? "",
    category: dto.category,
    question: dto.question,
    answer: dto.answer ?? dto.correctAnswer ?? "",
    correctAnswer: dto.correctAnswer ?? dto.answer,
    wrongAnswers: dto.wrongAnswers,
    explanation: dto.explanation,
    difficulty: dto.difficulty,
    points: dto.points ?? dto.score ?? 200,
    score: dto.score,
    gameMode: dto.gameMode,
    type:
      dto.type === "image" ||
      dto.type === "audio" ||
      dto.type === "video" ||
      dto.type === "gif"
        ? dto.type
        : "text",
    primaryAsset: dto.primaryAsset
      ? { ...dto.primaryAsset, url: getMediaUrl(dto.primaryAsset.url) }
      : dto.primaryAsset,
    coverImage: dto.coverImage
      ? {
          ...dto.coverImage,
          type: "image",
          url: getMediaUrl(dto.coverImage.url),
        }
      : dto.coverImage,
    primaryAssetRequest: toFlexibleAssetRequest(dto.primaryAssetRequest),
    coverImageRequest: toFlexibleAssetRequest(dto.coverImageRequest),
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
    createdAt: dto.createdAt ?? "",
    updatedAt: dto.updatedAt ?? "",
  };
}
