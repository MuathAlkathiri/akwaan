import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Question, QuestionSchema } from './schemas/question.schema';
import { QuestionsService } from './questions.service';
import {
  AdminQuestionsController,
  QuestionsController,
} from './questions.controller';
import { CategoriesModule } from '../categories/categories.module';
import { AssetResolutionModule } from '../ai-agent/asset-resolution.module';
import { QuestionRepository } from './persistence/question.repository';
import { QueryQuestionsService } from './application/query-questions.service';
import { MutateQuestionService } from './application/mutate-question.service';
import { ReviewQuestionService } from './application/review-question.service';
import { QuestionAssetRetryService } from './application/question-asset-retry.service';
import { QuestionLifecyclePolicy } from './policies/question-lifecycle.policy';
import { LocalImageStorageService } from '../../common/uploads/local-image-storage.service';
import { LocalAudioStorageService } from '../../common/uploads/local-audio-storage.service';
import { QuestionDuplicateDetectionService } from './application/question-duplicate-detection.service';
import { QuestionAudioProcessingService } from './application/question-audio-processing.service';
import { QuestionAudioJobService } from './application/question-audio-job.service';
import { QuestionAudioReviewService } from './application/question-audio-review.service';
import { WigoloClient } from '../ai-agent/infrastructure/wigolo/wigolo-client';
import { AudioQuestionCatalogService } from './application/audio-question-catalog.service';
import { MediaInfrastructureModule } from '../../infrastructure/media/media-infrastructure.module';
import { AudioRequestIdentityService } from './application/audio-request-identity.service';
import { AudioSearchQueryBuilder } from './application/audio-search-query-builder.service';
import { RankedListQuestionPolicy } from './application/ranked-list-question.policy';
import { BombQuestionPolicy } from './application/bomb-question.policy';
import { LlmClientService } from '../ai-agent/infrastructure/ai/llm-client.service';
import { AcceptedAnswerExpansionService } from './application/accepted-answer-expansion.service';
import { QuestionMediaRepairService } from './application/question-media-repair.service';
import { QuestionMediaAvailabilityPolicy } from './application/question-media-availability.policy';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Question.name, schema: QuestionSchema },
    ]),
    CategoriesModule,
    AssetResolutionModule,
    MediaInfrastructureModule,
  ],
  providers: [
    QuestionRepository,
    QuestionsService,
    QueryQuestionsService,
    MutateQuestionService,
    ReviewQuestionService,
    QuestionAssetRetryService,
    QuestionLifecyclePolicy,
    LocalImageStorageService,
    LocalAudioStorageService,
    QuestionDuplicateDetectionService,
    QuestionAudioProcessingService,
    QuestionAudioJobService,
    QuestionAudioReviewService,
    WigoloClient,
    AudioQuestionCatalogService,
    AudioRequestIdentityService,
    AudioSearchQueryBuilder,
    RankedListQuestionPolicy,
    BombQuestionPolicy,
    LlmClientService,
    AcceptedAnswerExpansionService,
    QuestionMediaRepairService,
    QuestionMediaAvailabilityPolicy,
  ],
  controllers: [QuestionsController, AdminQuestionsController],
  exports: [
    QuestionsService,
    QuestionRepository,
    AudioQuestionCatalogService,
    RankedListQuestionPolicy,
    BombQuestionPolicy,
    QuestionMediaRepairService,
    QuestionMediaAvailabilityPolicy,
  ],
})
export class QuestionsModule {}
