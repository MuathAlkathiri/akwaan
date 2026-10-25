import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ContentItemService } from '../world-content/application/content-item.service';
import { ContentItemCompatibilityPolicy } from '../world-content/domain/content-item-compatibility.policy';
import { ChallengeTypeRepository } from '../world-content/persistence/challenge-type.repository';
import { ContentItemRepository } from '../world-content/persistence/content-item.repository';
import { ScopeRepository } from '../world-content/persistence/scope.repository';
import { WorldChallengeConfigurationRepository } from '../world-content/persistence/world-challenge-configuration.repository';
import { WorldRepository } from '../world-content/persistence/world.repository';
import {
  ChallengeType,
  ChallengeTypeSchema,
} from '../world-content/schemas/challenge-type.schema';
import {
  ContentItem,
  ContentItemSchema,
} from '../world-content/schemas/content-item.schema';
import { Scope, ScopeSchema } from '../world-content/schemas/scope.schema';
import {
  WorldChallengeConfiguration,
  WorldChallengeConfigurationSchema,
} from '../world-content/schemas/world-challenge-configuration.schema';
import { World, WorldSchema } from '../world-content/schemas/world.schema';
import { AuthoringContextService } from './application/authoring-context.service';
import { CandidateGeneratorService } from './application/candidate-generator.service';
import { DeterministicScreenService } from './application/deterministic-screen.service';
import { FactVerificationService } from './application/fact-verification.service';
import { QualityJudgeService } from './application/quality-judge.service';
import { CandidateCompatibilityService } from './application/candidate-compatibility.service';
import { ContentEngineOrchestratorService } from './application/content-engine-orchestrator.service';
import { ContentEngineReviewService } from './application/content-engine-review.service';
import { EngineBudgetService } from './application/engine-budget.service';
import { GenerationJobService } from './application/generation-job.service';
import type { AiProvider } from '../ai-agent/domain/ai-provider.interface';
import {
  CONTENT_ENGINE_ENABLED,
  ENGINE_AI_PROVIDER,
  ENGINE_EVIDENCE_RETRIEVAL_ENABLED,
  ENGINE_LIVE_PROVIDER_ENABLED,
} from './domain/content-engine.constants';
import { OpenRouterAiProvider } from './infrastructure/openrouter-ai.provider';
import { WigoloClient } from '../ai-agent/infrastructure/wigolo/wigolo-client';
import {
  FACT_EVIDENCE_RETRIEVER,
  FactEvidenceRetriever,
} from './domain/fact-verification.types';
import { WigoloFactEvidenceRetriever } from './infrastructure/wigolo-fact-evidence.retriever';
import { EnginePricingService } from './domain/engine-pricing.service';
import { EngineJobAdminService } from './application/engine-job-admin.service';
import { ContentEngineJobsController } from './presentation/content-engine-jobs.controller';
import { ContentEngineReviewController } from './presentation/content-engine-review.controller';
import {
  EngineBudgetDocument,
  EngineBudgetSchema,
} from './schemas/engine-budget.schema';
import {
  EngineCostEntryDocument,
  EngineCostEntrySchema,
} from './schemas/engine-cost-entry.schema';
import {
  EngineCandidateDocument,
  EngineCandidateSchema,
} from './schemas/engine-candidate.schema';
import {
  EngineJobDocument,
  EngineJobSchema,
} from './schemas/engine-job.schema';
import {
  EngineDraftPublicationDocument,
  EngineDraftPublicationSchema,
} from './schemas/engine-draft-publication.schema';

/**
 * Akwaan Content Engine — Phase 1 implementation (roadmap §30).
 *
 * Generated candidates remain isolated from canonical content until an Admin
 * completes human review. The review service then enters World Content only
 * through ContentItemService, and only to create a draft.
 *
 * No queue, no Redis, no scheduler. At this volume a Mongo-backed job with an
 * atomic claim is the simplest thing that is actually correct across processes.
 *
 * The controller is review-only: it cannot start generation, bind a provider,
 * mark content READY, or publish into gameplay.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: World.name, schema: WorldSchema },
      { name: Scope.name, schema: ScopeSchema },
      { name: ChallengeType.name, schema: ChallengeTypeSchema },
      {
        name: WorldChallengeConfiguration.name,
        schema: WorldChallengeConfigurationSchema,
      },
      { name: ContentItem.name, schema: ContentItemSchema },
      { name: EngineJobDocument.name, schema: EngineJobSchema },
      { name: EngineBudgetDocument.name, schema: EngineBudgetSchema },
      { name: EngineCostEntryDocument.name, schema: EngineCostEntrySchema },
      { name: EngineCandidateDocument.name, schema: EngineCandidateSchema },
      {
        name: EngineDraftPublicationDocument.name,
        schema: EngineDraftPublicationSchema,
      },
    ]),
  ],
  controllers: [ContentEngineReviewController, ContentEngineJobsController],
  providers: [
    {
      // The engine's own slot. See ENGINE_AI_PROVIDER for why this is not the
      // global AI_PROVIDER_TOKEN.
      //
      // Four independent conditions must hold before a paid call is possible:
      // the engine enabled, live mode explicitly on, a provider named, and a
      // key present. Any one missing leaves the slot unbound (`null`) and
      // generation impossible — which is the Phase 1b/1c behaviour, preserved.
      provide: ENGINE_AI_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): AiProvider | null => {
        const truthy = (key: string) =>
          ['true', '1', 'yes', 'on'].includes(
            config.get<string>(key)?.trim().toLowerCase() ?? '',
          );
        if (!truthy(CONTENT_ENGINE_ENABLED)) return null;
        if (!truthy(ENGINE_LIVE_PROVIDER_ENABLED)) return null;
        const name = config
          .get<string>('ENGINE_PROVIDER_NAME')
          ?.trim()
          .toLowerCase();
        if (name !== 'openrouter') return null;
        if (!config.get<string>('OPENROUTER_API_KEY')?.trim()) return null;
        return new OpenRouterAiProvider(config);
      },
    },
    {
      // Retrieval is also fail-closed. A production adapter can reuse the
      // existing research/cache stack without enabling it implicitly here.
      provide: FACT_EVIDENCE_RETRIEVER,
      inject: [ConfigService, WigoloClient],
      useFactory: (
        config: ConfigService,
        wigolo: WigoloClient,
      ): FactEvidenceRetriever | undefined => {
        const truthy = (key: string) =>
          ['true', '1', 'yes', 'on'].includes(
            config.get<string>(key)?.trim().toLowerCase() ?? '',
          );
        // Same shape as the provider slot: engine on, retrieval explicitly on,
        // and the underlying Wigolo stack enabled. Anything else leaves the
        // slot unbound, and every claim stays UNRESOLVED.
        if (!truthy(CONTENT_ENGINE_ENABLED)) return undefined;
        if (!truthy(ENGINE_EVIDENCE_RETRIEVAL_ENABLED)) return undefined;
        if (!truthy('WIGOLO_ENABLED')) return undefined;
        return new WigoloFactEvidenceRetriever(wigolo, config);
      },
    },
    WigoloClient,
    EnginePricingService,
    GenerationJobService,
    EngineBudgetService,
    WorldRepository,
    ScopeRepository,
    ChallengeTypeRepository,
    WorldChallengeConfigurationRepository,
    ContentItemRepository,
    ContentItemCompatibilityPolicy,
    ContentItemService,
    EngineJobAdminService,
    AuthoringContextService,
    CandidateGeneratorService,
    DeterministicScreenService,
    CandidateCompatibilityService,
    FactVerificationService,
    QualityJudgeService,
    ContentEngineOrchestratorService,
    ContentEngineReviewService,
  ],
  exports: [
    EnginePricingService,
    GenerationJobService,
    EngineBudgetService,
    AuthoringContextService,
    CandidateGeneratorService,
    DeterministicScreenService,
    CandidateCompatibilityService,
    FactVerificationService,
    QualityJudgeService,
    ContentEngineOrchestratorService,
  ],
})
export class ContentEngineModule {}
