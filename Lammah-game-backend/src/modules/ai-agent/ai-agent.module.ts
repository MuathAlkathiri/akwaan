import { Module } from '@nestjs/common';
import { AiAgentController } from './ai-agent.controller';
import { AdminAiGeneratorController } from './admin-ai-generator.controller';
import { WigoloClient } from './infrastructure/wigolo/wigolo-client';
import { Inject } from '@nestjs/common';
import {
  AI_PROVIDER_TOKEN,
  type AiProvider,
} from './domain/ai-provider.interface';
import { AiTextProviderModule } from './ai-text-provider.module';
import { AdminAiProviderController } from './admin-ai-provider.controller';
import { AiAgentService } from './ai-agent.service';
import { CategoriesModule } from '../categories/categories.module';
import { QuestionsModule } from '../questions/questions.module';
import { AssetResolutionModule } from './asset-resolution.module';
import { KnowledgeLoaderService } from './services/knowledge-loader.service';
import { PromptBuilderService } from './services/prompt-builder.service';
import { GameplayValidatorService } from './services/gameplay-validator.service';
import { WrongAnswerRepairService } from './services/wrong-answer-repair.service';
import { QuestionWordingService } from './services/question-wording.service';
import { LlmClientService } from './infrastructure/ai/llm-client.service';
import { AiGenerationPipelineService } from './application/ai-generation-pipeline.service';
import { GenerationPlannerService } from './application/generation-planner.service';
import { ResearchAgentService } from './application/research-agent.service';
import { QuestionWriterAgentService } from './application/question-writer-agent.service';
import { QuestionReviewAgentService } from './application/question-review-agent.service';
import { QuestionRepairAgentService } from './application/question-repair-agent.service';
import { DeterministicQuestionValidatorService } from './application/deterministic-question-validator.service';
import { LanguageValidatorService } from './application/language-validator.service';
import { DuplicateDetectionService } from './application/duplicate-detection.service';
import { QuestionSourceRouterService } from './application/question-source-router.service';
import { SourceCuratedQuestionValidatorService } from './application/source-curated-question-validator.service';
import { SourceQuestionNormalizerService } from './application/source-question-normalizer.service';
import { OpenTriviaDbQuestionSourceAdapter } from './infrastructure/question-sources/open-trivia-db-question-source.adapter';
import { QUESTION_SOURCE_ADAPTERS } from './domain/question-source.types';
import { ArabicSongCatalogService } from './services/arabic-song-catalog.service';

/**
 * Compatibility surface for disabled generation routes and Wigolo readiness.
 * Generation-only agents and LLM providers are intentionally not registered.
 * Reusable media processing lives in AssetResolutionModule.
 */
@Module({
  imports: [
    AiTextProviderModule,
    CategoriesModule,
    QuestionsModule,
    AssetResolutionModule,
  ],
  providers: [
    AiAgentService,
    WigoloClient,
    KnowledgeLoaderService,
    PromptBuilderService,
    GameplayValidatorService,
    WrongAnswerRepairService,
    QuestionWordingService,
    ArabicSongCatalogService,
    LlmClientService,
    AiGenerationPipelineService,
    GenerationPlannerService,
    {
      provide: ResearchAgentService,
      useValue: Object.freeze({}),
    },
    QuestionWriterAgentService,
    QuestionReviewAgentService,
    QuestionRepairAgentService,
    DeterministicQuestionValidatorService,
    LanguageValidatorService,
    DuplicateDetectionService,
    QuestionSourceRouterService,
    SourceCuratedQuestionValidatorService,
    SourceQuestionNormalizerService,
    OpenTriviaDbQuestionSourceAdapter,
    {
      provide: QUESTION_SOURCE_ADAPTERS,
      useFactory: (adapter: OpenTriviaDbQuestionSourceAdapter) => [adapter],
      inject: [OpenTriviaDbQuestionSourceAdapter],
    },
  ],
  controllers: [
    AiAgentController,
    AdminAiGeneratorController,
    AdminAiProviderController,
  ],
})
export class AiAgentModule {
  constructor(@Inject(AI_PROVIDER_TOKEN) _provider: AiProvider) {
    void _provider;
  }
}
