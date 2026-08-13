import type {
  CategoryGameplayConfigDto,
  CategoryResponseDto,
} from "@/api/generated/models";
import type {
  Category,
  CategoryGameplayConfig,
  GameplayQuestionType,
  GameMode,
  QuestionDifficulty,
} from "@/types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function numberMap<K extends string>(
  value: unknown,
  allowedKeys: readonly K[],
): Partial<Record<K, number>> | undefined {
  if (!isRecord(value)) return undefined;
  const result: Partial<Record<K, number>> = {};
  for (const key of allowedKeys) {
    if (typeof value[key] === "number") result[key] = value[key];
  }
  return Object.keys(result).length ? result : undefined;
}

const gameModes = [
  "trivia",
  "identifyCharacter",
  "identifyVoice",
  "identifyImage",
  "completeQuote",
  "timeline",
  "emojiPuzzle",
  "identifySong",
  "identifySinger",
  "identifyMusicIntro",
] as const satisfies readonly GameMode[];
const assetTypes = [
  "text",
  "image",
  "audio",
  "quote",
  "emoji",
  "timeline",
] as const satisfies readonly GameplayQuestionType[];
const difficulties = [
  "easy",
  "medium",
  "hard",
] as const satisfies readonly QuestionDifficulty[];

function toMusicConfig(value: unknown): CategoryGameplayConfig["musicConfig"] {
  if (!isRecord(value)) return undefined;
  return {
    ...(Array.isArray(value.allowedRegions) &&
    value.allowedRegions.every((item) => typeof item === "string")
      ? { allowedRegions: value.allowedRegions }
      : {}),
    ...(Array.isArray(value.allowedLanguages) &&
    value.allowedLanguages.every((item) => typeof item === "string")
      ? { allowedLanguages: value.allowedLanguages }
      : {}),
    ...(typeof value.releaseYearFrom === "number"
      ? { releaseYearFrom: value.releaseYearFrom }
      : {}),
    ...(typeof value.releaseYearTo === "number"
      ? { releaseYearTo: value.releaseYearTo }
      : {}),
    ...(typeof value.maxPreviewDuration === "number"
      ? { maxPreviewDuration: value.maxPreviewDuration }
      : {}),
  };
}

function toGameplayConfig(
  value?: CategoryGameplayConfigDto,
): CategoryGameplayConfig | undefined {
  if (!value) return undefined;
  const supportedAssetTypes = value.supportedAssetTypes?.filter(
    (item): item is GameplayQuestionType =>
      assetTypes.some((assetType) => assetType === item),
  );
  return {
    gameModes: numberMap(value.gameModes, gameModes),
    questionTypes: numberMap(value.questionTypes, assetTypes),
    supportedAssetTypes,
    preferredDifficultyMix: numberMap(
      value.preferredDifficultyMix,
      difficulties,
    ),
    musicConfig: toMusicConfig(value.musicConfig),
    maxAudioDuration: value.maxAudioDuration,
    imageRevealAllowed: value.imageRevealAllowed,
    allowMultipleAssets: value.allowMultipleAssets,
  };
}

export function toCategoryModel(dto: CategoryResponseDto): Category {
  const catalog = dto.catalog
    ? {
        id: dto.catalog._id,
        _id: dto.catalog._id,
        name: dto.catalog.name,
        slug: dto.catalog.slug,
        isActive: true,
        sortOrder: 0,
        createdAt: "",
        updatedAt: "",
      }
    : null;

  return {
    id: dto.id ?? dto._id,
    _id: dto._id,
    name: dto.name,
    slug: dto.slug,
    description: dto.description,
    catalogId: dto.catalogId,
    catalog,
    banner: dto.banner,
    aiConfig: dto.aiConfig,
    gameplayConfig: toGameplayConfig(dto.gameplayConfig),
    audioPolicy: dto.audioPolicy ?? "optional",
    gameplayMode: dto.gameplayMode ?? "STANDARD",
    isActive: dto.isActive,
    sortOrder: dto.sortOrder,
    createdAt: dto.createdAt ?? "",
    updatedAt: dto.updatedAt ?? "",
  };
}

export const toCategoryModels = (
  categories: CategoryResponseDto[],
): Category[] => categories.map(toCategoryModel);
