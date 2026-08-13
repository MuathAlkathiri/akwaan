import type {
  CreateQuestionDto,
  UpdateQuestionDto,
} from "@/api/generated/models";
import type { Question } from "@/types";

const toRequest = (data: Partial<Question>) => ({
  category: typeof data.category === "string" ? data.category : data.categoryId,
  categoryId: data.categoryId,
  worldId: data.worldId,
  contentCategoryId: data.contentCategoryId,
  challengeTypeId: data.challengeTypeId,
  question: data.question,
  questionType: data.questionType,
  text: data.text,
  maxPoints: data.maxPoints,
  turnDurationSeconds: data.turnDurationSeconds,
  maxStrikesPerTeam: data.maxStrikesPerTeam,
  rankedList: data.rankedList
    ? {
        displayName: data.rankedList.displayName,
        entries: data.rankedList.entries.map((entry) => ({
          id: entry.id,
          clientId: entry.clientId,
          answer: entry.answer,
          aliases: entry.aliases,
        })),
      }
    : undefined,
  bombContent: data.bombContent,
  answer: data.answer,
  correctAnswer: data.correctAnswer,
  wrongAnswers: data.wrongAnswers,
  acceptedAnswers: data.acceptedAnswers,
  explanation: data.explanation,
  difficulty: data.difficulty,
  points: data.points,
  score: data.score,
  gameMode: data.gameMode,
  type: data.type,
  primaryAsset: data.primaryAsset,
  requiresAudio: data.requiresAudio,
  audioKind: data.audioKind,
  audioRequest: data.audioRequest,
  coverImage: data.coverImage,
  primaryAssetRequest: data.primaryAssetRequest,
  coverImageRequest: data.coverImageRequest,
  coverImageStatus: data.coverImageStatus,
  coverImageFailureReason: data.coverImageFailureReason,
  mediaUrl: data.mediaUrl,
  mediaKey: data.mediaKey,
  status: data.status,
  source: data.source,
  qualityScore: data.qualityScore,
  issues: data.issues,
  assetStatus: data.assetStatus,
  assetFailureReason: data.assetFailureReason,
  assetFailureStep: data.assetFailureStep,
  assetFailureDiagnostics: data.assetFailureDiagnostics,
  gameplayMetadata: data.gameplayMetadata,
  aiMetadata: data.aiMetadata,
  isFreeGameQuestion: data.isFreeGameQuestion,
});

export const toCreateQuestionRequest = (
  data: Partial<Question>,
): CreateQuestionDto => toRequest(data) as CreateQuestionDto;
export const toUpdateQuestionRequest = (
  data: Partial<Question>,
): UpdateQuestionDto => {
  const request = toRequest(data);
  const {
    primaryAsset: _primaryAsset,
    mediaUrl: _mediaUrl,
    mediaKey: _mediaKey,
    assetStatus: _assetStatus,
    assetFailureReason: _assetFailureReason,
    assetFailureStep: _assetFailureStep,
    assetFailureDiagnostics: _assetFailureDiagnostics,
    ...contentOnly
  } = request;
  return contentOnly as unknown as UpdateQuestionDto;
};
