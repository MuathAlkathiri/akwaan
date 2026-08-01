import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { Question } from './schemas/question.schema';
import { CategoriesService } from '../categories/categories.service';
import {
  CreateQuestionDto,
  UpdateQuestionDto,
} from './dto/create-question.dto';
import { Category } from '../categories/schemas/category.schema';
import { CategoryAudioPolicy } from '../categories/schemas/category.schema';
import { AssetService } from '../ai-agent/application/asset.service';
import { QuestionRepository } from './persistence/question.repository';
import { QueryQuestionsDto } from './dto/query-questions.dto';
import {
  AssetRequest,
  AssetMetadata,
} from '../ai-agent/contracts/asset-provider.interface';
import {
  AudioAssetStatus,
  AudioReviewStatus,
  AssetStatus,
  QuestionCoverImage,
  QuestionAssetType,
  QuestionPrimaryAsset,
  QuestionStatus,
  QuestionType,
  QuestionGameplayType,
  BombQuestionItem,
} from './schemas/question.schema';
import {
  LocalImageStorageService,
  UploadedImageFile,
} from '../../common/uploads/local-image-storage.service';
import { LocalAudioStorageService } from '../../common/uploads/local-audio-storage.service';
import { QuestionDuplicateDetectionService } from './application/question-duplicate-detection.service';
import { QuestionAudioJobService } from './application/question-audio-job.service';
import { AudioRequestIdentityService } from './application/audio-request-identity.service';
import { AudioRetryMode } from './application/question-audio-job.types';
import { RankedListQuestionPolicy } from './application/ranked-list-question.policy';
import { normalizeAnswer } from '../../common/utils/answer-normalization.util';
import { BombQuestionPolicy } from './application/bomb-question.policy';
import { CategoryGameplayMode } from '../categories/schemas/category.schema';

export function sanitizeStandardAcceptedAnswers(
  values: string[] | undefined,
  canonical?: string,
): string[] | undefined {
  if (values === undefined) return undefined;
  const canonicalNormalized = canonical ? normalizeAnswer(canonical) : '';
  const seen = new Set<string>();
  return values
    .map((value) => value.trim().replace(/\s+/g, ' '))
    .filter((value) => {
      const normalized = normalizeAnswer(value);
      if (
        !normalized ||
        normalized === canonicalNormalized ||
        seen.has(normalized)
      )
        return false;
      seen.add(normalized);
      return true;
    });
}

@Injectable()
export class QuestionsService {
  private readonly logger = new Logger(QuestionsService.name);

  constructor(
    private readonly questions: QuestionRepository,
    private categoriesService: CategoriesService,
    private assetService: AssetService,
    private readonly imageStorage: LocalImageStorageService,
    private readonly audioStorage: LocalAudioStorageService,
    private readonly duplicates: QuestionDuplicateDetectionService,
    private readonly audioJobs: QuestionAudioJobService,
    private readonly audioIdentities: AudioRequestIdentityService,
    private readonly rankedLists: RankedListQuestionPolicy,
    private readonly bombQuestions: BombQuestionPolicy,
  ) {}

  async create(
    createQuestionDto: CreateQuestionDto,
    image?: UploadedImageFile,
  ): Promise<Question> {
    const categoryId =
      createQuestionDto.category ?? createQuestionDto.categoryId;

    if (!categoryId) {
      throw new BadRequestException('Category ID is required');
    }

    const category =
      await this.categoriesService.findByIdForQuestionAuthoring(categoryId);
    const duplicateResult = await this.duplicates.check({
      question: createQuestionDto.question,
      categoryId,
    });
    const payload = this.normalizeQuestionPayload(
      createQuestionDto,
      category,
      true,
    );
    const storedImage = image
      ? await this.imageStorage.save(image, {
          directory: ['questions', 'images'],
          filenamePrefix: 'question-image',
        })
      : undefined;

    try {
      const question = await this.questions.create({
        ...payload,
        ...(duplicateResult.highestSimilarity >= 0.72
          ? { duplicateDiagnostics: duplicateResult }
          : {}),
        ...(storedImage
          ? {
              type: 'image',
              mediaUrl: storedImage.url,
              assetStatus: 'READY',
              primaryAsset: {
                type: 'image',
                url: storedImage.url,
                source: 'admin-upload',
                provider: 'admin-upload',
                localPath: storedImage.path,
                metadata: {
                  mimetype: storedImage.mimetype,
                  size: storedImage.size,
                },
              },
            }
          : {}),
        category: new Types.ObjectId(categoryId),
      });

      if (question.requiresAudio && question.audioRequest)
        this.audioJobs.enqueue({
          questionId: String(question._id),
          requestVersion: question.audioRequest.requestVersion!,
          requestHash: question.audioRequest.requestHash!,
          mode: AudioRetryMode.RESEARCH,
        });
      return question.populate('category');
    } catch (error) {
      if (storedImage) await this.imageStorage.delete(storedImage);
      throw error;
    }
  }

  async findAll(): Promise<Question[]> {
    return this.questions.findAll(false);
  }

  async findAllWithAnswers(): Promise<Question[]> {
    return this.questions.findAll(true);
  }

  async uploadBombItemImage(file: UploadedImageFile) {
    const stored = await this.imageStorage.save(file, {
      directory: ['questions', 'bomb-items'],
      filenamePrefix: 'bomb-item',
    });
    return {
      url: stored.url,
      storageKey: stored.path,
      mimetype: stored.mimetype,
      size: stored.size,
    };
  }

  async bombReadiness(categoryId: string) {
    const category =
      await this.categoriesService.findByIdForQuestionAuthoring(categoryId);
    if (
      (category.gameplayMode ?? CategoryGameplayMode.STANDARD) !==
      CategoryGameplayMode.BOMB
    ) {
      throw new BadRequestException({
        code: 'CATEGORY_NOT_BOMB',
        message: 'Bomb readiness is available only for Bomb categories.',
      });
    }
    const questions =
      await this.questions.findBombReadinessQuestions(categoryId);
    const counts = { easy: 0, medium: 0, hard: 0 };
    let invalidQuestionCount = 0;
    for (const question of questions) {
      if (
        question.questionType !== QuestionGameplayType.BOMB_SEQUENCE ||
        !this.bombQuestions.isValid(question.bombContent)
      ) {
        invalidQuestionCount += 1;
        continue;
      }
      if (question.status === QuestionStatus.APPROVED) {
        counts[question.difficulty] += 1;
      }
    }
    const total = counts.easy + counts.medium + counts.hard;
    return {
      ...counts,
      total,
      invalidQuestionCount,
      isComplete: counts.easy >= 2 && counts.medium >= 2 && counts.hard >= 2,
    };
  }

  async findAiGenerated(filters: QueryQuestionsDto) {
    return this.questions.findAiGenerated(filters);
  }

  async bulkAction(ids: string[], action: 'approve' | 'reject' | 'delete') {
    const objectIds = ids
      .filter(Types.ObjectId.isValid)
      .map((id) => new Types.ObjectId(id));
    if (action === 'delete') return this.questions.bulkDeleteAi(objectIds);
    return this.questions.bulkSetAiStatus(
      objectIds,
      action === 'approve' ? 'approved' : 'rejected',
    );
  }

  async retryAsset(id: string, target: 'primary' | 'cover') {
    const question = await this.questions.findDocumentById(id);
    if (!question)
      throw new NotFoundException(`Question with ID "${id}" not found`);
    const request =
      target === 'primary'
        ? question.primaryAssetRequest
        : question.coverImageRequest;
    if (!request)
      throw new BadRequestException(`No stored ${target} asset request`);
    const result = await this.assetService.process(request as AssetRequest);
    if (target === 'cover') {
      question.coverImageStatus =
        result.assetStatus === 'NOT_REQUIRED'
          ? undefined
          : (result.assetStatus as AssetStatus);
      question.coverImage =
        result.assetStatus === 'READY' ? this.toCoverImage(result.asset) : null;
      question.coverImageFailureReason =
        result.assetStatus === 'FAILED' ? result.assetFailureReason : undefined;
    } else {
      question.assetStatus = result.assetStatus as AssetStatus;
      question.primaryAsset =
        result.assetStatus === 'READY'
          ? this.toPrimaryAsset(result.asset)
          : null;
      question.mediaUrl =
        result.assetStatus === 'READY' ? result.asset.url : undefined;
      question.assetFailureReason =
        result.assetStatus === 'FAILED' ? result.assetFailureReason : undefined;
      question.assetFailureStep =
        result.assetStatus === 'FAILED' ? result.assetFailureStep : undefined;
      question.assetFailureDiagnostics =
        result.assetStatus === 'FAILED'
          ? Array.isArray(result.assetFailureDiagnostics)
            ? { attempts: result.assetFailureDiagnostics }
            : result.assetFailureDiagnostics
          : undefined;
    }
    await question.save();
    return question.populate('category');
  }

  private toPrimaryAsset(asset: AssetMetadata): QuestionPrimaryAsset {
    return { ...asset, type: asset.type as QuestionPrimaryAsset['type'] };
  }

  private toCoverImage(asset: AssetMetadata): QuestionCoverImage {
    return { ...asset, type: 'image' };
  }

  async findById(id: string): Promise<Question> {
    const question = await this.questions.findById(id, false);

    if (!question) {
      throw new NotFoundException(`Question with ID "${id}" not found`);
    }

    return question;
  }

  async findByIdWithAnswer(id: string): Promise<Question> {
    const question = await this.questions.findById(id, true);

    if (!question) {
      throw new NotFoundException(`Question with ID "${id}" not found`);
    }

    return question;
  }

  async update(
    id: string,
    updateQuestionDto: UpdateQuestionDto,
  ): Promise<Question> {
    const existingQuestion = await this.questions.findDocumentById(id);
    if (!existingQuestion) {
      throw new NotFoundException(`Question with ID "${id}" not found`);
    }
    const contentUpdate = this.withoutCanonicalMedia(updateQuestionDto);
    const categoryId = contentUpdate.category ?? contentUpdate.categoryId;
    let category: Category | undefined = existingQuestion.category
      ? await this.categoriesService.findByIdForQuestionAuthoring(
          String(existingQuestion.category),
        )
      : undefined;

    if (categoryId) {
      category =
        await this.categoriesService.findByIdForQuestionAuthoring(categoryId);
    }

    const payload = this.normalizeQuestionPayload(
      contentUpdate,
      category,
      false,
      existingQuestion,
    );
    const audioRequestChanged =
      contentUpdate.audioRequest != null &&
      (!existingQuestion.audioRequest ||
        !this.audioIdentities.same(
          contentUpdate.audioRequest,
          existingQuestion.audioRequest,
        ));
    const requestChanged =
      audioRequestChanged ||
      (contentUpdate.answer !== undefined &&
        contentUpdate.answer !== existingQuestion.answer) ||
      (contentUpdate.correctAnswer !== undefined &&
        contentUpdate.correctAnswer !== existingQuestion.correctAnswer);
    const updateData = {
      ...payload,
      ...(requestChanged && existingQuestion.audioAsset
        ? {
            audioRequestStale: true,
            audioReviewStatus: AudioReviewStatus.PENDING,
            status: QuestionStatus.DRAFT,
          }
        : {}),
      ...(categoryId && {
        category: new Types.ObjectId(categoryId),
      }),
      updatedAt: new Date(),
    };

    const question = await this.questions.updateById(id, updateData);

    if (!question) {
      throw new NotFoundException(`Question with ID "${id}" not found`);
    }

    await this.deleteUnusedBombImages(existingQuestion, question);
    return question;
  }

  async uploadImage(id: string, file: UploadedImageFile): Promise<Question> {
    const existing = await this.questions.findDocumentById(id);
    if (!existing)
      throw new NotFoundException(`Question with ID "${id}" not found`);

    const stored = await this.imageStorage.save(file, {
      directory: ['questions', 'images'],
      filenamePrefix: 'question-image',
    });
    let updated: Question | null;
    try {
      updated = await this.questions.updateById(id, {
        $set: {
          type: QuestionType.IMAGE,
          mediaUrl: stored.url,
          assetStatus: AssetStatus.READY,
          primaryAsset: {
            type: QuestionAssetType.IMAGE,
            url: stored.url,
            source: 'admin-upload',
            provider: 'admin-upload',
            localPath: stored.path,
            metadata: {
              fileName: stored.filename,
              mimeType: stored.mimetype,
              size: stored.size,
            },
          },
          updatedAt: new Date(),
        },
        $unset: {
          assetFailureReason: 1,
          assetFailureStep: 1,
          assetFailureDiagnostics: 1,
        },
      });
    } catch (error) {
      await this.imageStorage.delete(stored);
      throw error;
    }
    if (!updated) {
      await this.imageStorage.delete(stored);
      throw new NotFoundException(`Question with ID "${id}" not found`);
    }

    const previousImage =
      existing.primaryAsset?.type === QuestionAssetType.IMAGE
        ? existing.primaryAsset
        : undefined;
    if (previousImage?.localPath)
      await this.imageStorage.delete({
        path: previousImage.localPath,
      });
    return updated;
  }

  async removeImage(id: string): Promise<Question> {
    const existing = await this.questions.findDocumentById(id);
    if (!existing)
      throw new NotFoundException(`Question with ID "${id}" not found`);
    const existingImage =
      existing.primaryAsset?.type === QuestionAssetType.IMAGE
        ? existing.primaryAsset
        : undefined;
    if (!existingImage)
      throw new BadRequestException({
        code: 'QUESTION_IMAGE_NOT_FOUND',
        message: 'This question does not have a canonical image asset.',
      });

    const updated = await this.questions.updateById(id, {
      $set: {
        assetStatus: AssetStatus.NOT_REQUIRED,
        updatedAt: new Date(),
      },
      $unset: {
        primaryAsset: 1,
        mediaUrl: 1,
        mediaKey: 1,
        assetFailureReason: 1,
        assetFailureStep: 1,
        assetFailureDiagnostics: 1,
      },
    });
    if (!updated)
      throw new NotFoundException(`Question with ID "${id}" not found`);
    if (existingImage.localPath)
      await this.imageStorage.delete({
        path: existingImage.localPath,
      });
    return updated;
  }

  async delete(id: string): Promise<void> {
    const existing = await this.questions.findDocumentById(id);
    const result = await this.questions.deleteById(id);
    if (!result) {
      throw new NotFoundException(`Question with ID "${id}" not found`);
    }
    if (existing?.audioAsset?.localPath)
      await this.audioStorage.delete({
        absolutePath: existing.audioAsset.localPath,
      });
    await this.deleteBombImages(existing?.bombContent?.items);
  }

  async findByIdAndPoints(
    categoryId: string,
    points: number,
  ): Promise<Question[]> {
    return this.questions.findApprovedByCategoryAndPoints(categoryId, points);
  }

  private normalizeQuestionPayload(
    dto: CreateQuestionDto | UpdateQuestionDto,
    category?: Category,
    requireCoreFields = false,
    existing?: Question,
  ) {
    const payload = { ...dto };
    const createdBy = payload.createdBy;
    delete payload.category;
    delete payload.categoryId;
    delete payload.createdBy;
    const correctAnswer = dto.correctAnswer ?? dto.answer;
    const answer = dto.answer ?? dto.correctAnswer;
    const score = dto.score ?? dto.points;
    const points = dto.points ?? dto.score;
    const mediaDto = dto as CreateQuestionDto;
    const primaryAsset = mediaDto.primaryAsset ?? undefined;
    const mediaUrl = mediaDto.mediaUrl ?? primaryAsset?.url;
    const type = dto.type ?? primaryAsset?.type;
    const nextType = type ?? existing?.type;
    const isVideo = nextType === QuestionType.VIDEO;
    const catalogId = this.resolveCatalogObjectId(category);
    const policy = category?.audioPolicy ?? CategoryAudioPolicy.OPTIONAL;
    const rankedListFields = this.rankedLists.normalize(dto, existing);
    const categoryMode =
      category?.gameplayMode ?? CategoryGameplayMode.STANDARD;
    const questionType =
      dto.questionType ??
      existing?.questionType ??
      (categoryMode === CategoryGameplayMode.BOMB
        ? QuestionGameplayType.BOMB_SEQUENCE
        : QuestionGameplayType.STANDARD);
    const bombContent = this.bombQuestions.normalize({
      categoryMode,
      questionType,
      bombContent: dto.bombContent,
      existing,
    });
    const acceptedAnswers = sanitizeStandardAcceptedAnswers(
      dto.acceptedAnswers,
      answer ?? existing?.answer,
    );
    let requiresAudio =
      dto.requiresAudio ?? existing?.requiresAudio ?? Boolean(dto.audioRequest);
    if (policy === CategoryAudioPolicy.DISABLED && requiresAudio && !isVideo) {
      throw new BadRequestException({
        code: 'CATEGORY_AUDIO_DISABLED',
        message: 'Audio is disabled for this category.',
      });
    }
    const rawAudioRequest = dto.audioRequest ?? existing?.audioRequest;
    if (!rawAudioRequest) requiresAudio = false;
    const audioRequestChanged =
      dto.audioRequest != null &&
      (!existing?.audioRequest ||
        !this.audioIdentities.same(dto.audioRequest, existing.audioRequest));
    const audioRequest = rawAudioRequest
      ? audioRequestChanged || !existing
        ? this.audioIdentities.create(
            rawAudioRequest,
            (existing?.audioRequest?.requestVersion ?? 0) + 1,
          )
        : this.audioIdentities.ensure(existing?.audioRequest ?? rawAudioRequest)
      : undefined;
    if (requiresAudio && !audioRequest) {
      throw new BadRequestException({
        code: 'AUDIO_REQUEST_REQUIRED',
        message: 'An audio request is required when requiresAudio is true.',
      });
    }

    const isRankedList =
      (dto.questionType ?? existing?.questionType) ===
      QuestionGameplayType.RANKED_LIST;
    const isBomb = questionType === QuestionGameplayType.BOMB_SEQUENCE;
    if (requireCoreFields && !answer && !isRankedList && !isBomb) {
      throw new BadRequestException('Answer or correctAnswer is required');
    }

    if (requireCoreFields && !points) {
      throw new BadRequestException('Points or score is required');
    }

    return {
      ...payload,
      questionType,
      ...(bombContent ? { bombContent } : {}),
      ...(answer ? { answer } : {}),
      ...(correctAnswer ? { correctAnswer } : {}),
      ...(points ? { points } : {}),
      ...(score ? { score } : {}),
      ...(type ? { type } : {}),
      ...(mediaUrl ? { mediaUrl } : {}),
      ...(primaryAsset !== undefined ? { primaryAsset } : {}),
      ...(acceptedAnswers !== undefined ? { acceptedAnswers } : {}),
      ...(catalogId ? { catalogId } : {}),
      requiresAudio,
      ...(requiresAudio
        ? {
            audioKind: audioRequest?.kind ?? dto.audioKind,
            audioRequest,
            ...(requireCoreFields
              ? {
                  audioStatus: AudioAssetStatus.PENDING,
                  audioReviewStatus: AudioReviewStatus.PENDING,
                  assetStatus: AssetStatus.PENDING,
                  type: isVideo ? QuestionType.VIDEO : QuestionType.AUDIO,
                  status: QuestionStatus.DRAFT,
                }
              : {}),
          }
        : {
            audioStatus: AudioAssetStatus.NOT_REQUIRED,
            audioReviewStatus: undefined,
          }),
      ...rankedListFields,
      ...(createdBy ? { createdBy: new Types.ObjectId(createdBy) } : {}),
    };
  }

  private withoutCanonicalMedia(dto: UpdateQuestionDto): UpdateQuestionDto {
    const content = { ...dto } as Record<string, unknown>;
    delete content.primaryAsset;
    delete content.mediaUrl;
    delete content.mediaKey;
    delete content.assetStatus;
    delete content.assetFailureReason;
    delete content.assetFailureStep;
    delete content.assetFailureDiagnostics;
    return content as UpdateQuestionDto;
  }

  private async deleteUnusedBombImages(
    previous: Pick<Question, 'bombContent'>,
    next: Pick<Question, 'bombContent'>,
  ): Promise<void> {
    const retainedKeys = new Set(
      (next.bombContent?.items ?? []).map((item) => item.image.storageKey),
    );
    await this.deleteBombImages(
      (previous.bombContent?.items ?? []).filter(
        (item) => !retainedKeys.has(item.image.storageKey),
      ),
    );
  }

  private async deleteBombImages(
    items: BombQuestionItem[] | undefined,
  ): Promise<void> {
    if (!items) return;
    const imageItems = Array.from(items);
    const results = await Promise.allSettled(
      imageItems.map((item) =>
        this.imageStorage.delete({ path: item.image.storageKey }),
      ),
    );
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.warn(
          `Failed to remove Bomb item image ${imageItems[index].image.storageKey}: ${String(result.reason)}`,
        );
      }
    });
  }

  private resolveCatalogObjectId(
    category?: Category,
  ): Types.ObjectId | undefined {
    const catalogId = category?.catalogId;

    if (!catalogId) {
      return undefined;
    }

    if (catalogId instanceof Types.ObjectId) {
      return catalogId;
    }

    if (typeof catalogId === 'object' && '_id' in catalogId) {
      return catalogId._id as Types.ObjectId;
    }

    if (typeof catalogId === 'string' && Types.ObjectId.isValid(catalogId)) {
      return new Types.ObjectId(catalogId);
    }

    return undefined;
  }
}
