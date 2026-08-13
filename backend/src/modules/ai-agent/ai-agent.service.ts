import {
  Injectable,
  Optional,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import { randomUUID } from 'crypto';
import { mkdir, rm } from 'fs/promises';
import { Types } from 'mongoose';
import { join } from 'path';
import { promisify } from 'util';
import { GenerateQuestionsDto } from './dto/generate-questions.dto';
import { GenerateReviewedQuestionsDto } from './dto/generate-reviewed-questions.dto';
import { SaveReviewedDraftsDto } from './dto/save-reviewed-drafts.dto';
import { CategoriesService } from '../categories/categories.service';
import {
  CategoryAiConfig,
  CategoryGameplayConfig,
} from '../categories/schemas/category.schema';
import { Question } from '../questions/schemas/question.schema';
import {
  GeneratedQuestionsArraySchema,
  GeneratedQuestion,
} from './schemas/generated-question.schema';
import {
  KnowledgeLoaderService,
  LoadedKnowledge,
} from './services/knowledge-loader.service';
import { PromptBuilderService } from './services/prompt-builder.service';
import { AssetService } from './application/asset.service';
import {
  AssetMetadata,
  AssetRequest,
  AssetStatus,
  GameMode,
  MediaIntent,
  MediaSourceType,
  QuestionAssetType,
} from './contracts/asset-provider.interface';
import { GameplayValidatorService } from './services/gameplay-validator.service';
import { WrongAnswerRepairService } from './services/wrong-answer-repair.service';
import { QuestionWordingService } from './services/question-wording.service';
import { LlmClientService } from './infrastructure/ai/llm-client.service';
import { EntityVerificationService } from './application/entity-verification.service';
import { entityVerificationPolicy } from './application/entity-verification.policy';
import type {
  EntityVerificationRequest,
  VerificationDiagnostics,
} from './application/entity-verification.types';
import { AgentTrace } from './agents/llm-agent.interface';
import { QuestionRepository } from '../questions/persistence/question.repository';
import {
  GulfMusicQuestionPolicy,
  GulfSong,
  gulfMusicQuestionPolicy,
} from './application/gulf-music-question.policy';
import {
  CategoryGenerationProfile,
  CategoryProfileResolution,
  categoryProfileRegistry,
} from './application/category-generation-profile.registry';
import type { QuestionPatternId } from './application/generation-quality.types';
import { preVerificationQualityValidator } from './application/pre-verification-quality.validator';
import { ArabicSongCatalogService } from './services/arabic-song-catalog.service';
import { AiGenerationPipelineService } from './application/ai-generation-pipeline.service';
import { KnowledgePackRegistry } from './application/knowledge-pack.registry';
import { createZeroDraftGenerationException } from './application/reviewed-generation-error.factory';

const execFileAsync = promisify(execFile);

type DraftGeneratedQuestion = GeneratedQuestion & {
  mediaUrl?: string | null;
  mediaKey?: string;
  spotifyTrackId?: string;
  spotifyArtist?: string;
  spotifyAlbumName?: string;
  spotifyAlbumImageUrl?: string;
  spotifyUrl?: string;
  hasPreviewAudio?: boolean;
};

type ReviewedQuestionDraft = {
  question: string;
  correctAnswer: string;
  wrongAnswers: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  gameMode: GameMode;
  type: QuestionAssetType;
  assetRequest: AssetRequest | null;
  assetStatus: AssetStatus;
  asset: AssetMetadata | null;
  primaryAssetRequest: AssetRequest | null;
  primaryAssetStatus: AssetStatus;
  primaryAsset: AssetMetadata | null;
  coverImageRequest: AssetRequest | null;
  coverImageStatus: AssetStatus;
  coverImage: AssetMetadata | null;
  coverImageFailureReason?: string | null;
  assetFailureReason?: string;
  assetFailureStep?: string;
  assetFailureDiagnostics?: Record<string, unknown> | Record<string, unknown>[];
  wasGameplayAutoFixed?: boolean;
  gameplayFixReason?: string;
  explanation: string;
  qualityScore: number;
  issues: string[];
  agentTrace?: AgentTrace[];
  musicMetadata?: {
    title: string;
    artist: string;
    aliases?: string[];
    artistAliases?: string[];
    releaseYear?: number;
    region: 'gulf';
    country?: string;
    language: 'ar';
  };
  verificationDiagnostics?: VerificationDiagnostics;
  aiMetadata?: Record<string, unknown>;
};

type ReviewedGenerationContext = {
  catalogName: string;
  categoryName: string;
  difficulty: 'easy' | 'medium' | 'hard';
  count: number;
  language: 'ar';
  aiConfig?: CategoryAiConfig;
  gameplayConfig?: CategoryGameplayConfig;
  source: 'categoryId' | 'manualNames';
  loadedKnowledge: LoadedKnowledge;
  gulfMusic: boolean;
  categoryProfileResolution: CategoryProfileResolution;
  resolvedCategoryKey?: string;
  resolvedCatalogKey?: string;
};

@Injectable()
export class AiAgentService {
  private readonly knowledgePacks = new KnowledgePackRegistry();
  private static readonly DEFAULT_QUESTION_COUNT = 2;
  private static readonly DEFAULT_TTS_VOICE = 'Majed';

  private readonly aiEnableRewrite: boolean;
  private readonly appBaseUrl: string;
  private readonly aiAudioVoice: string;

  constructor(
    private configService: ConfigService,
    private categoriesService: CategoriesService,
    private knowledgeLoader: KnowledgeLoaderService,
    private promptBuilder: PromptBuilderService,
    private assetService: AssetService,
    private gameplayValidator: GameplayValidatorService,
    private wrongAnswerRepair: WrongAnswerRepairService,
    private questionWording: QuestionWordingService,
    private llmClient: LlmClientService,
    private readonly questionRepository: QuestionRepository,
    private readonly generationPipeline: AiGenerationPipelineService,
    @Optional() private readonly entityVerification?: EntityVerificationService,
    private readonly arabicSongCatalog?: ArabicSongCatalogService,
  ) {
    this.aiEnableRewrite = this.getBooleanConfig('AI_ENABLE_REWRITE', false);
    this.appBaseUrl =
      this.configService.get<string>('APP_BASE_URL') ?? 'http://localhost:3000';
    this.aiAudioVoice =
      this.configService.get<string>('AI_AUDIO_VOICE') ??
      AiAgentService.DEFAULT_TTS_VOICE;
  }

  private getBooleanConfig(key: string, defaultValue: boolean): boolean {
    const value = this.configService.get<string>(key);

    if (!value) {
      return defaultValue;
    }

    return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
  }

  async generateQuestions(generateQuestionsDto: GenerateQuestionsDto) {
    const { categoryId, count = AiAgentService.DEFAULT_QUESTION_COUNT } =
      generateQuestionsDto;
    const reviewed = await this.generateReviewedQuestions({
      categoryId,
      count,
    });
    const saved = await this.saveReviewedDrafts({
      categoryId,
      drafts: reviewed.data.questions,
    });
    return {
      message: 'Questions generated successfully',
      count: saved.savedQuestions.length,
      data: saved.savedQuestions,
    };
  }

  async generateReviewedQuestions(dto: GenerateReviewedQuestionsDto) {
    try {
      if (dto.allowGeneratedFallback)
        throw new BadRequestException(
          'Generated fallback is disabled for source-curated generation',
        );
      const context = await this.resolveReviewedGenerationContext(dto);
      const gameplayConfig = this.profileGameplayConfig(
        context.categoryProfileResolution.profile,
        context.gameplayConfig,
      );
      let questions: ReviewedQuestionDraft[];
      let pipelineMeta: Record<string, unknown> = {};
      let canonicalPipelineUsed = false;
      if (context.gulfMusic) {
        const songs = await this.arabicSongCatalog?.load();
        if (!songs?.length)
          throw new BadRequestException('Arabic song catalog is empty');
        questions = this.buildGulfMusicDrafts(
          songs,
          context.difficulty,
          context.count,
          gameplayConfig?.maxAudioDuration ?? 15,
        );
      } else {
        canonicalPipelineUsed = true;
        const persisted = dto.categoryId
          ? await this.questionRepository.findQuestionTexts(dto.categoryId)
          : [];
        const pipeline = await this.generationPipeline.execute({
          count: context.count,
          difficulty: dto.difficulty,
          categoryId: dto.categoryId,
          categoryName: context.categoryName,
          catalogName: context.catalogName,
          requestedLanguage: context.language,
          profile: context.categoryProfileResolution.profile,
          gameplay: gameplayConfig,
          knowledgeFile: context.loadedKnowledge.knowledgeFile,
          knowledge: context.loadedKnowledge.knowledge.raw,
          persisted,
          sourceIds: dto.sourceIds,
          strategy: dto.strategy ?? 'source-curated',
          allowGeneratedFallback: false,
        });
        questions = pipeline.drafts.map((draft, index) =>
          this.normalizeReviewedQuestion(draft, context.difficulty, index),
        );
        pipelineMeta = {
          pipelineVersion: '3.0',
          generationRequestId: pipeline.generationRequestId,
          plannedSlots: pipeline.slots.length,
          createdSlots: pipeline.results.filter(
            (result) => result.status === 'created',
          ).length,
          rejectedSlots: pipeline.results.filter(
            (result) => result.status === 'rejected',
          ).length,
          failedSlots: pipeline.results.filter(
            (result) => result.status === 'failed',
          ).length,
          slotDiagnostics: pipeline.results,
          sourceDiagnostics:
            'sourceDiagnostics' in pipeline ? pipeline.sourceDiagnostics : [],
          candidateDiagnostics:
            'candidateDiagnostics' in pipeline
              ? pipeline.candidateDiagnostics
              : [],
          sourceSummary:
            'sourceSummary' in pipeline ? pipeline.sourceSummary : undefined,
        };
      }
      const groundedQuestions = questions;
      const normalizedGameplayConfig =
        this.promptBuilder.normalizeGameplayConfig(gameplayConfig);
      const gameplayValidatedQuestions = canonicalPipelineUsed
        ? groundedQuestions
        : groundedQuestions.map((question) =>
            this.gameplayValidator.normalize(
              question,
              normalizedGameplayConfig.maxAudioDuration,
            ),
          );
      const wordingRepairedQuestions = canonicalPipelineUsed
        ? gameplayValidatedQuestions
        : await this.repairQuestionWording(gameplayValidatedQuestions);
      const repairedQuestions = canonicalPipelineUsed
        ? wordingRepairedQuestions
        : await this.repairWrongAnswers(
            wordingRepairedQuestions,
            context.categoryName,
          );
      const qualityValidatedQuestions = canonicalPipelineUsed
        ? repairedQuestions
        : repairedQuestions.map((question, index) =>
            this.validateReviewedQuestionQuality(question, index),
          );
      const preVerificationValidatedQuestions = canonicalPipelineUsed
        ? qualityValidatedQuestions
        : this.applyPreVerificationQuality(
            context.categoryProfileResolution.profile,
            qualityValidatedQuestions,
          );
      let questionsWithAssets = await this.processDraftAssets(
        preVerificationValidatedQuestions,
        gameplayConfig,
      );
      if (context.gulfMusic) {
        questionsWithAssets = this.selectReadyGulfMusicQuestions(
          questionsWithAssets,
          context.count,
        );
      }

      if (questionsWithAssets.length === 0) {
        if (context.gulfMusic)
          throw new BadRequestException(
            'No verified Arabic song produced a matching YouTube audio clip. The generated title/artist pairs were rejected by verification or media matching; please retry.',
          );
        throw createZeroDraftGenerationException(pipelineMeta);
      }

      return {
        message: 'Reviewed question drafts generated successfully',
        count: questionsWithAssets.length,
        meta: {
          knowledgeFile: context.loadedKnowledge.knowledgeFile,
          requestedKnowledgeFile: context.loadedKnowledge.requestedFile,
          usedDefaultKnowledge: context.loadedKnowledge.usedDefaultKnowledge,
          localKnowledgeFound: context.loadedKnowledge.localKnowledgeFound,
          localKnowledgeIssueCode: context.loadedKnowledge.issueCode,
          source: context.source,
          hasAiConfig: Boolean(context.aiConfig),
          hasGameplayConfig: Boolean(context.gameplayConfig),
          gameplayConfig: normalizedGameplayConfig,
          gameplayConfigUsed: true,
          gameModes: normalizedGameplayConfig.gameModes,
          gameplayValidatorUsed: true,
          multiAgentContentPipeline: false,
          categoryProfileId: context.categoryProfileResolution.profile.id,
          categoryProfileVersion:
            context.categoryProfileResolution.profile.version,
          categoryProfileFallbackUsed:
            context.categoryProfileResolution.fallbackUsed,
          categoryProfileIssueCodes:
            context.categoryProfileResolution.issues.map((issue) => issue.code),
          resolvedKnowledgePackId: context.categoryProfileResolution.profile.id,
          resolvedKnowledgePackVersion:
            context.categoryProfileResolution.profile.version,
          categoryMatchStrategy:
            context.categoryProfileResolution.matchStrategy,
          requestedCategoryId: dto.categoryId,
          categoryName: context.categoryName,
          resolvedCategoryKey: context.resolvedCategoryKey,
          resolvedCatalogKey: context.resolvedCatalogKey,
          requestedCount: dto.count ?? AiAgentService.DEFAULT_QUESTION_COUNT,
          effectiveCount: context.count,
          providerSelection: 'assetService',
          gulfMusicWorkflow: context.gulfMusic,
          imageProviders: ['wikimedia'],
          coverImagesRequested: questionsWithAssets.length,
          coverImagesReady: questionsWithAssets.filter(
            (question) => question.coverImageStatus === 'READY',
          ).length,
          coverImagesFailed: questionsWithAssets.filter(
            (question) => question.coverImageStatus === 'FAILED',
          ).length,
          wrongAnswerRepairUsed: repairedQuestions.some((question) =>
            question.issues.includes('wrongAnswers repaired'),
          ),
          wordingRepairUsed: wordingRepairedQuestions.some((question) =>
            question.issues.includes('QUESTION_WORDING_REPAIRED'),
          ),
          ...pipelineMeta,
        },
        data: {
          questions: questionsWithAssets,
        },
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new InternalServerErrorException(
        `Failed to generate reviewed questions: ${errorMessage}`,
      );
    }
  }

  async saveReviewedDrafts(dto: SaveReviewedDraftsDto) {
    const category = await this.categoriesService.findByIdForGeneration(
      dto.categoryId,
    );
    const existing = await this.questionRepository.findQuestionTexts(
      dto.categoryId,
    );
    const normalizedExisting = new Set(
      existing.map((item) => this.reviewedDraftDuplicateKey(item)),
    );
    const savedQuestions: Question[] = [];
    const failures: Array<{ index: number; reason: string }> = [];

    for (const [index, raw] of dto.drafts.entries()) {
      try {
        const question = this.readString(raw.question);
        const correctAnswer =
          this.readString(raw.correctAnswer) || this.readString(raw.answer);
        if (!question) throw new Error('Missing question');
        if (!correctAnswer) throw new Error('Missing correctAnswer');
        const duplicateKey = this.reviewedDraftDuplicateKey({
          ...raw,
          question,
          correctAnswer,
        });
        if (normalizedExisting.has(duplicateKey))
          throw new Error('Duplicate question in this category');
        const difficulty = ['easy', 'medium', 'hard'].includes(
          this.readString(raw.difficulty),
        )
          ? this.readString(raw.difficulty)
          : 'medium';
        const points =
          difficulty === 'easy' ? 200 : difficulty === 'hard' ? 600 : 400;
        const primaryAsset = (raw.primaryAsset ??
          raw.asset ??
          null) as AssetMetadata | null;
        const coverImage = (raw.coverImage ?? null) as AssetMetadata | null;
        const created = await this.questionRepository.create({
          question,
          correctAnswer,
          answer: correctAnswer,
          wrongAnswers: this.readStringArray(raw.wrongAnswers),
          explanation: this.readString(raw.explanation),
          difficulty,
          points,
          score: points,
          category: new Types.ObjectId(dto.categoryId),
          catalogId:
            dto.catalogId && Types.ObjectId.isValid(dto.catalogId)
              ? new Types.ObjectId(dto.catalogId)
              : this.resolveCatalogIdForDraft(category),
          gameMode: raw.gameMode,
          type: raw.type ?? primaryAsset?.type ?? 'text',
          primaryAsset,
          coverImage,
          mediaUrl: primaryAsset?.url,
          primaryAssetRequest: raw.primaryAssetRequest ?? raw.assetRequest,
          coverImageRequest: raw.coverImageRequest,
          assetStatus:
            raw.primaryAssetStatus ?? raw.assetStatus ?? 'NOT_REQUIRED',
          coverImageStatus:
            raw.coverImageStatus ?? (coverImage ? 'READY' : 'FAILED'),
          assetFailureReason: raw.assetFailureReason,
          assetFailureStep: raw.assetFailureStep,
          assetFailureDiagnostics: raw.assetFailureDiagnostics,
          coverImageFailureReason: raw.coverImageFailureReason,
          qualityScore: raw.qualityScore,
          issues: Array.isArray(raw.issues) ? raw.issues : [],
          gameplayMetadata: raw.gameplayMetadata ?? {},
          aiMetadata: {
            ...((raw.aiMetadata as object) ?? {}),
            ...(raw.verificationDiagnostics
              ? { verificationDiagnostics: raw.verificationDiagnostics }
              : {}),
            savedFromReviewedGenerator: true,
            savedAt: new Date().toISOString(),
          },
          source: 'ai',
          status: 'draft',
          isFreeGameQuestion: false,
        });
        normalizedExisting.add(duplicateKey);
        savedQuestions.push(created);
      } catch (error) {
        failures.push({
          index,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return {
      savedCount: savedQuestions.length,
      failedCount: failures.length,
      savedQuestions,
      failures,
    };
  }

  private normalizeDuplicateText(value: string) {
    return value
      .toLocaleLowerCase('ar')
      .replace(/[\p{P}\p{S}]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private reviewedDraftDuplicateKey(raw: Record<string, unknown>) {
    const question = this.readString(raw.question);
    const gameMode = this.readString(raw.gameMode);
    if (
      ['identifySong', 'identifySinger', 'identifyMusicIntro'].includes(
        gameMode,
      )
    ) {
      const request = (raw.primaryAssetRequest ?? raw.assetRequest ?? {}) as
        Record<string, unknown> | undefined;
      const title =
        this.readString(request?.title) ||
        this.readString(raw.correctAnswer) ||
        this.readString(raw.answer);
      const artist = this.readString(request?.artist);
      return `music:${this.normalizeDuplicateText(title)}::${this.normalizeDuplicateText(artist)}`;
    }
    return `question:${this.normalizeDuplicateText(question)}`;
  }

  private resolveCatalogIdForDraft(category: unknown) {
    const record = category as { catalogId?: unknown; catalog?: unknown };
    const value = record.catalogId ?? record.catalog;
    if (value instanceof Types.ObjectId) return value;
    if (typeof value === 'string' && Types.ObjectId.isValid(value))
      return new Types.ObjectId(value);
    if (value && typeof value === 'object' && '_id' in value)
      return (value as { _id: Types.ObjectId })._id;
    return undefined;
  }

  private async resolveReviewedGenerationContext(
    dto: GenerateReviewedQuestionsDto,
  ): Promise<ReviewedGenerationContext> {
    const difficulty = dto.difficulty ?? 'medium';
    const count = dto.count ?? AiAgentService.DEFAULT_QUESTION_COUNT;
    const language = dto.language ?? 'ar';

    if (dto.categoryId) {
      const category = await this.categoriesService.findByIdForGeneration(
        dto.categoryId,
      );
      const catalog = category.catalog;
      const catalogName = this.resolveCatalogName(catalog) || dto.catalogName;
      const categoryName = category.name;

      if (!catalogName) {
        throw new BadRequestException(
          'Category must have a catalog or catalogName must be provided',
        );
      }

      const categoryProfileResolution = categoryProfileRegistry.resolve({
        catalogName,
        categoryName,
        categoryKey: this.readString(
          (category as unknown as Record<string, unknown>).key,
        ),
        categorySlug: category.slug,
        catalogKey:
          catalog && typeof catalog === 'object'
            ? this.readString(
                (catalog as unknown as Record<string, unknown>).key,
              )
            : undefined,
        catalogSlug: this.resolveCatalogSlugOrName(catalog, catalogName),
      });
      const pack = this.knowledgePacks.fromProfile(
        categoryProfileResolution.profile,
      );
      const inferredKnowledgeFile =
        pack.localKnowledgeFiles?.[0] ??
        this.knowledgeLoader.inferKnowledgeFile(
          this.resolveCatalogSlugOrName(catalog, catalogName),
          category.slug || categoryName,
        );
      const loadedKnowledge = await this.knowledgeLoader.load(
        category.aiConfig?.knowledgeFile || inferredKnowledgeFile,
        {
          allowDefault:
            categoryProfileResolution.profile.id === 'general-text-trivia' &&
            ['default', 'lammah', 'demo', 'system'].includes(
              (category.slug || '').toLowerCase(),
            ),
        },
      );

      return {
        catalogName,
        categoryName,
        difficulty,
        count,
        language,
        aiConfig: category.aiConfig,
        gameplayConfig: category.gameplayConfig,
        source: 'categoryId',
        loadedKnowledge,
        categoryProfileResolution,
        resolvedCategoryKey:
          this.readString(
            (category as unknown as Record<string, unknown>).key,
          ) || category.slug,
        resolvedCatalogKey:
          (catalog && typeof catalog === 'object'
            ? this.readString(
                (catalog as unknown as Record<string, unknown>).key,
              ) ||
              this.readString(
                (catalog as unknown as Record<string, unknown>).slug,
              )
            : '') || catalogName,
        gulfMusic: gulfMusicQuestionPolicy.isGulfMusicCategory({
          catalogName,
          categoryName,
          knowledgeFile: loadedKnowledge.knowledgeFile,
        }),
      };
    }

    if (!dto.catalogName || !dto.categoryName) {
      throw new BadRequestException(
        'Either categoryId or both catalogName and categoryName are required',
      );
    }

    const inferredKnowledgeFile = this.knowledgeLoader.inferKnowledgeFile(
      dto.catalogName,
      dto.categoryName,
    );
    const categoryProfileResolution = categoryProfileRegistry.resolve({
      catalogName: dto.catalogName,
      categoryName: dto.categoryName,
    });
    const pack = this.knowledgePacks.fromProfile(
      categoryProfileResolution.profile,
    );
    const loadedKnowledge = await this.knowledgeLoader.load(
      pack.localKnowledgeFiles?.[0] ?? inferredKnowledgeFile,
      { allowDefault: false },
    );

    return {
      catalogName: dto.catalogName,
      categoryName: dto.categoryName,
      difficulty,
      count,
      language,
      source: 'manualNames',
      loadedKnowledge,
      categoryProfileResolution,
      gulfMusic: gulfMusicQuestionPolicy.isGulfMusicCategory({
        catalogName: dto.catalogName,
        categoryName: dto.categoryName,
        knowledgeFile: loadedKnowledge.knowledgeFile,
      }),
    };
  }

  private profileGameplayConfig(
    profile: CategoryGenerationProfile,
    current?: CategoryGameplayConfig,
  ): CategoryGameplayConfig {
    if (profile.id === 'gulf-music') {
      return this.gulfMusicGameplayConfig(current);
    }

    const zeroModes: NonNullable<CategoryGameplayConfig['gameModes']> = {
      trivia: 0,
      identifyCharacter: 0,
      identifyVoice: 0,
      identifyImage: 0,
      completeQuote: 0,
      timeline: 0,
      emojiPuzzle: 0,
      identifySong: 0,
      identifySinger: 0,
      identifyMusicIntro: 0,
    };
    const weightedModes = profile.allowedGameModes.reduce(
      (acc, mode) => {
        acc[mode] =
          current?.gameModes?.[mode] ??
          Math.floor(100 / profile.allowedGameModes.length);
        return acc;
      },
      { ...zeroModes },
    );

    const explicitWeights = Object.entries(profile.patternWeights ?? {});
    if (explicitWeights.length) {
      for (const mode of profile.allowedGameModes) weightedModes[mode] = 0;
      const patternToMode: Partial<Record<QuestionPatternId, GameMode>> = {
        textTrivia: 'trivia',
        identifyCharacter: 'identifyCharacter',
        identifyLocation: 'trivia',
        identifyItem: 'trivia',
        identifyWeapon: 'trivia',
        identifyBoss: 'trivia',
        identifyGame: 'trivia',
        timelineEvent: 'timeline',
        emojiPuzzle: 'emojiPuzzle',
        identifySong: 'identifySong',
      };
      for (const [patternId, weight] of explicitWeights) {
        const mode = patternToMode[patternId as QuestionPatternId];
        if (mode && profile.allowedGameModes.includes(mode)) {
          weightedModes[mode] = (weightedModes[mode] ?? 0) + (weight ?? 0);
        }
      }
    }

    return {
      ...current,
      gameModes: {
        ...zeroModes,
        ...weightedModes,
        ...current?.gameModes,
      },
      supportedAssetTypes: current?.supportedAssetTypes?.length
        ? current.supportedAssetTypes
        : profile.supportedAssetTypes,
      maxAudioDuration: current?.maxAudioDuration ?? 6,
    };
  }

  private gulfMusicGameplayConfig(
    current?: CategoryGameplayConfig,
  ): CategoryGameplayConfig {
    return {
      ...current,
      gameModes: {
        trivia: 0,
        identifyCharacter: 0,
        identifyVoice: 0,
        identifyImage: 0,
        completeQuote: 0,
        timeline: 0,
        emojiPuzzle: 0,
        identifySong: 100,
        identifySinger: 0,
        identifyMusicIntro: 0,
      },
      supportedAssetTypes: ['audio', 'image', 'video'],
      maxAudioDuration: current?.maxAudioDuration ?? 15,
    };
  }

  private fromGameplayConfig(
    current?: CategoryGameplayConfig,
  ): CategoryGameplayConfig {
    return {
      ...current,
      gameModes: {
        trivia: 45,
        identifyCharacter: 35,
        identifyVoice: 0,
        identifyImage: 10,
        completeQuote: 0,
        timeline: 10,
        emojiPuzzle: 0,
        identifySong: 0,
        identifySinger: 0,
        identifyMusicIntro: 0,
      },
      supportedAssetTypes: ['text', 'image', 'video', 'timeline'],
      maxAudioDuration: current?.maxAudioDuration ?? 6,
    };
  }

  private videoGamesGameplayConfig(
    current?: CategoryGameplayConfig,
  ): CategoryGameplayConfig {
    return {
      ...current,
      gameModes: {
        trivia: 50,
        identifyCharacter: 20,
        identifyVoice: 0,
        identifyImage: 15,
        completeQuote: 0,
        timeline: 10,
        emojiPuzzle: 5,
        identifySong: 0,
        identifySinger: 0,
        identifyMusicIntro: 0,
      },
      supportedAssetTypes: ['text', 'image', 'video', 'timeline', 'emoji'],
      maxAudioDuration: current?.maxAudioDuration ?? 6,
    };
  }

  private buildGulfMusicDrafts(
    songs: GulfSong[],
    difficulty: 'easy' | 'medium' | 'hard',
    count: number,
    duration: number,
  ): ReviewedQuestionDraft[] {
    const orderedSongs = [
      ...this.shuffleSongs(
        songs.filter((song) => song.difficulty === difficulty),
      ),
      ...this.shuffleSongs(
        songs.filter((song) => song.difficulty !== difficulty),
      ),
    ];
    const selectedSongs = orderedSongs.slice(0, Math.min(count, songs.length));
    if (!selectedSongs.length) {
      throw new BadRequestException('MUSIC_SONG_NOT_VERIFIED');
    }

    return selectedSongs.map((song) => {
      const key = gulfMusicQuestionPolicy.duplicateKey(song);
      const wrongAnswers = songs
        .filter(
          (candidate) =>
            gulfMusicQuestionPolicy.duplicateKey(candidate) !== key,
        )
        .map((candidate) => candidate.title)
        .filter((title, index, values) => values.indexOf(title) === index)
        .slice(0, 3);
      const assetRequest = gulfMusicQuestionPolicy.assetRequest(song, duration);

      return {
        question: GulfMusicQuestionPolicy.question,
        correctAnswer: song.title,
        wrongAnswers,
        difficulty,
        gameMode: 'identifySong' as const,
        type: 'audio' as const,
        assetRequest,
        assetStatus: 'PENDING' as const,
        asset: null,
        primaryAssetRequest: assetRequest,
        primaryAssetStatus: 'PENDING' as const,
        primaryAsset: null,
        coverImageRequest: null,
        coverImageStatus: 'NOT_REQUIRED' as const,
        coverImage: null,
        coverImageFailureReason: null,
        explanation: `استمع إلى المقطع وخمّن عنوان الأغنية الخليجية. الإجابة هي "${song.title}" للفنان ${song.artist}.`,
        qualityScore: 10,
        issues: [],
        musicMetadata: {
          title: song.title,
          artist: song.artist,
          aliases: song.titleAliases,
          artistAliases: song.artistAliases,
          ...(song.releaseYear ? { releaseYear: song.releaseYear } : {}),
          region: 'gulf' as const,
          country: song.country,
          language: 'ar' as const,
        },
      };
    });
  }

  private shuffleSongs(songs: GulfSong[]): GulfSong[] {
    const shuffled = [...songs];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [
        shuffled[swapIndex],
        shuffled[index],
      ];
    }
    return shuffled;
  }

  private selectReadyGulfMusicQuestions(
    questions: ReviewedQuestionDraft[],
    count: number,
  ): ReviewedQuestionDraft[] {
    const readyQuestions = questions.filter(
      (question) =>
        question.gameMode === 'identifySong' &&
        question.type === 'audio' &&
        question.assetStatus === 'READY' &&
        question.asset,
    );
    return readyQuestions.slice(0, count);
  }

  private normalizeGulfMusicDrafts(
    drafts: ReviewedQuestionDraft[],
    songs: GulfSong[],
    difficulty: 'easy' | 'medium' | 'hard',
    duration: number,
  ): ReviewedQuestionDraft[] {
    const used = new Set<string>();
    const artists = new Map<string, number>();
    const eligible = songs.filter((song) => song.difficulty === difficulty);
    const normalized = drafts.flatMap((draft) => {
      const artist = this.readString(draft.assetRequest?.artist);
      const resolved = gulfMusicQuestionPolicy.resolve(
        eligible,
        draft.correctAnswer,
        artist,
      );
      if (!resolved.song) return [];
      const song = resolved.song;
      const key = gulfMusicQuestionPolicy.duplicateKey(song);
      const artistKey = song.artist.toLocaleLowerCase('ar');
      if (used.has(key) || (artists.get(artistKey) ?? 0) >= 2) return [];
      used.add(key);
      artists.set(artistKey, (artists.get(artistKey) ?? 0) + 1);
      const wrongAnswers = songs
        .filter(
          (candidate) =>
            gulfMusicQuestionPolicy.duplicateKey(candidate) !== key,
        )
        .map((candidate) => candidate.title)
        .filter((title, index, values) => values.indexOf(title) === index)
        .slice(0, 3);
      const assetRequest = gulfMusicQuestionPolicy.assetRequest(song, duration);
      return [
        {
          ...draft,
          question: GulfMusicQuestionPolicy.question,
          correctAnswer: song.title,
          wrongAnswers,
          difficulty,
          gameMode: 'identifySong' as const,
          type: 'audio' as const,
          assetRequest,
          primaryAssetRequest: assetRequest,
          assetStatus: 'PENDING' as const,
          primaryAssetStatus: 'PENDING' as const,
          issues: [],
          musicMetadata: {
            title: song.title,
            artist: song.artist,
            aliases: song.titleAliases,
            artistAliases: song.artistAliases,
            ...(song.releaseYear ? { releaseYear: song.releaseYear } : {}),
            region: 'gulf' as const,
            country: song.country,
            language: 'ar' as const,
          },
        },
      ];
    });
    if (!normalized.length)
      throw new BadRequestException('MUSIC_SONG_NOT_VERIFIED');
    if (normalized.length !== drafts.length)
      throw new BadRequestException(
        'MUSIC_VERIFIED_POOL_EXHAUSTED: duplicate, repeated-artist, or unverified song draft was rejected',
      );
    return normalized;
  }

  private async processDraftAssets(
    questions: ReviewedQuestionDraft[],
    gameplayConfig?: CategoryGameplayConfig,
  ): Promise<ReviewedQuestionDraft[]> {
    const normalizedGameplayConfig =
      this.promptBuilder.normalizeGameplayConfig(gameplayConfig);
    const supportedAssetTypes = new Set(
      normalizedGameplayConfig.supportedAssetTypes,
    );

    return Promise.all(
      questions.map(async (rawQuestion) => {
        const question = this.enforceGameplayConfigOnDraft(
          rawQuestion,
          supportedAssetTypes,
          normalizedGameplayConfig.maxAudioDuration,
        );
        if (question.aiMetadata?.preVerificationStatus === 'REJECTED') {
          return question;
        }

        // Gameplay validation still owns the legacy field, so it wins while both shapes coexist.
        let primaryRequest =
          question.assetRequest ?? question.primaryAssetRequest;
        let coverRequest = question.coverImageRequest;
        let verificationDiagnostics: VerificationDiagnostics | undefined;
        if (this.entityVerification && (primaryRequest || coverRequest)) {
          const request = this.entityVerificationRequest(
            question,
            primaryRequest ?? coverRequest!,
          );
          const verified = await this.entityVerification.verify(request);
          verificationDiagnostics = this.entityVerification.diagnostics(
            verified,
            !request.locallyGrounded,
          );
          if (!entityVerificationPolicy.maySearchProviders(verified, request)) {
            if (!primaryRequest && coverRequest) {
              return {
                ...question,
                primaryAssetRequest: null,
                primaryAssetStatus: 'NOT_REQUIRED' as const,
                primaryAsset: null,
                coverImageRequest: coverRequest,
                coverImageStatus: 'FAILED' as const,
                coverImage: null,
                assetRequest: null,
                assetStatus: 'NOT_REQUIRED' as const,
                asset: null,
                coverImageFailureReason:
                  'Entity verification did not permit cover image provider search',
                verificationDiagnostics,
                issues: Array.from(
                  new Set([...question.issues, ...verified.issues]),
                ),
              };
            }
            return {
              ...question,
              primaryAssetRequest: primaryRequest,
              primaryAssetStatus: 'FAILED' as const,
              primaryAsset: null,
              coverImageRequest: coverRequest,
              coverImageStatus: 'FAILED' as const,
              coverImage: null,
              assetRequest: primaryRequest,
              assetStatus: 'FAILED' as const,
              asset: null,
              assetFailureReason:
                'Entity verification did not permit provider search',
              assetFailureStep: 'entity-verification',
              verificationDiagnostics,
              issues: Array.from(
                new Set([...question.issues, ...verified.issues]),
              ),
            };
          }
          primaryRequest = primaryRequest
            ? this.applyVerifiedEntity(primaryRequest, verified)
            : null;
          coverRequest = coverRequest
            ? this.applyVerifiedEntity(coverRequest, verified, true)
            : null;
        }
        const primaryResult =
          question.primaryAssetStatus === 'READY' && question.primaryAsset
            ? { assetStatus: 'READY' as const, asset: question.primaryAsset }
            : await this.assetService.process(primaryRequest ?? undefined);
        const coverResult =
          question.coverImageStatus === 'READY' && question.coverImage
            ? { assetStatus: 'READY' as const, asset: question.coverImage }
            : await this.assetService.process(coverRequest ?? undefined);
        const primaryFailure =
          primaryResult.assetStatus === 'FAILED' ? primaryResult : null;
        const coverFailure =
          coverResult.assetStatus === 'FAILED' ? coverResult : null;
        return {
          ...question,
          ...(verificationDiagnostics?.canonicalSongTitle
            ? {
                correctAnswer: verificationDiagnostics.canonicalSongTitle,
              }
            : {}),
          primaryAssetRequest: primaryRequest,
          primaryAssetStatus: primaryResult.assetStatus,
          primaryAsset:
            primaryResult.assetStatus === 'READY' ? primaryResult.asset : null,
          coverImageStatus:
            coverResult.assetStatus === 'NOT_REQUIRED'
              ? 'FAILED'
              : coverResult.assetStatus,
          coverImage:
            coverResult.assetStatus === 'READY' ? coverResult.asset : null,
          coverImageFailureReason:
            coverFailure?.assetFailureReason ??
            (coverResult.assetStatus === 'NOT_REQUIRED'
              ? 'Cover image request is missing'
              : null),
          assetRequest: primaryRequest,
          assetStatus: primaryResult.assetStatus,
          asset:
            primaryResult.assetStatus === 'READY' ? primaryResult.asset : null,
          assetFailureReason: primaryFailure?.assetFailureReason,
          assetFailureStep: primaryFailure?.assetFailureStep,
          assetFailureDiagnostics: primaryFailure?.assetFailureDiagnostics,
          verificationDiagnostics,
        };
      }),
    );
  }

  private applyPreVerificationQuality(
    profile: CategoryGenerationProfile,
    questions: ReviewedQuestionDraft[],
  ): ReviewedQuestionDraft[] {
    return questions.map((question) => {
      const selectedPatternId =
        preVerificationQualityValidator.inferPatternId(question);
      const validation = preVerificationQualityValidator.validate(profile, {
        question: question.question,
        correctAnswer: question.correctAnswer,
        gameMode: question.gameMode,
        type: question.type,
        assetRequest: question.assetRequest ?? question.primaryAssetRequest,
        selectedPatternId,
      });
      const issueCodes = validation.issues.map((issue) => issue.code);
      const aiMetadata = {
        ...question.aiMetadata,
        categoryProfileId: profile.id,
        categoryProfileVersion: profile.version,
        selectedPatternId,
        preVerificationStatus: validation.status,
        preVerificationIssueCodes: issueCodes,
        repairAttempted: false,
        regenerationAttempted: false,
      };

      if (validation.status !== 'REJECTED') {
        return {
          ...question,
          aiMetadata,
          issues: Array.from(new Set([...question.issues, ...issueCodes])),
        };
      }

      const failedStatus =
        question.assetRequest || question.primaryAssetRequest
          ? ('FAILED' as const)
          : question.assetStatus;

      return {
        ...question,
        aiMetadata,
        primaryAssetStatus: failedStatus,
        assetStatus: failedStatus,
        coverImageStatus:
          question.coverImageRequest || question.coverImage
            ? ('FAILED' as const)
            : question.coverImageStatus,
        assetFailureStep:
          question.assetRequest || question.primaryAssetRequest
            ? 'pre-verification-quality'
            : question.assetFailureStep,
        assetFailureReason:
          question.assetRequest || question.primaryAssetRequest
            ? 'Pre-verification quality rejected the draft'
            : question.assetFailureReason,
        issues: Array.from(new Set([...question.issues, ...issueCodes])),
      };
    });
  }

  private entityVerificationRequest(
    question: ReviewedQuestionDraft,
    asset: AssetRequest,
  ): EntityVerificationRequest {
    const song =
      asset.entityType === 'song' ||
      ['identifySong', 'identifySinger', 'identifyMusicIntro'].includes(
        question.gameMode,
      );
    return {
      proposedEntity:
        this.readString(asset.canonicalEntity) ||
        this.readString(asset.entity) ||
        this.readString(asset.title) ||
        question.correctAnswer,
      proposedAnswer: question.correctAnswer,
      entityType: song
        ? 'song'
        : asset.entityType === 'character' ||
            asset.entityType === 'anime-character'
          ? this.readString(asset.categoryType).toLowerCase() === 'anime' ||
            this.readString(asset.categoryType).toLowerCase() === 'manga'
            ? 'anime-character'
            : 'character'
          : asset.entityType === 'historical-person'
            ? 'historical-figure'
            : asset.entityType === 'place' ||
                asset.entityType === 'city' ||
                asset.entityType === 'landmark'
              ? 'place'
              : 'unknown',
      language: 'ar',
      gameMode: question.gameMode,
      artist: this.readString(asset.artist) || undefined,
      franchise: this.readString(asset.franchise) || undefined,
      intendedAsset: song
        ? 'song'
        : question.gameMode === 'identifyVoice'
          ? 'voice'
          : asset.purpose === 'decorative'
            ? 'cover-image'
            : asset.type === 'audio'
              ? 'audio'
              : asset.type === 'video'
                ? 'video'
                : 'image',
      context:
        this.readString(asset.searchContext ?? asset.context) || undefined,
      locallyGrounded: !song && Boolean(question.musicMetadata),
    };
  }

  private applyVerifiedEntity(
    asset: AssetRequest,
    verified: import('./application/entity-verification.types').VerifiedEntity,
    cover = false,
  ): AssetRequest {
    const canonical = cover
      ? verified.franchise || verified.canonicalEntity
      : verified.song?.title || verified.canonicalEntity;
    return {
      ...asset,
      entity: canonical,
      canonicalEntity: canonical,
      searchEntity: canonical,
      query: undefined,
      title: verified.song?.title ?? asset.title,
      aliases: cover
        ? verified.franchise
          ? [verified.franchise]
          : verified.aliases
        : verified.song?.titleAliases.length
          ? verified.song.titleAliases
          : verified.aliases,
      franchise: verified.franchise,
      artist: verified.song?.artist ?? asset.artist,
      artistAliases: verified.song?.artistAliases ?? asset.artistAliases,
    };
  }

  private async repairQuestionWording(
    questions: ReviewedQuestionDraft[],
  ): Promise<ReviewedQuestionDraft[]> {
    return Promise.all(
      questions.map(async (question) => {
        const initial = this.questionWording.validate(
          question.question,
          question.correctAnswer,
        );
        if (!initial.issues.length) return question;

        const baseIssues = Array.from(
          new Set([...question.issues, ...initial.issues]),
        );
        if (!this.questionWording.needsRepair(initial.issues)) {
          return { ...question, issues: baseIssues };
        }

        const deterministic = this.questionWording.safelyShorten(
          question.question,
        );
        const deterministicReview = this.questionWording.validate(
          deterministic,
          question.correctAnswer,
        );
        if (
          deterministic !== question.question &&
          deterministicReview.issues.length === 0
        ) {
          return {
            ...question,
            question: deterministic,
            issues: [...baseIssues, 'QUESTION_WORDING_REPAIRED'],
          };
        }

        try {
          const response = await this.llmClient.complete(
            this.questionWording.buildRepairPrompt(question),
            0.2,
          );
          const repaired = this.questionWording.parseRepairResponse(response);
          const repairedReview = this.questionWording.validate(
            repaired,
            question.correctAnswer,
          );
          if (repaired && repairedReview.issues.length === 0) {
            return {
              ...question,
              question: repaired,
              issues: [...baseIssues, 'QUESTION_WORDING_REPAIRED'],
            };
          }
        } catch {
          // Preserve the factual original if a safe, validated rewrite is unavailable.
        }

        if (
          deterministic !== question.question &&
          deterministicReview.issues.length < initial.issues.length
        ) {
          return {
            ...question,
            question: deterministic,
            issues: Array.from(
              new Set([...baseIssues, ...deterministicReview.issues]),
            ),
          };
        }
        return { ...question, issues: baseIssues };
      }),
    );
  }

  private async repairWrongAnswers(
    questions: ReviewedQuestionDraft[],
    categoryName: string,
  ): Promise<ReviewedQuestionDraft[]> {
    return Promise.all(
      questions.map(async (question) => {
        if (question.wrongAnswers.length === 0) return question;
        const normalizedWrongAnswers =
          this.wrongAnswerRepair.normalizeWrongAnswers(
            question.correctAnswer,
            question.wrongAnswers,
          );

        if (
          !this.wrongAnswerRepair.needsRepair(
            question.correctAnswer,
            normalizedWrongAnswers,
          )
        ) {
          return {
            ...question,
            wrongAnswers: normalizedWrongAnswers,
          };
        }

        try {
          const repairPrompt = this.wrongAnswerRepair.buildRepairPrompt({
            categoryName,
            question: question.question,
            correctAnswer: question.correctAnswer,
            wrongAnswers: normalizedWrongAnswers,
          });
          const repairResponse = await this.callAiProvider(repairPrompt, 0.4);
          const repairedWrongAnswers =
            this.wrongAnswerRepair.normalizeWrongAnswers(
              question.correctAnswer,
              this.wrongAnswerRepair.parseRepairResponse(repairResponse),
            );

          if (repairedWrongAnswers.length !== 3) {
            throw new Error('Repair did not return exactly 3 usable answers');
          }

          return {
            ...question,
            wrongAnswers: repairedWrongAnswers,
            issues: Array.from(
              new Set([...question.issues, 'wrongAnswers repaired']),
            ),
          };
        } catch (error) {
          const repairError =
            error instanceof Error ? error.message : String(error);

          return {
            ...question,
            wrongAnswers: normalizedWrongAnswers,
            issues: Array.from(
              new Set([
                ...question.issues,
                'wrongAnswers must have exactly 3 items',
                `wrongAnswers repair failed: ${repairError}`,
              ]),
            ),
          };
        }
      }),
    );
  }

  private enforceGameplayConfigOnDraft(
    question: ReviewedQuestionDraft,
    supportedAssetTypes: Set<QuestionAssetType>,
    maxAudioDuration?: number,
  ): ReviewedQuestionDraft {
    if (!supportedAssetTypes.has(question.type)) {
      return {
        ...question,
        type: 'text',
        assetRequest: null,
        assetStatus: 'NOT_REQUIRED',
        asset: null,
        issues: Array.from(
          new Set([
            ...question.issues,
            `question type ${question.type} is not supported by gameplayConfig`,
          ]),
        ),
      };
    }

    if (
      ['audio', 'video'].includes(question.type) &&
      question.assetRequest &&
      maxAudioDuration
    ) {
      return {
        ...question,
        assetRequest: {
          ...question.assetRequest,
          duration: Math.min(
            maxAudioDuration,
            Number(question.assetRequest.duration) || maxAudioDuration,
          ),
        },
      };
    }

    return question;
  }

  private resolveCatalogName(catalog: unknown): string | undefined {
    if (!catalog || typeof catalog !== 'object') {
      return undefined;
    }

    const catalogRecord = catalog as Record<string, unknown>;
    const name = catalogRecord.name;

    if (typeof name === 'string') {
      return name;
    }

    if (name && typeof name === 'object') {
      const localizedName = name as Record<string, unknown>;
      return (
        this.readString(localizedName.ar) || this.readString(localizedName.en)
      );
    }

    return undefined;
  }

  private resolveCatalogSlugOrName(
    catalog: unknown,
    fallbackName: string,
  ): string {
    if (catalog && typeof catalog === 'object') {
      const slug = (catalog as Record<string, unknown>).slug;

      if (typeof slug === 'string' && slug.trim()) {
        return slug;
      }
    }

    return fallbackName;
  }

  private parseAndNormalizeReviewedResponse(
    response: string,
    difficulty: 'easy' | 'medium' | 'hard',
  ): ReviewedQuestionDraft[] {
    try {
      const parsed = JSON.parse(this.cleanAiJsonResponse(response)) as unknown;
      const rawQuestions = this.getReviewedQuestionsArray(parsed);

      return rawQuestions.map((question, index) =>
        this.normalizeReviewedQuestion(question, difficulty, index),
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new BadRequestException(
        `Failed to parse reviewed AI response as JSON: ${errorMessage}`,
      );
    }
  }

  private getReviewedQuestionsArray(parsed: unknown): unknown[] {
    if (Array.isArray(parsed)) {
      return parsed;
    }

    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as { questions?: unknown }).questions)
    ) {
      return (parsed as { questions: unknown[] }).questions;
    }

    throw new Error('Response must be an object with a questions array');
  }

  private normalizeReviewedQuestion(
    rawQuestion: unknown,
    requestedDifficulty: 'easy' | 'medium' | 'hard',
    index: number,
  ): ReviewedQuestionDraft {
    const raw =
      rawQuestion && typeof rawQuestion === 'object'
        ? (rawQuestion as Record<string, unknown>)
        : {};
    const issues = this.readStringArray(raw.issues);
    const question = this.readString(raw.question);
    const correctAnswer =
      this.readString(raw.correctAnswer) ||
      this.readString(raw.correct_answer) ||
      this.readString(raw.answer);
    const explanation = this.readString(raw.explanation);
    const qualityScore = this.normalizeQualityScore(raw.qualityScore, issues);
    const gameMode = this.normalizeGameMode(raw.gameMode, issues);
    const type = this.normalizeQuestionAssetType(raw.type, issues);
    const draftMetadata = this.normalizeDraftAssetMetadata(raw);
    const primaryAssetRequest = this.normalizeAssetRequest(
      raw.primaryAssetRequest ?? raw.assetRequest,
      type,
      draftMetadata,
    );
    const assetRequest = primaryAssetRequest;
    const coverImageRequest = this.normalizeAssetRequest(
      raw.coverImageRequest,
      'image',
      draftMetadata,
    );
    const rawPrimaryAsset = raw.primaryAsset ?? raw.asset;
    const primaryAsset =
      rawPrimaryAsset && typeof rawPrimaryAsset === 'object'
        ? (rawPrimaryAsset as AssetMetadata)
        : null;
    const assetStatus = primaryAsset
      ? 'READY'
      : assetRequest
        ? 'PENDING'
        : 'NOT_REQUIRED';
    const wrongAnswers = this.normalizeWrongAnswers(
      raw.wrongAnswers ??
        raw.wrong_answers ??
        raw.incorrectAnswers ??
        raw.distractors,
      correctAnswer,
      issues,
    );
    const difficulty = ['easy', 'medium', 'hard'].includes(
      this.readString(raw.difficulty),
    )
      ? (this.readString(raw.difficulty) as 'easy' | 'medium' | 'hard')
      : requestedDifficulty;

    return {
      question: question || `سؤال غير مكتمل ${index + 1}`,
      correctAnswer,
      wrongAnswers,
      difficulty,
      gameMode,
      type,
      assetRequest,
      assetStatus,
      asset: primaryAsset,
      primaryAssetRequest,
      primaryAssetStatus: assetStatus,
      primaryAsset,
      coverImageRequest,
      coverImageStatus:
        raw.coverImage && typeof raw.coverImage === 'object'
          ? 'READY'
          : coverImageRequest
            ? 'PENDING'
            : 'FAILED',
      coverImage:
        raw.coverImage && typeof raw.coverImage === 'object'
          ? (raw.coverImage as AssetMetadata)
          : null,
      coverImageFailureReason: coverImageRequest
        ? null
        : 'Cover image request is missing',
      explanation,
      qualityScore,
      issues: Array.from(new Set(issues)),
      ...(raw.aiMetadata && typeof raw.aiMetadata === 'object'
        ? { aiMetadata: raw.aiMetadata as Record<string, unknown> }
        : {}),
      ...(Array.isArray(raw.agentTrace)
        ? { agentTrace: raw.agentTrace as AgentTrace[] }
        : {}),
    };
  }

  private readString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private readStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private normalizeGameMode(value: unknown, issues: string[]): GameMode {
    const normalized = this.readString(value);
    const supportedModes: GameMode[] = [
      'trivia',
      'identifyCharacter',
      'identifyVoice',
      'identifyImage',
      'completeQuote',
      'timeline',
      'emojiPuzzle',
      'identifySong',
      'identifySinger',
      'identifyMusicIntro',
    ];

    if (supportedModes.includes(normalized as GameMode)) {
      return normalized as GameMode;
    }

    issues.push('gameMode is missing or invalid');
    return 'trivia';
  }

  private normalizeQuestionAssetType(
    value: unknown,
    issues: string[],
  ): QuestionAssetType {
    const normalized = this.readString(value).toLowerCase();
    const supportedTypes: QuestionAssetType[] = [
      'text',
      'image',
      'audio',
      'video',
      'quote',
      'emoji',
      'timeline',
    ];

    if (supportedTypes.includes(normalized as QuestionAssetType)) {
      return normalized as QuestionAssetType;
    }

    if (normalized) {
      issues.push(`unsupported question type: ${normalized}`);
    }

    return 'text';
  }

  private normalizeAssetRequest(
    value: unknown,
    type: QuestionAssetType,
    draftMetadata: Record<string, unknown> = {},
  ): AssetRequest | null {
    if (type === 'text' && value == null) {
      return null;
    }

    if (!value || typeof value !== 'object') {
      return this.enrichAssetRequestWithDraftMetadata({ type }, draftMetadata);
    }

    const rawAssetRequest = value as Record<string, unknown>;

    return this.enrichAssetRequestWithDraftMetadata(
      {
        ...rawAssetRequest,
        type,
        ...(this.readString(rawAssetRequest.provider)
          ? { provider: this.readString(rawAssetRequest.provider) }
          : {}),
        ...(this.readString(rawAssetRequest.query)
          ? { query: this.readString(rawAssetRequest.query) }
          : {}),
        entity: this.readString(rawAssetRequest.entity),
        assetType: type,
        ...(this.readString(rawAssetRequest.franchise)
          ? { franchise: this.readString(rawAssetRequest.franchise) }
          : {}),
        ...(this.readString(rawAssetRequest.language)
          ? { language: this.readString(rawAssetRequest.language) }
          : {}),
        ...(this.readString(rawAssetRequest.originalName)
          ? { originalName: this.readString(rawAssetRequest.originalName) }
          : {}),
        ...(this.readString(rawAssetRequest.localizedName)
          ? { localizedName: this.readString(rawAssetRequest.localizedName) }
          : {}),
        ...(this.readString(rawAssetRequest.englishTitle)
          ? { englishTitle: this.readString(rawAssetRequest.englishTitle) }
          : {}),
        ...(this.readString(rawAssetRequest.arabicTitle)
          ? { arabicTitle: this.readString(rawAssetRequest.arabicTitle) }
          : {}),
        context: this.readString(rawAssetRequest.context),
        ...(this.readString(rawAssetRequest.entityType)
          ? { entityType: this.readString(rawAssetRequest.entityType) }
          : {}),
        ...(this.readString(rawAssetRequest.visualHint)
          ? { visualHint: this.readString(rawAssetRequest.visualHint) }
          : {}),
        ...(this.readString(rawAssetRequest.categoryType)
          ? { categoryType: this.readString(rawAssetRequest.categoryType) }
          : {}),
        ...(this.readString(rawAssetRequest.purpose) === 'decorative' ||
        this.readString(rawAssetRequest.purpose) === 'gameplay'
          ? {
              purpose: this.readString(rawAssetRequest.purpose) as
                'decorative' | 'gameplay',
            }
          : {}),
        ...(rawAssetRequest.duration !== undefined
          ? { duration: Number(rawAssetRequest.duration) }
          : {}),
        ...(rawAssetRequest.speaker !== undefined
          ? { speaker: this.readString(rawAssetRequest.speaker) }
          : {}),
        ...(this.readString(rawAssetRequest.searchEntity)
          ? { searchEntity: this.readString(rawAssetRequest.searchEntity) }
          : {}),
        ...(this.readString(rawAssetRequest.searchContext)
          ? { searchContext: this.readString(rawAssetRequest.searchContext) }
          : {}),
        ...(this.readString(rawAssetRequest.coverTopic)
          ? { coverTopic: this.readString(rawAssetRequest.coverTopic) }
          : {}),
        ...(this.readString(rawAssetRequest.gameMode)
          ? { gameMode: this.readString(rawAssetRequest.gameMode) as GameMode }
          : {}),
        ...(this.readString(rawAssetRequest.mediaIntent)
          ? {
              mediaIntent: this.normalizeMediaIntent(
                rawAssetRequest.mediaIntent,
              ),
            }
          : {}),
        ...(this.readString(rawAssetRequest.sourceType)
          ? {
              sourceType: this.normalizeMediaSourceType(
                rawAssetRequest.sourceType,
              ),
            }
          : {}),
        ...(this.readString(rawAssetRequest.title)
          ? { title: this.readString(rawAssetRequest.title) }
          : {}),
        ...(this.readString(rawAssetRequest.artist)
          ? { artist: this.readString(rawAssetRequest.artist) }
          : {}),
        ...(Array.isArray(rawAssetRequest.aliases)
          ? { aliases: this.readStringArray(rawAssetRequest.aliases) }
          : {}),
        ...(Array.isArray(rawAssetRequest.artistAliases)
          ? {
              artistAliases: this.readStringArray(
                rawAssetRequest.artistAliases,
              ),
            }
          : {}),
      },
      draftMetadata,
    );
  }

  private normalizeMediaIntent(value: unknown): MediaIntent | undefined {
    const normalized = this.readString(value);
    return ['music', 'voice', 'dialogue', 'speech'].includes(normalized)
      ? (normalized as MediaIntent)
      : undefined;
  }

  private normalizeMediaSourceType(
    value: unknown,
  ): MediaSourceType | undefined {
    const normalized = this.readString(value);
    return [
      'song',
      'anime-voice',
      'movie-quote',
      'tv-dialogue',
      'speech',
    ].includes(normalized)
      ? (normalized as MediaSourceType)
      : undefined;
  }

  private normalizeDraftAssetMetadata(
    raw: Record<string, unknown>,
  ): Record<string, unknown> {
    const metadataSources = [
      raw.metadata,
      raw.entityMetadata,
      raw.assetMetadata,
      raw.aiMetadata,
      raw.gameplayMetadata,
      raw.musicMetadata,
    ];
    return metadataSources.reduce<Record<string, unknown>>((acc, source) => {
      if (!source || typeof source !== 'object' || Array.isArray(source))
        return acc;
      return { ...acc, ...(source as Record<string, unknown>) };
    }, {});
  }

  private enrichAssetRequestWithDraftMetadata(
    request: AssetRequest,
    metadata: Record<string, unknown>,
  ): AssetRequest {
    const enriched: AssetRequest = { ...request };
    const inheritString = (
      target: keyof AssetRequest,
      ...sources: string[]
    ) => {
      if (this.readString(enriched[target])) return;
      for (const source of sources) {
        const value = this.readString(metadata[source]);
        if (value) {
          (enriched as Record<string, unknown>)[target] = value;
          return;
        }
      }
    };

    inheritString('entity', 'canonicalEntity', 'entity', 'character', 'name');
    inheritString(
      'canonicalEntity',
      'canonicalEntity',
      'entity',
      'character',
      'name',
    );
    inheritString(
      'searchEntity',
      'searchEntity',
      'canonicalEntity',
      'entity',
      'character',
      'name',
    );
    inheritString('searchContext', 'searchContext', 'context', 'description');
    inheritString('context', 'context', 'searchContext', 'description');
    inheritString('franchise', 'franchise', 'series', 'anime', 'work');
    inheritString('categoryType', 'categoryType', 'category', 'medium');
    inheritString('entityType', 'entityType', 'type');
    inheritString('originalName', 'originalName', 'japaneseName');
    inheritString('localizedName', 'localizedName', 'arabicName');
    inheritString('englishTitle', 'englishTitle', 'franchiseEnglishTitle');
    inheritString('arabicTitle', 'arabicTitle', 'franchiseArabicTitle');
    inheritString('visualHint', 'visualHint', 'imageHint');

    if (!Array.isArray(enriched.aliases)) {
      const aliases = [
        ...this.readStringArray(metadata.aliases),
        ...this.readStringArray(metadata.alternateNames),
        ...this.readStringArray(metadata.nicknames),
      ];
      if (aliases.length) enriched.aliases = Array.from(new Set(aliases));
    }

    return enriched;
  }

  private normalizeWrongAnswers(
    value: unknown,
    correctAnswer: string,
    issues: string[],
  ): string[] {
    const rawWrongAnswers = this.readStringArray(value);
    const normalizedCorrectAnswer =
      this.normalizeComparableAnswer(correctAnswer);
    const seen = new Set<string>();
    const wrongAnswers: string[] = [];

    for (const answer of rawWrongAnswers) {
      const comparable = this.normalizeComparableAnswer(answer);

      if (!comparable) {
        continue;
      }

      if (comparable === normalizedCorrectAnswer) {
        issues.push('correctAnswer appears in wrongAnswers');
        continue;
      }

      if (seen.has(comparable)) {
        issues.push('wrongAnswers are duplicated');
        continue;
      }

      seen.add(comparable);
      wrongAnswers.push(answer);
    }

    return wrongAnswers.slice(0, 3);
  }

  private normalizeQualityScore(value: unknown, issues: string[]): number {
    const numericValue =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number(value)
          : Number.NaN;

    if (!Number.isFinite(numericValue)) {
      issues.push('qualityScore is missing or invalid');
      return 1;
    }

    return Math.min(10, Math.max(1, Math.round(numericValue)));
  }

  private validateReviewedQuestionQuality(
    question: ReviewedQuestionDraft,
    index: number,
  ): ReviewedQuestionDraft {
    const issues = [...question.issues];

    if (this.questionWording.countWords(question.question) < 4) {
      issues.push('question is too short');
    }

    const unresolvedWordingIssues = this.questionWording.validate(
      question.question,
      question.correctAnswer,
    ).issues;
    issues.push(...unresolvedWordingIssues);

    if (!question.correctAnswer) {
      issues.push('answer is missing');
    }

    if (!question.explanation || question.explanation.length < 5) {
      issues.push('explanation is missing');
    }

    if (question.qualityScore < 7) {
      issues.push('qualityScore is below 7');
    }

    if (!question.gameMode) {
      issues.push('gameMode is missing');
    }

    if (
      ['audio', 'image', 'video'].includes(question.type) &&
      !question.assetRequest
    ) {
      issues.push('assetRequest is missing');
    }

    if (
      question.type === 'audio' &&
      !question.assetRequest?.query &&
      !question.assetRequest?.entity
    ) {
      issues.push('assetRequest entity or query is missing');
    }

    const normalizedWrongAnswers = question.wrongAnswers.map((answer) =>
      this.normalizeComparableAnswer(answer),
    );
    const uniqueWrongAnswers = new Set(normalizedWrongAnswers);

    if (
      question.wrongAnswers.length > 0 &&
      question.wrongAnswers.length !== 3
    ) {
      issues.push('wrongAnswers must have exactly 3 items');
    }

    if (uniqueWrongAnswers.size !== question.wrongAnswers.length) {
      issues.push('wrongAnswers are duplicated');
    }

    if (
      normalizedWrongAnswers.includes(
        this.normalizeComparableAnswer(question.correctAnswer),
      )
    ) {
      issues.push('correctAnswer appears in wrongAnswers');
    }

    const wordingPenalty = Math.min(3, unresolvedWordingIssues.length);

    return {
      ...question,
      qualityScore: Math.max(1, question.qualityScore - wordingPenalty),
      question: question.question || `سؤال غير مكتمل ${index + 1}`,
      explanation: question.explanation || 'شرح غير مكتمل.',
      issues: Array.from(new Set(issues)),
    };
  }

  private normalizeComparableAnswer(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[إأآا]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/[^\p{L}\p{N}]+/gu, '');
  }

  private buildPrompt(categoryName: string, count: number): string {
    const questionCounts = this.getQuestionCountsByDifficulty(count);
    const categorySpecificRules =
      this.getCategorySpecificPromptRules(categoryName);

    return `You are a professional Arabic party-game question writer.
You write short, punchy, natural questions for a game similar to Seen Jeem / Jeopardy.
Your tone should feel fun, conversational, and perfectly suited for Saudi/Gulf players.
Avoid boring textbook questions, obvious facts, yes/no questions, and repeated wording.
Avoid questions that sound AI-generated.
Make each question feel human-written, lively, and ready to spark laughter or discussion.
Keep the wording natural in Arabic, not formal school language.

Category: "${categoryName}"

This category must have exactly ${count} questions:
- ${questionCounts.easy} easy questions worth 200 points
- ${questionCounts.medium} medium questions worth 400 points
- ${questionCounts.hard} hard questions worth 600 points

Question style:
- Short and punchy
- Specific answer
- Simple explanation
- Natural Arabic wording
- No multiple-choice
- No yes/no format
- Discussion-friendly when possible
- Not too obvious
${categorySpecificRules}

Media rules:
- If the category is movies/series/anime: include at least 1 video or image-type question
- If the category is sports: mostly text questions
- If the category is geography/history: text questions only unless a media clue is clearly useful

Return JSON only.
Do not add any extra text or explanation.

Output a JSON array of ${count} objects with exactly these fields:
- question (string)
- answer (string)
- explanation (string)
- difficulty (string): easy, medium, or hard
- points (number): 200, 400, or 600
- type (string): text, audio, video, or image

Example output:
[
  {
    "question": "اسمع مقطع أغنية خليجية بصوت محمد عبده... ما اسم الأغنية؟",
    "answer": "الأماكن", 
    "explanation": "الأغنية معروفة من لحنها ومطلعها ومرتبطة بصوت محمد عبده.",
    "difficulty": "easy",
    "points": 200,
    "type": "audio"
  }
]

Generate exactly ${count} questions for ${categoryName}.`;
  }

  private getQuestionCountsByDifficulty(count: number) {
    const baseCount = Math.floor(count / 3);
    const remainder = count % 3;

    return {
      easy: baseCount + (remainder >= 1 ? 1 : 0),
      medium: baseCount + (remainder >= 2 ? 1 : 0),
      hard: baseCount,
    };
  }

  private getCategorySpecificPromptRules(categoryName: string): string {
    if (!this.isSongsCategory(categoryName)) {
      return '';
    }

    return `

Songs category special rules:
- Generate ONLY audio questions.
- Every object must have "type": "audio".
- The question must be phrased as if the players will hear a short audio snippet from a specific song.
- The question must be unique and mention a non-answer clue such as the artist, era, mood, dialect, or scene, without revealing the song title.
- The question should ask for the song name, for example: "اسمع مقطع أغنية خليجية بصوت محمد عبده... ما اسم الأغنية؟"
- The answer must be the song title only, not the artist name.
- The explanation may mention the artist or why the snippet is recognizable.
- Use real, recognizable Saudi/Gulf/Arabic songs suitable for party-game players.
- Do not ask about lyrics, singer biography, album, year, or music trivia. The task is always identifying the song from the audio snippet.`;
  }

  private isSongsCategory(categoryName: string): boolean {
    const normalized = categoryName.toLowerCase().trim();

    return (
      normalized.includes('songs') ||
      normalized.includes('music') ||
      normalized.includes('أغاني') ||
      normalized.includes('اغاني') ||
      normalized.includes('موسيقى')
    );
  }

  private isFromCategory(categoryName: string): boolean {
    const normalized = categoryName.toLowerCase().trim();
    return normalized === 'from' || normalized === 'فروم';
  }

  private isVideoGamesCategory(catalogName: string, categoryName: string) {
    const normalized = `${catalogName} ${categoryName}`
      .trim()
      .toLowerCase()
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/[ـ\u064b-\u065f\u0670]/g, '')
      .replace(/\s+/g, ' ');

    return [
      'العاب',
      'الالعاب',
      'العاب الفيديو',
      'فيديو قيمز',
      'قيمز',
      'video games',
      'videogames',
      'games',
      'gaming',
    ].some((keyword) => normalized.includes(keyword));
  }

  private async callAiProvider(
    prompt: string,
    temperature = 0.8,
  ): Promise<string> {
    return this.llmClient.complete(prompt, temperature);
  }

  private parseAiResponse(response: string): unknown[] {
    try {
      const jsonString = this.cleanAiJsonResponse(response);

      const parsed = JSON.parse(jsonString);

      if (!Array.isArray(parsed)) {
        throw new Error('Response is not an array');
      }

      return parsed;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new BadRequestException(
        `Failed to parse AI response as JSON: ${errorMessage}`,
      );
    }
  }

  private cleanAiJsonResponse(response: string): string {
    let jsonString = response.trim();

    if (jsonString.startsWith('```json')) {
      jsonString = jsonString
        .replace(/^```json\s*/i, '')
        .replace(/\s*```$/, '');
    } else if (jsonString.startsWith('```')) {
      jsonString = jsonString.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    const firstArrayIndex = jsonString.indexOf('[');
    const firstObjectIndex = jsonString.indexOf('{');
    const candidates = [firstArrayIndex, firstObjectIndex].filter(
      (index) => index >= 0,
    );

    if (candidates.length > 0 && Math.min(...candidates) > 0) {
      jsonString = jsonString.slice(Math.min(...candidates));
    }

    const lastArrayIndex = jsonString.lastIndexOf(']');
    const lastObjectIndex = jsonString.lastIndexOf('}');
    const lastJsonIndex = Math.max(lastArrayIndex, lastObjectIndex);

    if (lastJsonIndex >= 0 && lastJsonIndex < jsonString.length - 1) {
      jsonString = jsonString.slice(0, lastJsonIndex + 1);
    }

    return jsonString.trim();
  }

  private reviewGeneratedQuestion(question: GeneratedQuestion) {
    const scoreValues = {
      fun: 0,
      clarity: 0,
      humanFeel: 0,
      difficultyMatch: 0,
      notObvious: 0,
    };

    const text =
      `${question.question} ${question.answer} ${question.explanation}`.toLowerCase();

    scoreValues.fun = /ضحك|طرائف|مضحك|فرفشة|ممتع|قصة/.test(text) ? 9 : 6;
    scoreValues.clarity = question.question.length < 120 ? 8 : 6;
    scoreValues.humanFeel = /يا|وش|ليه|كيف|أكثر|إيش|واضح|طبيعي/.test(text)
      ? 8
      : 6;
    scoreValues.difficultyMatch =
      question.difficulty === 'easy'
        ? 8
        : question.difficulty === 'medium'
          ? 7
          : 8;
    scoreValues.notObvious = /اكبر|اصغر|كم|مين|متى/.test(question.question)
      ? 7
      : 8;

    const average =
      (scoreValues.fun +
        scoreValues.clarity +
        scoreValues.humanFeel +
        scoreValues.difficultyMatch +
        scoreValues.notObvious) /
      5;

    const shouldRewrite = average < 8;

    return {
      score: Math.round(average * 10) / 10,
      reason: shouldRewrite
        ? 'السؤال يحتاج أسلوب أكثر حيوية وطبيعية وأقل نمطية.'
        : 'السؤال جيد وملائم.',
      shouldRewrite,
    };
  }

  private async rewriteQuestion(
    question: GeneratedQuestion,
    categoryName: string,
  ): Promise<GeneratedQuestion> {
    const rewritePrompt = `You are a professional Arabic party-game question writer.
Rewrite the following question to make it more fun, more natural, and less generic.
Keep the same difficulty, points, and type. Keep the same answer.
Use Saudi/Gulf Arabic tone and keep it clear and short.

Category: "${categoryName}"

Question object:
${JSON.stringify(question)}

Return only one JSON object with the same fields: question, answer, explanation, difficulty, points, type.`;

    const response = await this.callAiProvider(rewritePrompt);
    const rewrittenArray = this.parseAiResponse(
      `[${this.cleanAiJsonResponse(response)}]`,
    );
    const rewritten = rewrittenArray[0];

    if (!rewritten || typeof rewritten !== 'object') {
      throw new Error('Rewrite did not return a valid question object');
    }

    return {
      ...question,
      ...(rewritten as Record<string, unknown>),
    };
  }

  private validateGeneratedQuestions(
    questions: unknown[],
    expectedCount?: number,
  ): GeneratedQuestion[] {
    try {
      const validated = GeneratedQuestionsArraySchema.parse(questions);

      if (expectedCount !== undefined && validated.length !== expectedCount) {
        throw new Error(
          `Expected ${expectedCount} questions, but AI returned ${validated.length}`,
        );
      }

      return validated.map((q) => ({
        ...q,
        points:
          typeof q.points === 'string' ? parseInt(q.points, 10) : q.points,
        type: q.type || 'text',
      }));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new BadRequestException(
        `Question validation failed: ${errorMessage}`,
      );
    }
  }

  private normalizeQuestionsForCategory(
    questions: GeneratedQuestion[],
    categoryName: string,
  ): GeneratedQuestion[] {
    if (!this.isSongsCategory(categoryName)) {
      return questions;
    }

    return questions.map((question) => ({
      ...question,
      type: 'audio',
    }));
  }

  private async removeDuplicates(
    questions: DraftGeneratedQuestion[],
    categoryId: string,
  ): Promise<DraftGeneratedQuestion[]> {
    // Remove duplicates within the batch
    const uniqueInBatch = Array.from(
      new Map(questions.map((q) => [q.question.toLowerCase(), q])).values(),
    );

    // Check against existing questions in MongoDB
    const existingQuestions =
      await this.questionRepository.findQuestionTexts(categoryId);

    const existingTexts = new Set(
      existingQuestions.map((q) => q.question.toLowerCase()),
    );

    const finalQuestions = uniqueInBatch.filter(
      (q) => !existingTexts.has(q.question.toLowerCase()),
    );

    return finalQuestions;
  }

  private async saveDraftQuestions(
    questions: DraftGeneratedQuestion[],
    categoryId: string,
  ): Promise<Record<string, unknown>[]> {
    const categoryObjectId = new Types.ObjectId(categoryId);

    const questionDocs = await Promise.all(
      questions.map(async (q) => {
        const media = await this.generateQuestionMedia(q);

        return {
          category: categoryObjectId,
          question: q.question,
          answer: q.answer,
          explanation: q.explanation,
          difficulty: q.difficulty,
          points: q.points,
          type: q.type,
          mediaUrl: q.mediaUrl ?? media?.mediaUrl,
          mediaKey: q.mediaKey ?? media?.mediaKey,
          spotifyTrackId: q.spotifyTrackId,
          spotifyArtist: q.spotifyArtist,
          spotifyAlbumName: q.spotifyAlbumName,
          spotifyAlbumImageUrl: q.spotifyAlbumImageUrl,
          spotifyUrl: q.spotifyUrl,
          hasPreviewAudio:
            q.hasPreviewAudio ?? !!(q.mediaUrl ?? media?.mediaUrl),
          status: 'draft',
          source: 'ai',
        };
      }),
    );

    const saved = await this.questionRepository.insertMany(questionDocs);
    return saved;
  }

  private async generateQuestionMedia(
    question: DraftGeneratedQuestion,
  ): Promise<
    | {
        mediaUrl: string;
        mediaKey: string;
      }
    | undefined
  > {
    if (question.type !== 'audio' || question.mediaUrl) {
      return undefined;
    }

    return this.generateAudioClue(question);
  }

  private async generateAudioClue(question: GeneratedQuestion) {
    const mediaKey = `audio/ai/${randomUUID()}.m4a`;
    const uploadRoot = join(process.cwd(), 'uploads');
    const audioDirectory = join(uploadRoot, 'audio', 'ai');
    const outputPath = join(uploadRoot, mediaKey);
    const tempPath = outputPath.replace(/\.m4a$/, '.aiff');
    const audioText = this.buildAudioClueText(question);

    await mkdir(audioDirectory, { recursive: true });

    try {
      await execFileAsync('say', [
        '-v',
        this.aiAudioVoice,
        '-o',
        tempPath,
        audioText,
      ]);
      await execFileAsync('afconvert', [
        tempPath,
        outputPath,
        '-f',
        'm4af',
        '-d',
        'aac',
      ]);
    } finally {
      await rm(tempPath, { force: true });
    }

    return {
      mediaUrl: `${this.appBaseUrl.replace(/\/+$/, '')}/uploads/${mediaKey}`,
      mediaKey,
    };
  }

  private buildAudioClueText(question: GeneratedQuestion): string {
    return `تحدي أغاني. ${question.question}`;
  }
}
