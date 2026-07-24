import type { GameResponseDto } from "@/api/generated/models";
import { toCategoryModel } from "@/features/categories";
import { getMediaUrl } from "@/lib/api/media-url";
import type {
  AssetRequest,
  BoardQuestion,
  Game,
  Question,
  QuestionCoverImage,
  QuestionPrimaryAsset,
  Team,
} from "@/types";
import { TOP_10_POINTS } from "@/features/questions/models/ranked-list-form";

type EmbeddedQuestion =
  GameResponseDto["board"][number]["questions"][number]["question"];

const toAsset = (
  asset: EmbeddedQuestion["primaryAsset"],
): QuestionPrimaryAsset | null | undefined =>
  asset === null
    ? null
    : asset
      ? { ...asset, url: getMediaUrl(asset.url) }
      : undefined;

const toCover = (
  asset: EmbeddedQuestion["coverImage"],
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

function toEmbeddedQuestion(dto: EmbeddedQuestion): Question {
  return {
    id: dto.id ?? dto._id,
    _id: dto._id,
    categoryId: dto.categoryId ?? dto.category ?? "",
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
    createdAt: dto.createdAt ?? "",
    updatedAt: dto.updatedAt ?? "",
  };
}

const toTeam = (team: GameResponseDto["teams"][number]): Team => ({
  id: team._id ?? "",
  _id: team._id,
  name: team.name,
  members: team.members,
  score: team.score,
});

export function toGame(dto: GameResponseDto): Game {
  const teams = dto.teams.map(toTeam);
  const categories = dto.selectedCategories.map(toCategoryModel);
  const board = dto.board.map((column): BoardQuestion[] => {
    const category = toCategoryModel(column.category);
    return column.questions.map((item) => {
      const question = toEmbeddedQuestion(item.question);
      return {
        id: item._id ?? question.id,
        _id: item._id,
        categoryId: category.id,
        category,
        points: item.points,
        answered: item.isAnswered,
        questionId: question.id,
        question,
        presentation: item.presentation
          ? {
              preferredType: item.presentation.preferredType,
              type: item.presentation.type,
              mediaAvailable: item.presentation.mediaAvailable,
              mediaUrl: item.presentation.mediaUrl
                ? getMediaUrl(item.presentation.mediaUrl)
                : undefined,
              mediaDuration: item.presentation.mediaDuration,
              fallbackReason: item.presentation.fallbackReason,
            }
          : undefined,
      };
    });
  });
  const currentTeamIndex: 0 | 1 = dto.currentTurnTeamIndex === 1 ? 1 : 0;
  const status =
    dto.status === "finished"
      ? "finished"
      : dto.status === "waiting"
        ? "setup"
        : "in_progress";
  const winner =
    status !== "finished" || teams.length < 2
      ? undefined
      : teams[0].score === teams[1].score
        ? "draw"
        : teams[0].score > teams[1].score
          ? "A"
          : "B";

  return {
    id: dto._id,
    _id: dto._id,
    name: dto.name,
    teams,
    teamA: teams[0],
    teamB: teams[1],
    categories,
    board,
    currentTeamIndex,
    currentTeamTurn: currentTeamIndex === 0 ? "A" : "B",
    status,
    winner,
    createdAt: dto.createdAt ?? "",
    updatedAt: dto.updatedAt ?? "",
  };
}

export const toGames = (games: GameResponseDto[]): Game[] => games.map(toGame);
