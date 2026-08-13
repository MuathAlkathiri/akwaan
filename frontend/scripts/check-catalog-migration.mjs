import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

async function sourceFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await sourceFiles(absolute)));
    else if (/\.[cm]?[jt]sx?$/.test(entry.name)) result.push(absolute);
  }
  return result;
}

async function combinedSource(directory) {
  const sources = await sourceFiles(path.resolve(directory));
  return (
    await Promise.all(sources.map((file) => readFile(file, "utf8")))
  ).join("\n");
}

const catalogsSource = await combinedSource("src/features/catalogs");
const categoriesSource = await combinedSource("src/features/categories");
const musicSource = await combinedSource("src/features/music");
const authSource = await combinedSource("src/features/auth");
const usersSource = await combinedSource("src/features/users");
const questionsSource = await combinedSource("src/features/questions");
const gamesSource = await combinedSource("src/features/games");
const aiGenerationSource = await combinedSource("src/features/ai-generation");
const routesSource = await combinedSource("src/app");
const allFeatureSources = await combinedSource("src/features");
const nonStorageSource = (
  await Promise.all(
    (await sourceFiles(path.resolve("src")))
      .filter((file) => !file.endsWith("features/auth/storage/auth-storage.ts"))
      .map((file) => readFile(file, "utf8")),
  )
).join("\n");
const otherFeatureSources = (
  await Promise.all(
    (await readdir(path.resolve("src/features"), { withFileTypes: true }))
      .filter(
        (entry) =>
          entry.isDirectory() &&
          entry.name !== "catalogs" &&
          entry.name !== "categories" &&
          entry.name !== "music" &&
          entry.name !== "auth" &&
          entry.name !== "users" &&
          entry.name !== "questions",
      )
      .map((entry) => combinedSource(`src/features/${entry.name}`)),
  )
).join("\n");
const nonGamesFeatureSources = (
  await Promise.all(
    (await readdir(path.resolve("src/features"), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name !== "games")
      .map((entry) => combinedSource(`src/features/${entry.name}`)),
  )
).join("\n");
const nonAiFeatureSources = (
  await Promise.all(
    (await readdir(path.resolve("src/features"), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name !== "ai-generation")
      .map((entry) => combinedSource(`src/features/${entry.name}`)),
  )
).join("\n");
const mutator = await readFile(
  path.resolve("src/api/orval-mutator.ts"),
  "utf8",
);
const catalogRequestMapper = await readFile(
  path.resolve("src/features/catalogs/mappers/catalog-request.mapper.ts"),
  "utf8",
);
const categoryRequestMapper = await readFile(
  path.resolve("src/features/categories/mappers/category-request.mapper.ts"),
  "utf8",
);
const categoryResponseMapper = await readFile(
  path.resolve("src/features/categories/mappers/category-response.mapper.ts"),
  "utf8",
);
const musicRequestMapper = await readFile(
  path.resolve("src/features/music/mappers/music-request.mapper.ts"),
  "utf8",
);
const musicResponseMapper = await readFile(
  path.resolve("src/features/music/mappers/music-response.mapper.ts"),
  "utf8",
);
const aiRequestMapper = await readFile(
  path.resolve(
    "src/features/ai-generation/mappers/ai-generation-request.mapper.ts",
  ),
  "utf8",
);
const aiResponseMapper = await readFile(
  path.resolve(
    "src/features/ai-generation/mappers/ai-generation-response.mapper.ts",
  ),
  "utf8",
);

const assertions = [
  [mutator.includes('from "@/lib/api/client"'), "mutator must reuse apiClient"],
  [
    catalogsSource.includes('from "@/api/generated/catalogs/catalogs"'),
    "Catalog hooks must consume generated operations",
  ],
  [
    !catalogsSource.includes("apiClient."),
    "Catalogs must not contain manual Axios calls",
  ],
  [
    catalogRequestMapper.includes("catalog:"),
    "multipart mapper must provide catalog",
  ],
  [
    catalogRequestMapper.includes("banner:"),
    "multipart mapper must provide optional banner",
  ],
  [
    categoriesSource.includes('from "@/api/generated/categories/categories"'),
    "Category hooks must consume generated operations",
  ],
  [
    !categoriesSource.includes("apiClient.") &&
      !categoriesSource.includes("fetch("),
    "Categories must not contain manual network calls",
  ],
  [
    !categoriesSource.includes("categoriesApi"),
    "Categories must not import the removed manual API",
  ],
  [
    categoryRequestMapper.includes("category:") &&
      categoryRequestMapper.includes("banner:"),
    "Category multipart mapper must provide category and optional banner",
  ],
  [
    categoryResponseMapper.includes("CategoryResponseDto") &&
      categoryResponseMapper.includes("toCategoryModel"),
    "Category response mapper must consume the generated DTO",
  ],
  [
    categoryResponseMapper.includes("gameModes") &&
      categoryResponseMapper.includes("preferredDifficultyMix") &&
      categoryResponseMapper.includes("supportedAssetTypes"),
    "Category mapper must preserve gameplay configuration",
  ],
  [
    !routesSource.includes("@/api/generated/categories/") &&
      !otherFeatureSources.includes("@/api/generated/categories/"),
    "Generated Category internals must remain inside the Categories feature",
  ],
  [
    musicSource.includes("@/api/generated/admin-music-tracks/") &&
      musicSource.includes("@/api/generated/music-questions/"),
    "Music hooks must consume generated operations",
  ],
  [
    !musicSource.includes("apiClient.") && !musicSource.includes("fetch("),
    "Music must not contain manual network calls",
  ],
  [
    !musicSource.includes("musicApi") && !musicSource.includes("api/music.api"),
    "Music must not import the removed manual API",
  ],
  [
    musicRequestMapper.includes("file") &&
      musicRequestMapper.includes("snippetDurationSeconds") &&
      musicRequestMapper.includes("snippetStartSecond"),
    "Music multipart mapper must preserve file and timing fields",
  ],
  [
    musicResponseMapper.includes("MusicTrackResponseDto") &&
      musicResponseMapper.includes("getMediaUrl"),
    "Music response mapper must consume the generated DTO and normalize media URLs",
  ],
  [
    musicResponseMapper.includes("MusicAnswerValidationDto") &&
      musicSource.includes("toMusicAnswerValidation"),
    "Music answer-validation response must be mapped inside the feature",
  ],
  [
    !routesSource.includes("@/api/generated/admin-music-tracks/") &&
      !routesSource.includes("@/api/generated/music-questions/") &&
      !questionsSource.includes("@/api/generated/admin-music-tracks/") &&
      !questionsSource.includes("@/api/generated/music-questions/") &&
      !otherFeatureSources.includes("@/api/generated/admin-music-tracks/") &&
      !otherFeatureSources.includes("@/api/generated/music-questions/"),
    "Generated Music internals must remain inside the Music feature",
  ],
  [
    !questionsSource.includes('from "@/features/music"'),
    "Generic Question consumers must not retain the retired Music-only workflow",
  ],
  [
    authSource.includes("@/api/generated/auth/auth") &&
      usersSource.includes("@/api/generated/users/users") &&
      usersSource.includes("@/api/generated/subscriptions/subscriptions"),
    "Auth and Users hooks must consume generated operations",
  ],
  [
    !authSource.includes("apiClient.") &&
      !authSource.includes("fetch(") &&
      !usersSource.includes("apiClient.") &&
      !usersSource.includes("fetch("),
    "Auth and Users must not contain manual network calls",
  ],
  [
    !authSource.includes("authApi") &&
      !authSource.includes("api/auth.api") &&
      !usersSource.includes("usersApi") &&
      !usersSource.includes("api/users.api"),
    "Auth and Users must not reference removed manual APIs",
  ],
  [
    authSource.includes('["auth", "current-user"]') &&
      authSource.match(/\["auth", "current-user"\]/g)?.length === 1,
    "The current-user Query key must remain centralized",
  ],
  [
    authSource.includes("authStorage.setToken") &&
      authSource.includes("authStorage.clear"),
    "AuthProvider must preserve authStorage session ownership",
  ],
  [
    !nonStorageSource.includes("localStorage"),
    "Direct localStorage access must remain isolated to authStorage",
  ],
  [
    !routesSource.includes("@/api/generated/auth/") &&
      !routesSource.includes("@/api/generated/users/") &&
      !routesSource.includes("@/api/generated/subscriptions/") &&
      !otherFeatureSources.includes("@/api/generated/auth/") &&
      !otherFeatureSources.includes("@/api/generated/users/") &&
      !otherFeatureSources.includes("@/api/generated/subscriptions/"),
    "Generated Auth/User internals must remain inside their owning features",
  ],
  [
    questionsSource.includes("@/api/generated/questions/questions") &&
      questionsSource.includes(
        "@/api/generated/admin-questions/admin-questions",
      ),
    "Question hooks must consume generated public and admin operations",
  ],
  [
    !questionsSource.includes("apiClient.") &&
      !questionsSource.includes("fetch(") &&
      !questionsSource.includes("questionsApi"),
    "Questions must not contain manual networking or the removed API wrapper",
  ],
  [
    questionsSource.includes("toQuestionFilters") &&
      questionsSource.includes("useQuestionsBulkAction") &&
      questionsSource.includes("useQuestionsRetryPrimaryAsset") &&
      questionsSource.includes("useQuestionsRetryCoverImage"),
    "Question filters, bulk action, and both retries must use generated contracts",
  ],
  [
    questionsSource.includes('from "@/features/categories"') &&
      !questionsSource.includes('from "@/features/music"'),
    "Questions must use the public Category API without Music-only coupling",
  ],
  [
    !routesSource.includes("@/api/generated/questions/") &&
      !routesSource.includes("@/api/generated/admin-questions/") &&
      !aiGenerationSource.includes("@/api/generated/questions/") &&
      !aiGenerationSource.includes("@/api/generated/admin-questions/") &&
      !otherFeatureSources.includes("@/api/generated/questions/") &&
      !otherFeatureSources.includes("@/api/generated/admin-questions/"),
    "Generated Question internals must remain inside Questions",
  ],
  [
    !questionsSource.includes("as any") && !questionsSource.includes(": any"),
    "Questions must not bypass metadata contracts with any",
  ],
  [
    gamesSource.includes('from "@/api/generated/games/games"'),
    "Game hooks must consume generated operations",
  ],
  [
    !gamesSource.includes("apiClient.") &&
      !gamesSource.includes("fetch(") &&
      !gamesSource.includes("gamesApi"),
    "Games must not contain manual networking or the removed API wrapper",
  ],
  [
    gamesSource.includes("toCreateGameRequest") &&
      gamesSource.includes("toGame") &&
      gamesSource.includes("isAnswered") &&
      gamesSource.includes("currentTurnTeamIndex"),
    "Games must adapt generated requests and authoritative responses",
  ],
  [
    gamesSource.includes('from "@/features/categories"') &&
      !gamesSource.includes("@/api/generated/categories/") &&
      !gamesSource.includes("@/api/generated/questions/") &&
      !gamesSource.includes("@/api/generated/auth/") &&
      !gamesSource.includes("@/api/generated/users/"),
    "Games must use feature boundaries instead of foreign generated clients",
  ],
  [
    gamesSource.includes("CONCURRENT_GAME_UPDATE") &&
      gamesSource.includes("refetchQueries") &&
      gamesSource.includes("setQueryData"),
    "Game actions must refresh conflicts and cache authoritative responses",
  ],
  [
    !routesSource.includes("@/api/generated/games/") &&
      !nonGamesFeatureSources.includes("@/api/generated/games/"),
    "Generated Game internals must remain inside Games",
  ],
  [
    aiGenerationSource.includes(
      'from "@/api/generated/admin-ai-generator/admin-ai-generator"',
    ) &&
      aiGenerationSource.includes("useAiGenerateReviewed") &&
      aiGenerationSource.includes("useAiSaveReviewedDrafts"),
    "AI Generation hooks must consume generated reviewed and save operations",
  ],
  [
    !aiGenerationSource.includes("apiClient.") &&
      !aiGenerationSource.includes("fetch(") &&
      !aiGenerationSource.includes("aiGenerationApi"),
    "AI Generation must not contain manual networking or the removed API wrapper",
  ],
  [
    aiRequestMapper.includes("GenerateReviewedQuestionsDto") &&
      aiRequestMapper.includes("SaveReviewedDraftsDto") &&
      aiRequestMapper.includes("count: input.count ?? AI_GENERATION_DEFAULTS.count") &&
      aiGenerationSource.includes("AI_GENERATION_DEFAULT_COUNT = 2"),
    "AI request mapping must preserve generated contracts and the default count",
  ],
  [
    aiResponseMapper.includes("GenerateReviewedQuestionsResponseDto") &&
      aiResponseMapper.includes("ReviewedQuestionDraftResponseDto") &&
      aiResponseMapper.includes("safeDiagnosticRecord") &&
      aiResponseMapper.includes("getMediaUrl"),
    "AI response mapping must preserve typed drafts, safe diagnostics, and media URLs",
  ],
  [
    aiGenerationSource.includes('from "@/features/questions"') &&
      aiGenerationSource.includes('from "@/features/categories"') &&
      !aiGenerationSource.includes("@/api/generated/questions/") &&
      !aiGenerationSource.includes("@/api/generated/admin-questions/") &&
      !aiGenerationSource.includes("@/api/generated/categories/") &&
      !aiGenerationSource.includes("@/api/generated/catalogs/") &&
      !aiGenerationSource.includes("@/api/generated/music"),
    "AI Generation must use public cross-feature APIs",
  ],
  [
    aiGenerationSource.includes("retry: false") &&
      aiGenerationSource.includes("timeout: 0") &&
      aiGenerationSource.includes("AxiosError<ErrorResponseDto>"),
    "Long-running AI mutations must preserve explicit timeout, retry, and Axios errors",
  ],
  [
    aiGenerationSource.includes("questionKeys.all") &&
      aiGenerationSource.includes("setQueryData") &&
      aiGenerationSource.includes("aiGenerationKeys.all"),
    "Saving drafts must refresh persisted Question caches",
  ],
  [
    !aiGenerationSource.includes("useAiGenerateQuestions") &&
      !aiGenerationSource.includes("useGenerateQuestions"),
    "The unused legacy generation route must not gain a compatibility consumer",
  ],
  [
    !routesSource.includes("@/api/generated/admin-ai-generator/") &&
      !routesSource.includes("@/api/generated/ai-agent/") &&
      !nonAiFeatureSources.includes("@/api/generated/admin-ai-generator/") &&
      !nonAiFeatureSources.includes("@/api/generated/ai-agent/"),
    "Generated AI internals must remain inside AI Generation",
  ],
  [
    !aiGenerationSource.includes("as any") &&
      !aiGenerationSource.includes(": any"),
    "AI Generation must narrow flexible metadata without any",
  ],
  [
    !allFeatureSources.includes("apiClient.") &&
      !allFeatureSources.includes("fetch("),
    "Business features must use generated operations for backend networking",
  ],
];

for (const [condition, message] of assertions) {
  if (!condition) throw new Error(message);
}

process.stdout.write(
  "All feature networking uses the generated client; final AI Generation migration checks passed\n",
);
