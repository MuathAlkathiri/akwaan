import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import { Model } from 'mongoose';
import { AiProvider } from '../../ai-agent/domain/ai-provider.interface';
import { toScopeView } from '../../world-content/application/world-content.mapper';
import { ScopeCompatibilityPolicy } from '../../world-content/domain/scope-compatibility.policy';
import {
  ANSWER_MODE_COMPATIBLE_ITEM_MODES,
  ChallengeAnswerMode,
  WorldContentStatus,
} from '../../world-content/domain/world-content.constants';
import { ChallengeTypeRepository } from '../../world-content/persistence/challenge-type.repository';
import { ScopeRepository } from '../../world-content/persistence/scope.repository';
import { WorldChallengeConfigurationRepository } from '../../world-content/persistence/world-challenge-configuration.repository';
import { WorldRepository } from '../../world-content/persistence/world.repository';
import {
  BudgetExceededError,
  CONTENT_ENGINE_ENABLED,
  ENGINE_AI_PROVIDER,
  ENGINE_EVIDENCE_RETRIEVAL_ENABLED,
  ENGINE_LIVE_PROVIDER_ENABLED,
  microsToSar,
  PricingUnavailableError,
} from '../domain/content-engine.constants';
import {
  FACT_EVIDENCE_RETRIEVER,
  FactEvidenceRetriever,
} from '../domain/fact-verification.types';
import {
  RuleConflict,
  RuleConflictError,
  assertNoRuleConflicts,
} from '../domain/effective-rules';
import {
  GENERATION_SPEC_VERSION,
  GenerationSpecValidationError,
  GenerationSpecification,
  GeneratorAnswerMode,
  MAX_BATCH_GUIDANCE_LENGTH,
  RYO_REQUESTED_DIFFICULTIES,
  RyoDifficultyTargets,
  RyoRequestedDifficulty,
  buildGenerationSpecification,
  computePreflightPlanDigest,
  freezeGenerationSpecification,
  generatorAnswerModeFor,
  isGenerationSpecificationComplete,
  normalizeBatchGuidance,
  resolveMaxBatchSize,
  resolveOutputTokensPerCandidate,
  resolveRequestedDifficulty,
  resolveRyoMixedDifficultyTargets,
  validateTargetCount,
} from '../domain/generation-specification';
import {
  resolveCanonicalWorld,
  resolveCanonicalScope,
  resolveCanonicalChallengeType,
} from './authoring-target-resolver';
import {
  GenerationPlannerService,
  GenerationPlan,
} from './generation-planner.service';
import { HistoricalCoverageService } from './historical-coverage.service';
import { EngineCandidateDocument } from '../schemas/engine-candidate.schema';
import { EngineJobDocument } from '../schemas/engine-job.schema';
import {
  AuthoringContextService,
  AuthoringContextUnavailableError,
  ResolvedAuthoringContext,
} from './authoring-context.service';
import {
  composeGenerationPrompt,
  estimateGenerationPromptTokens,
} from './candidate-generator.service';
import { ContentEngineOrchestratorService } from './content-engine-orchestrator.service';
import { EngineBudgetService } from './engine-budget.service';
import { GenerationJobService } from './generation-job.service';
import {
  QUALITY_JUDGE_MAX_OUTPUT_TOKENS,
  estimateQualityJudgePromptTokens,
} from './quality-judge.service';

export interface EngineAdminActor {
  actorId: string;
  actorEmail: string;
}

export interface PreflightRequest {
  mechanicKey: string;
  worldKey: string;
  scopeKey: string;
  targetCount: number;
  difficulty?: RyoRequestedDifficulty | string | null;
  batchGuidance?: string | null;
}

export interface SubmitJobRequest extends PreflightRequest {
  planDigest?: string | null;
}

export interface PreflightDiagnostic {
  code: string;
  message: string;
}

interface RuntimeCompatibilityCheck {
  compatible: boolean;
  runtimeTargetResolved: boolean;
  onBoard: boolean;
  boardSlotKeys: string[];
  offBoardAuthoringAllowed: boolean;
  blockedCode?: string;
  blockedReason?: string;
}

/**
 * The Admin-facing seam for starting work.
 *
 * Resolves server-derived authoring options, computes read-only preflight plans
 * with a deterministic digest, validates and persists an immutable generation
 * specification on submission, attributes jobs to the authenticated Admin, and
 * executes only the exact targeted job requested.
 */
@Injectable()
export class EngineJobAdminService {
  private readonly logger = new Logger(EngineJobAdminService.name);
  /** In-flight `runJob` / `runNow` keys, so a double click cannot start two runs. */
  private readonly running = new Set<string>();

  constructor(
    @InjectModel(EngineCandidateDocument.name)
    private readonly candidates: Model<EngineCandidateDocument>,
    private readonly jobs: GenerationJobService,
    private readonly budget: EngineBudgetService,
    private readonly contexts: AuthoringContextService,
    private readonly orchestrator: ContentEngineOrchestratorService,
    private readonly config: ConfigService,
    @Optional() private readonly worlds?: WorldRepository,
    @Optional() private readonly scopes?: ScopeRepository,
    @Optional() private readonly challengeTypes?: ChallengeTypeRepository,
    @Optional()
    private readonly worldChallengeConfigs?: WorldChallengeConfigurationRepository,
    @Optional()
    @Inject(ENGINE_AI_PROVIDER)
    private readonly aiProvider?: AiProvider | null,
    @Optional()
    @Inject(FACT_EVIDENCE_RETRIEVER)
    private readonly factRetriever?: FactEvidenceRetriever | null,
    @Optional()
    private readonly historicalCoverage?: HistoricalCoverageService,
    @Optional()
    private readonly planner?: GenerationPlannerService,
  ) {}

  private truthy(key: string): boolean {
    return ['true', '1', 'yes', 'on'].includes(
      this.config.get<string>(key)?.trim().toLowerCase() ?? '',
    );
  }

  private isJudgeEligible(): boolean {
    if (this.factRetriever) return true;
    return (
      this.truthy(CONTENT_ENGINE_ENABLED) &&
      this.truthy(ENGINE_EVIDENCE_RETRIEVAL_ENABLED) &&
      this.truthy('WIGOLO_ENABLED')
    );
  }

  private estimateBatchCost(
    context: Pick<
      ResolvedAuthoringContext,
      'mechanicKey' | 'worldKey' | 'scopeKey'
    > &
      Partial<
        Pick<
          ResolvedAuthoringContext,
          'global' | 'mechanic' | 'world' | 'scope' | 'knowledge' | 'exemplars'
        >
      >,
    generationSpec: GenerationSpecification,
  ): {
    estimatedMicros: number;
    generationEstimatedMicros: number;
    conditionalJudgeEstimatedMicros: number;
    maxJudgeEstimatedMicros: number;
    judgeEligible: boolean;
    generationPromptTokens: number;
    generationMaxOutputTokens: number;
    judgeCallsExpected: number;
    judgePromptTokensPerCall: number;
    judgeMaxOutputTokensPerCall: number;
  } {
    const generationPrompt = composeGenerationPrompt(
      context,
      generationSpec.targetCount,
      generationSpec.answerMode,
      {
        difficulty: generationSpec.difficulty,
        ryoDifficultyTargets: generationSpec.ryoDifficultyTargets,
        batchGuidance: generationSpec.batchGuidance,
      },
      () => resolveRyoMixedDifficultyTargets(this.config),
    );
    const generationPromptTokens =
      estimateGenerationPromptTokens(generationPrompt);
    const generationMaxOutputTokens = generationSpec.maxOutputTokens;
    const generationEstimatedMicros = this.budget.estimate({
      provider: generationSpec.provider,
      model: generationSpec.generationModel,
      callsExpected: 1,
      expected: {
        promptTokens: generationPromptTokens,
        maxOutputTokens: generationMaxOutputTokens,
      },
    });

    const qualityModel =
      generationSpec.qualityModel ?? generationSpec.generationModel;
    const judgePromptTokensPerCall = estimateQualityJudgePromptTokens(
      context.mechanic ?? '',
    );
    const judgeMaxOutputTokensPerCall = QUALITY_JUDGE_MAX_OUTPUT_TOKENS;
    const maxJudgeEstimatedMicros = this.budget.estimate({
      provider: generationSpec.provider,
      model: qualityModel,
      callsExpected: generationSpec.targetCount,
      expected: {
        promptTokens: judgePromptTokensPerCall,
        maxOutputTokens: judgeMaxOutputTokensPerCall,
      },
    });

    const judgeEligible = this.isJudgeEligible();
    const judgeCallsExpected = judgeEligible ? generationSpec.targetCount : 0;
    const conditionalJudgeEstimatedMicros = judgeEligible
      ? maxJudgeEstimatedMicros
      : 0;
    const estimatedMicros =
      generationEstimatedMicros + conditionalJudgeEstimatedMicros;

    return {
      estimatedMicros,
      generationEstimatedMicros,
      conditionalJudgeEstimatedMicros,
      maxJudgeEstimatedMicros,
      judgeEligible,
      generationPromptTokens,
      generationMaxOutputTokens,
      judgeCallsExpected,
      judgePromptTokensPerCall,
      judgeMaxOutputTokensPerCall,
    };
  }

  maxBatchSize(): number {
    return resolveMaxBatchSize(this.config);
  }

  private resolveEngineReadiness(input?: {
    targetCount?: number;
    outputTokensPerCandidate?: number;
  }): {
    engineEnabled: boolean;
    provider: string | null;
    generationModel: string | null;
    qualityModel: string | null;
    providerConfigured: boolean;
    generationModelConfigured: boolean;
    qualityModelConfigured: boolean;
    liveProviderEnabled: boolean;
    providerReady: boolean;
    pricingConfigured: boolean;
    estimatedMicros?: number;
    estimatedSar?: number;
    submissionReady: boolean;
    blockedCode: string | null;
    blockedReason: string | null;
  } {
    const rawEnabled = this.config.get<string>(CONTENT_ENGINE_ENABLED);
    const engineEnabled =
      rawEnabled !== undefined
        ? this.truthy(CONTENT_ENGINE_ENABLED)
        : typeof this.jobs?.enabled === 'function'
          ? this.jobs.enabled()
          : false;
    const liveProviderEnabled = this.truthy(ENGINE_LIVE_PROVIDER_ENABLED);

    const configuredProvider =
      this.config.get<string>('ENGINE_PROVIDER_NAME')?.trim() || null;
    const configuredGenModel =
      this.config.get<string>('ENGINE_GENERATION_MODEL')?.trim() || null;
    const configuredQualityModel =
      this.config.get<string>('ENGINE_QUALITY_MODEL')?.trim() ||
      configuredGenModel;

    const providerConfigured = Boolean(configuredProvider);
    const generationModelConfigured = Boolean(configuredGenModel);
    const qualityModelConfigured = Boolean(configuredQualityModel);

    // Check whether the AI provider slot can execute.
    let providerReady = false;
    let providerBlockedCode: string | null = null;
    let providerBlockedReason: string | null = null;

    if (!engineEnabled) {
      providerBlockedCode = 'ENGINE_DISABLED';
      providerBlockedReason =
        'ENGINE_DISABLED: CONTENT_ENGINE_ENABLED must be enabled before submitting generation jobs';
    } else if (!providerConfigured) {
      providerBlockedCode = 'PROVIDER_NOT_CONFIGURED';
      providerBlockedReason =
        'PROVIDER_NOT_CONFIGURED: ENGINE_PROVIDER_NAME is not configured';
    } else if (!generationModelConfigured) {
      providerBlockedCode = 'GENERATION_MODEL_NOT_CONFIGURED';
      providerBlockedReason =
        'GENERATION_MODEL_NOT_CONFIGURED: ENGINE_GENERATION_MODEL is not configured';
    } else if (this.aiProvider === null) {
      providerBlockedCode = 'ENGINE_AI_PROVIDER_DISABLED';
      providerBlockedReason =
        'ENGINE_AI_PROVIDER_DISABLED: no AI provider is bound to the Content Engine';
    } else if (configuredProvider!.toLowerCase() !== 'fake') {
      if (!liveProviderEnabled) {
        providerBlockedCode = 'LIVE_PROVIDER_DISABLED';
        providerBlockedReason = `LIVE_PROVIDER_DISABLED: ENGINE_LIVE_PROVIDER_ENABLED must be enabled for provider "${configuredProvider}"`;
      } else if (
        configuredProvider!.toLowerCase() === 'openrouter' &&
        !this.config.get<string>('OPENROUTER_API_KEY')?.trim() &&
        !this.aiProvider
      ) {
        providerBlockedCode = 'PROVIDER_CREDENTIALS_MISSING';
        providerBlockedReason =
          'PROVIDER_CREDENTIALS_MISSING: OPENROUTER_API_KEY is required when ENGINE_PROVIDER_NAME is openrouter';
      } else {
        providerReady = true;
      }
    } else {
      providerReady = true;
    }

    const providerForPricing = configuredProvider ?? 'fake';
    const modelForPricing = configuredGenModel ?? 'fake-model';
    const qualityForPricing = configuredQualityModel ?? modelForPricing;
    const countForEstimate = input?.targetCount ?? 1;
    const perCandidateTokens =
      input?.outputTokensPerCandidate ??
      resolveOutputTokensPerCandidate(this.config);

    let pricingConfigured = false;
    let estimatedMicros: number | undefined;
    let pricingBlockedReason: string | null = null;

    if (typeof this.budget?.estimate === 'function') {
      try {
        const genProbe = this.budget.estimate({
          provider: providerForPricing,
          model: modelForPricing,
          callsExpected: 1,
          expected: {
            promptTokens: 1_000,
            maxOutputTokens: countForEstimate * perCandidateTokens,
          },
        });
        const judgeProbe = this.budget.estimate({
          provider: providerForPricing,
          model: qualityForPricing,
          callsExpected: countForEstimate,
          expected: {
            promptTokens: estimateQualityJudgePromptTokens(''),
            maxOutputTokens: QUALITY_JUDGE_MAX_OUTPUT_TOKENS,
          },
        });
        estimatedMicros = genProbe + (this.isJudgeEligible() ? judgeProbe : 0);
        pricingConfigured = true;
      } catch (error) {
        if (error instanceof PricingUnavailableError) {
          pricingConfigured = false;
          pricingBlockedReason = error.message;
        } else {
          throw error;
        }
      }
    }

    const blockedCode =
      providerBlockedCode ??
      (!pricingConfigured ? 'PRICING_NOT_CONFIGURED' : null);
    const blockedReason =
      providerBlockedReason ??
      (!pricingConfigured
        ? (pricingBlockedReason ??
          'PRICING_NOT_CONFIGURED: model pricing is not configured')
        : null);

    const submissionReady =
      engineEnabled &&
      providerConfigured &&
      generationModelConfigured &&
      qualityModelConfigured &&
      providerReady &&
      pricingConfigured;

    return {
      engineEnabled,
      provider: configuredProvider,
      generationModel: configuredGenModel,
      qualityModel: configuredQualityModel,
      providerConfigured,
      generationModelConfigured,
      qualityModelConfigured,
      liveProviderEnabled,
      providerReady,
      pricingConfigured,
      ...(estimatedMicros !== undefined
        ? {
            estimatedMicros,
            estimatedSar: microsToSar(estimatedMicros),
          }
        : {}),
      submissionReady,
      blockedCode,
      blockedReason,
    };
  }

  private async evaluateRuntimeCompatibility(input: {
    worldKey: string;
    scopeKey: string;
    mechanicKey: string;
    answerMode?: GeneratorAnswerMode;
  }): Promise<RuntimeCompatibilityCheck> {
    if (!this.worlds || !this.scopes || !this.challengeTypes) {
      return {
        compatible: true,
        runtimeTargetResolved: false,
        onBoard: false,
        boardSlotKeys: [],
        offBoardAuthoringAllowed: true,
      };
    }

    const [world, challengeType] = await Promise.all([
      resolveCanonicalWorld(this.worlds, input.worldKey),
      resolveCanonicalChallengeType(this.challengeTypes, input.mechanicKey),
    ]);

    if (world && world.status === WorldContentStatus.ARCHIVED) {
      const msg = `WORLD_ARCHIVED: World "${input.worldKey}" is archived and cannot accept new content`;
      return {
        compatible: false,
        runtimeTargetResolved: false,
        onBoard: false,
        boardSlotKeys: [],
        offBoardAuthoringAllowed: false,
        blockedCode: 'WORLD_ARCHIVED',
        blockedReason: msg,
      };
    }

    if (challengeType && challengeType.status === WorldContentStatus.ARCHIVED) {
      const msg = `CHALLENGE_TYPE_ARCHIVED: ChallengeType "${input.mechanicKey}" is archived and cannot accept new content`;
      return {
        compatible: false,
        runtimeTargetResolved: false,
        onBoard: false,
        boardSlotKeys: [],
        offBoardAuthoringAllowed: false,
        blockedCode: 'CHALLENGE_TYPE_ARCHIVED',
        blockedReason: msg,
      };
    }

    if (challengeType && input.answerMode) {
      const compatibleModes =
        ANSWER_MODE_COMPATIBLE_ITEM_MODES[challengeType.answerMode] ?? [];
      if (!compatibleModes.includes(input.answerMode as ChallengeAnswerMode)) {
        const msg = `ANSWER_MODE_INCOMPATIBLE: ChallengeType "${input.mechanicKey}" answerMode "${challengeType.answerMode}" is incompatible with generated item mode "${input.answerMode}"`;
        return {
          compatible: false,
          runtimeTargetResolved: false,
          onBoard: false,
          boardSlotKeys: [],
          offBoardAuthoringAllowed: false,
          blockedCode: 'ANSWER_MODE_INCOMPATIBLE',
          blockedReason: msg,
        };
      }
    }

    const scope = world
      ? await resolveCanonicalScope(
          this.scopes,
          String(world._id),
          input.scopeKey,
        )
      : null;

    if (world && !scope) {
      const allScopes = await this.scopes.list();
      const scopeInOtherWorld = allScopes.find(
        (candidate) =>
          candidate.slug === input.scopeKey &&
          String(candidate.worldId) !== String(world._id),
      );
      if (scopeInOtherWorld) {
        const msg = `SCOPE_WORLD_MISMATCH: Scope "${input.scopeKey}" belongs to a different World in runtime persistence`;
        return {
          compatible: false,
          runtimeTargetResolved: false,
          onBoard: false,
          boardSlotKeys: [],
          offBoardAuthoringAllowed: false,
          blockedCode: 'SCOPE_WORLD_MISMATCH',
          blockedReason: msg,
        };
      }
    }

    if (scope && scope.status === WorldContentStatus.ARCHIVED) {
      const msg = `SCOPE_ARCHIVED: Scope "${input.scopeKey}" is archived and cannot accept new content`;
      return {
        compatible: false,
        runtimeTargetResolved: false,
        onBoard: false,
        boardSlotKeys: [],
        offBoardAuthoringAllowed: false,
        blockedCode: 'SCOPE_ARCHIVED',
        blockedReason: msg,
      };
    }

    if (scope && challengeType) {
      const scopeView = toScopeView(scope);
      if (
        !ScopeCompatibilityPolicy.isChallengeTypeAllowed(
          scopeView,
          String(challengeType._id),
        )
      ) {
        const msg = `CHALLENGE_TYPE_EXCLUDED_BY_SCOPE: ChallengeType "${input.mechanicKey}" is excluded from Scope "${input.scopeKey}"`;
        return {
          compatible: false,
          runtimeTargetResolved: true,
          onBoard: false,
          boardSlotKeys: [],
          offBoardAuthoringAllowed: false,
          blockedCode: 'CHALLENGE_TYPE_EXCLUDED_BY_SCOPE',
          blockedReason: msg,
        };
      }
    }

    let boardSlotKeys: string[] = [];
    if (world && challengeType && this.worldChallengeConfigs) {
      const boardConfigs = await this.worldChallengeConfigs.listByWorld(
        String(world._id),
      );
      boardSlotKeys = boardConfigs
        .filter(
          (cfg) => String(cfg.challengeTypeId) === String(challengeType._id),
        )
        .map((cfg) => cfg.slotKey);
    }
    const onBoard = boardSlotKeys.length > 0;
    const runtimeTargetResolved = Boolean(world && scope && challengeType);

    return {
      compatible: true,
      runtimeTargetResolved,
      onBoard,
      boardSlotKeys,
      offBoardAuthoringAllowed: !onBoard,
    };
  }

  /**
   * Server-derived authoring options based on canonical World/Scope
   * eligibility, generator capability, and runtime ContentItem compatibility.
   */
  async options() {
    const catalog = this.contexts.catalog();
    const [
      runtimeWorlds,
      runtimeScopes,
      runtimeChallengeTypes,
      runtimeBoardConfigs,
    ] = await Promise.all([
      this.worlds ? this.worlds.list() : Promise.resolve([]),
      this.scopes ? this.scopes.list() : Promise.resolve([]),
      this.challengeTypes ? this.challengeTypes.list() : Promise.resolve([]),
      this.worldChallengeConfigs
        ? this.worldChallengeConfigs.list()
        : Promise.resolve([]),
    ]);

    const worldBySlug = new Map(runtimeWorlds.map((w) => [w.slug, w]));
    const challengeTypeBySlug = new Map(
      runtimeChallengeTypes.map((ct) => [ct.slug, ct]),
    );
    const challengeTypeById = new Map(
      runtimeChallengeTypes.map((ct) => [String(ct._id), ct]),
    );

    const scopeByWorldIdAndSlug = new Map<string, (typeof runtimeScopes)[0]>();
    for (const scope of runtimeScopes) {
      scopeByWorldIdAndSlug.set(
        `${String(scope.worldId)}/${scope.slug}`,
        scope,
      );
    }

    const boardSlotsByWorldAndChallenge = new Map<string, string[]>();
    for (const cfg of runtimeBoardConfigs) {
      const key = `${String(cfg.worldId)}:${String(cfg.challengeTypeId)}`;
      const slots = boardSlotsByWorldAndChallenge.get(key) ?? [];
      slots.push(cfg.slotKey);
      boardSlotsByWorldAndChallenge.set(key, slots);
    }

    let ryoExperimentalTargets: RyoDifficultyTargets | null = null;
    let ryoTargetsInvalidError: string | null = null;
    try {
      ryoExperimentalTargets = resolveRyoMixedDifficultyTargets(this.config);
    } catch (error) {
      ryoTargetsInvalidError =
        error instanceof Error ? error.message : String(error);
    }

    const mechanics = catalog.mechanics.map((mechanic) => {
      const answerMode = generatorAnswerModeFor(mechanic.mechanicKey) ?? null;
      const generatorSupported = Boolean(answerMode);
      const runtimeCt = challengeTypeBySlug.get(mechanic.mechanicKey) ?? null;
      const runtimeStatus = runtimeCt?.status ?? null;

      let blockedCode: string | null = null;
      let blockedReason: string | null = null;

      if (mechanic.status !== 'AUTHORABLE') {
        blockedCode = 'MECHANIC_NOT_AUTHORABLE';
        blockedReason = `AUTHORING_BLOCKED — MECHANIC_NOT_AUTHORABLE (${mechanic.mechanicKey})`;
      } else if (!mechanic.profilePresent) {
        blockedCode = 'REQUIRED_MECHANIC_PROFILE_MISSING';
        blockedReason = `AUTHORING_BLOCKED — REQUIRED_MECHANIC_PROFILE_MISSING (${mechanic.profilePath})`;
      } else if (!generatorSupported) {
        blockedCode = 'MECHANIC_NOT_GENERATABLE';
        blockedReason = `MECHANIC_NOT_GENERATABLE: no authored answer mode for mechanic "${mechanic.mechanicKey}"`;
      } else if (runtimeCt?.status === WorldContentStatus.ARCHIVED) {
        blockedCode = 'CHALLENGE_TYPE_ARCHIVED';
        blockedReason = `CHALLENGE_TYPE_ARCHIVED: ChallengeType "${mechanic.mechanicKey}" is archived`;
      } else if (runtimeCt && answerMode) {
        const allowedModes =
          ANSWER_MODE_COMPATIBLE_ITEM_MODES[runtimeCt.answerMode] ?? [];
        if (!allowedModes.includes(answerMode as ChallengeAnswerMode)) {
          blockedCode = 'ANSWER_MODE_INCOMPATIBLE';
          blockedReason = `ANSWER_MODE_INCOMPATIBLE: ChallengeType "${mechanic.mechanicKey}" answerMode "${runtimeCt.answerMode}" is incompatible with "${answerMode}"`;
        }
      }

      if (
        !blockedCode &&
        mechanic.mechanicKey === 'read-your-opponent' &&
        ryoTargetsInvalidError
      ) {
        blockedCode = 'RYO_DIFFICULTY_TARGETS_INVALID';
        blockedReason = ryoTargetsInvalidError;
      }

      const isRyo = mechanic.mechanicKey === 'read-your-opponent';
      const isClosest = mechanic.mechanicKey === 'closest';

      return {
        mechanicKey: mechanic.mechanicKey,
        aliases: mechanic.aliases,
        name: runtimeCt?.name ?? null,
        category:
          mechanic.category.toLowerCase() === 'signature'
            ? ('signature' as const)
            : ('standard' as const),
        boundWorldKey: mechanic.boundWorldKey,
        manifestStatus: mechanic.status,
        generatorSupported,
        answerMode,
        runtimeChallengeTypeId: runtimeCt ? String(runtimeCt._id) : null,
        runtimeStatus,
        runtimeTargetResolved: Boolean(runtimeCt),
        eligible: blockedCode === null,
        supportsDifficultySelection: isRyo,
        supportedDifficulties: isRyo ? [...RYO_REQUESTED_DIFFICULTIES] : [],
        defaultDifficulty: isRyo ? ('mixed' as const) : null,
        difficultyDeferredReason: isClosest
          ? 'CLOSEST_DIFFICULTY_DEFERRED'
          : null,
        experimentalDifficultyDistribution: isRyo
          ? ryoExperimentalTargets
          : null,
        blockedCode,
        blockedReason,
      };
    });

    const scopesByWorldKey = new Map<string, typeof catalog.scopes>();
    for (const scope of catalog.scopes) {
      const list = scopesByWorldKey.get(scope.worldKey) ?? [];
      list.push(scope);
      scopesByWorldKey.set(scope.worldKey, list);
    }

    const worlds = catalog.worlds.map((world) => {
      const runtimeWorld = worldBySlug.get(world.worldKey) ?? null;
      let worldBlockedCode: string | null = null;
      let worldBlockedReason: string | null = null;

      if (!catalog.globalProfilePresent) {
        worldBlockedCode = 'REQUIRED_GLOBAL_PROFILE_MISSING';
        worldBlockedReason =
          'AUTHORING_BLOCKED — REQUIRED_GLOBAL_PROFILE_MISSING';
      } else if (!world.profilePresent) {
        worldBlockedCode = 'REQUIRED_WORLD_PROFILE_MISSING';
        worldBlockedReason = `AUTHORING_BLOCKED — REQUIRED_WORLD_PROFILE_MISSING (${world.profilePath})`;
      } else if (runtimeWorld?.status === WorldContentStatus.ARCHIVED) {
        worldBlockedCode = 'WORLD_ARCHIVED';
        worldBlockedReason = `WORLD_ARCHIVED: World "${world.worldKey}" is archived`;
      }

      const worldScopes = (scopesByWorldKey.get(world.worldKey) ?? []).map(
        (scope) => {
          const runtimeScope = runtimeWorld
            ? (scopeByWorldIdAndSlug.get(
                `${String(runtimeWorld._id)}/${scope.scopeKey}`,
              ) ?? null)
            : null;

          const excludedMechanicKeys = (
            runtimeScope?.excludedChallengeTypeIds ?? []
          )
            .map((id) => challengeTypeById.get(String(id))?.slug)
            .filter((slug): slug is string => Boolean(slug));

          let scopeBlockedCode: string | null = worldBlockedCode;
          let scopeBlockedReason: string | null = worldBlockedReason;

          if (!scopeBlockedCode) {
            if (!scope.scopeProfilePresent) {
              scopeBlockedCode = 'REQUIRED_SCOPE_PROFILE_MISSING';
              scopeBlockedReason = `AUTHORING_BLOCKED — REQUIRED_SCOPE_PROFILE_MISSING (${scope.scopePath})`;
            } else if (!scope.knowledgePresent) {
              scopeBlockedCode = 'REQUIRED_SCOPE_KNOWLEDGE_MISSING';
              scopeBlockedReason = `AUTHORING_BLOCKED — REQUIRED_SCOPE_KNOWLEDGE_MISSING (${scope.knowledgePath})`;
            } else if (runtimeScope?.status === WorldContentStatus.ARCHIVED) {
              scopeBlockedCode = 'SCOPE_ARCHIVED';
              scopeBlockedReason = `SCOPE_ARCHIVED: Scope "${scope.scopeKey}" is archived`;
            }
          }

          const scopeMechanics = mechanics.map((mechanic) => {
            const runtimeCt =
              challengeTypeBySlug.get(mechanic.mechanicKey) ?? null;
            const boardSlotKeys =
              runtimeWorld && runtimeCt
                ? (boardSlotsByWorldAndChallenge.get(
                    `${String(runtimeWorld._id)}:${String(runtimeCt._id)}`,
                  ) ?? [])
                : [];
            const onBoard = boardSlotKeys.length > 0;
            const runtimeTargetResolved = Boolean(
              runtimeWorld && runtimeScope && runtimeCt,
            );

            let comboBlockedCode: string | null = null;
            let comboBlockedReason: string | null = null;

            if (mechanic.manifestStatus !== 'AUTHORABLE') {
              comboBlockedCode = 'MECHANIC_NOT_AUTHORABLE';
              comboBlockedReason = `AUTHORING_BLOCKED — MECHANIC_NOT_AUTHORABLE (${mechanic.mechanicKey})`;
            } else if (
              mechanic.category === 'signature' &&
              mechanic.boundWorldKey &&
              mechanic.boundWorldKey !== world.worldKey
            ) {
              comboBlockedCode = 'MECHANIC_WORLD_MISMATCH';
              comboBlockedReason = `AUTHORING_BLOCKED — MECHANIC_WORLD_MISMATCH (${mechanic.mechanicKey} is bound to ${mechanic.boundWorldKey}, not ${world.worldKey})`;
            } else if (scopeBlockedCode) {
              comboBlockedCode = scopeBlockedCode;
              comboBlockedReason = scopeBlockedReason;
            } else if (
              runtimeScope &&
              runtimeCt &&
              !ScopeCompatibilityPolicy.isChallengeTypeAllowed(
                toScopeView(runtimeScope),
                String(runtimeCt._id),
              )
            ) {
              comboBlockedCode = 'CHALLENGE_TYPE_EXCLUDED_BY_SCOPE';
              comboBlockedReason = `CHALLENGE_TYPE_EXCLUDED_BY_SCOPE: ChallengeType "${mechanic.mechanicKey}" is excluded from Scope "${scope.scopeKey}"`;
            } else if (mechanic.blockedCode) {
              comboBlockedCode = mechanic.blockedCode;
              comboBlockedReason = mechanic.blockedReason;
            } else {
              // Verify canonical context resolution and rule conflicts for
              // combinations that pass all static and runtime checks.
              try {
                const resolved = this.contexts.resolve(
                  {
                    mechanicKey: mechanic.mechanicKey,
                    worldKey: world.worldKey,
                    scopeKey: scope.scopeKey,
                  },
                  { quiet: true },
                );
                if (resolved.effectiveRules.conflicts.length > 0) {
                  comboBlockedCode = 'AUTHORING_RULE_CONFLICT';
                  comboBlockedReason = new RuleConflictError(
                    resolved.effectiveRules.conflicts,
                  ).message;
                }
              } catch (error) {
                if (error instanceof AuthoringContextUnavailableError) {
                  comboBlockedCode = error.code;
                  comboBlockedReason = error.message;
                } else {
                  throw error;
                }
              }
            }

            const authorable =
              comboBlockedCode === null ||
              comboBlockedCode === 'MECHANIC_NOT_GENERATABLE';
            const runtimeCompatible = ![
              'WORLD_ARCHIVED',
              'SCOPE_ARCHIVED',
              'CHALLENGE_TYPE_ARCHIVED',
              'CHALLENGE_TYPE_EXCLUDED_BY_SCOPE',
              'SIGNATURE_CHALLENGE_WORLD_MISMATCH',
              'ANSWER_MODE_INCOMPATIBLE',
            ].includes(comboBlockedCode ?? '');
            const eligible = comboBlockedCode === null;

            return {
              mechanicKey: mechanic.mechanicKey,
              category: mechanic.category,
              boundWorldKey: mechanic.boundWorldKey,
              manifestStatus: mechanic.manifestStatus,
              generatorSupported: mechanic.generatorSupported,
              answerMode: mechanic.answerMode,
              authorable,
              runtimeCompatible,
              runtimeTargetResolved,
              eligible,
              onBoard,
              offBoardAuthoringAllowed: eligible && !onBoard,
              boardSlotKeys,
              supportsDifficultySelection: mechanic.supportsDifficultySelection,
              supportedDifficulties: mechanic.supportedDifficulties,
              defaultDifficulty: mechanic.defaultDifficulty,
              difficultyDeferredReason: mechanic.difficultyDeferredReason,
              blockedCode: comboBlockedCode,
              blockedReason: comboBlockedReason,
            };
          });

          const hasEligibleMechanic = scopeMechanics.some((m) => m.eligible);

          return {
            scopeKey: scope.scopeKey,
            worldKey: world.worldKey,
            name: runtimeScope?.name ?? null,
            runtimeScopeId: runtimeScope ? String(runtimeScope._id) : null,
            runtimeStatus: runtimeScope?.status ?? null,
            runtimeTargetResolved: Boolean(runtimeScope),
            exemplarsPresent: scope.exemplarsPresent,
            excludedMechanicKeys,
            eligible: scopeBlockedCode === null && hasEligibleMechanic,
            blockedCode: scopeBlockedCode,
            blockedReason: scopeBlockedReason,
            mechanics: scopeMechanics,
          };
        },
      );

      const hasEligibleScope = worldScopes.some((s) => s.eligible);

      return {
        worldKey: world.worldKey,
        name: runtimeWorld?.name ?? null,
        runtimeWorldId: runtimeWorld ? String(runtimeWorld._id) : null,
        runtimeStatus: runtimeWorld?.status ?? null,
        runtimeTargetResolved: Boolean(runtimeWorld),
        eligible: worldBlockedCode === null && hasEligibleScope,
        blockedCode: worldBlockedCode,
        blockedReason: worldBlockedReason,
        scopes: worldScopes,
      };
    });

    const engineReadiness = this.resolveEngineReadiness();

    return {
      specVersion: GENERATION_SPEC_VERSION,
      limits: {
        minTargetCount: 1,
        maxTargetCount: this.maxBatchSize(),
        maxBatchGuidanceLength: MAX_BATCH_GUIDANCE_LENGTH,
      },
      engine: engineReadiness,
      worlds,
      scopes: worlds.flatMap((w) => w.scopes),
      mechanics,
    };
  }

  /**
   * Everything a human needs before spending: is the combination authorable,
   * what will it cost, and is there room.
   *
   * Strictly read-only. Never mutates jobs, candidates, budget documents, or
   * canonical content. Returns a deterministic `planDigest` and immutable
   * `generationSpec` for resolvable combinations.
   */
  async preflight(input: PreflightRequest): Promise<{
    resolvable: boolean;
    submissionReady?: boolean;
    planDigest?: string;
    generationPlan?: GenerationPlan;
    generationSpec?: GenerationSpecification;
    contextHash?: string;
    ruleSetDigest?: string;
    estimatedMicros?: number;
    estimatedSar?: number;
    totalEstimatedMicros?: number;
    totalEstimatedSar?: number;
    generationEstimatedMicros?: number;
    conditionalJudgeEstimatedMicros?: number;
    maxJudgeEstimatedMicros?: number;
    judgeEligible?: boolean;
    pricingConfigured: boolean;
    liveProviderEnabled: boolean;
    engineEnabled: boolean;
    providerConfigured?: boolean;
    providerReady?: boolean;
    onBoard?: boolean;
    offBoardAuthoringAllowed?: boolean;
    boardSlotKeys?: string[];
    withinBatchCap?: boolean;
    withinMonthlyBudget?: boolean;
    budget: Awaited<ReturnType<EngineBudgetService['snapshot']>>;
    /** Whether CandidateGeneratorService has an authored answer mode. */
    generatorSupported?: boolean;
    diagnostic?: PreflightDiagnostic;
    blockedCode?: string;
    blockedReason?: string;
    ruleConflicts?: RuleConflict[];
  }> {
    const budget = await this.budget.snapshot();
    const engineEnabled = this.truthy(CONTENT_ENGINE_ENABLED);
    const liveProviderEnabled = this.truthy(ENGINE_LIVE_PROVIDER_ENABLED);

    let resolvedContext: ResolvedAuthoringContext | undefined;
    let contextHash: string | undefined;
    let resolvedMechanicKey: string | undefined;
    let resolvedWorldKey: string | undefined;
    let resolvedScopeKey: string | undefined;
    let ruleSetDigest: string | undefined;
    let ruleConflicts: RuleConflict[] = [];
    try {
      const context = this.contexts.resolve(input);
      resolvedContext = context;
      contextHash = context.contextHash;
      resolvedMechanicKey = context.mechanicKey;
      resolvedWorldKey = context.worldKey ?? input.worldKey;
      resolvedScopeKey = context.scopeKey ?? input.scopeKey;
      ruleSetDigest =
        context.effectiveRules?.digest ??
        createHash('sha256').update(context.contextHash).digest('hex');
      ruleConflicts = context.effectiveRules?.conflicts ?? [];
    } catch (error) {
      if (error instanceof AuthoringContextUnavailableError) {
        return {
          resolvable: false,
          submissionReady: false,
          pricingConfigured: false,
          liveProviderEnabled,
          engineEnabled,
          budget,
          blockedCode: error.code,
          blockedReason: error.message,
        };
      }
      throw error;
    }

    // A structurally conflicting configuration is reported here rather than
    // discovered after a paid call. The conflicts travel as data so a reviewer
    // sees which layer attempted what, against which constraint.
    if (ruleConflicts.length) {
      return {
        resolvable: false,
        submissionReady: false,
        contextHash,
        ruleSetDigest,
        pricingConfigured: false,
        liveProviderEnabled,
        engineEnabled,
        budget,
        blockedCode: 'AUTHORING_RULE_CONFLICT',
        blockedReason: new RuleConflictError(ruleConflicts).message,
        ruleConflicts,
      };
    }

    const answerMode = generatorAnswerModeFor(resolvedMechanicKey!);
    if (!answerMode) {
      const message = `MECHANIC_NOT_GENERATABLE: no authored answer mode for mechanic "${resolvedMechanicKey}"`;
      return {
        resolvable: true,
        submissionReady: false,
        contextHash,
        ruleSetDigest,
        pricingConfigured: false,
        liveProviderEnabled,
        engineEnabled,
        budget,
        generatorSupported: false,
        diagnostic: { code: 'MECHANIC_NOT_GENERATABLE', message },
        blockedCode: 'MECHANIC_NOT_GENERATABLE',
        blockedReason: message,
      };
    }

    // Validate candidate count capacity, difficulty, and batch guidance.
    try {
      validateTargetCount(input.targetCount, this.maxBatchSize());
      resolveRequestedDifficulty(resolvedMechanicKey!, input.difficulty);
      normalizeBatchGuidance(input.batchGuidance);
    } catch (error) {
      if (error instanceof GenerationSpecValidationError) {
        return {
          resolvable: false,
          submissionReady: false,
          contextHash,
          ruleSetDigest,
          pricingConfigured: false,
          liveProviderEnabled,
          engineEnabled,
          budget,
          generatorSupported: true,
          diagnostic: { code: error.code, message: error.message },
          blockedCode: error.code,
          blockedReason: error.message,
        };
      }
      throw error;
    }

    // Validate canonical runtime compatibility (archived entities, Scope
    // exclusions, signature bindings, on-board vs off-board status).
    const runtimeCheck = await this.evaluateRuntimeCompatibility({
      worldKey: resolvedWorldKey!,
      scopeKey: resolvedScopeKey!,
      mechanicKey: resolvedMechanicKey!,
      answerMode,
    });
    if (!runtimeCheck.compatible) {
      return {
        resolvable: false,
        submissionReady: false,
        contextHash,
        ruleSetDigest,
        pricingConfigured: false,
        liveProviderEnabled,
        engineEnabled,
        budget,
        generatorSupported: true,
        onBoard: runtimeCheck.onBoard,
        offBoardAuthoringAllowed: false,
        boardSlotKeys: runtimeCheck.boardSlotKeys,
        diagnostic: {
          code: runtimeCheck.blockedCode!,
          message: runtimeCheck.blockedReason!,
        },
        blockedCode: runtimeCheck.blockedCode,
        blockedReason: runtimeCheck.blockedReason,
      };
    }

    let generationSpec: GenerationSpecification;
    try {
      generationSpec = buildGenerationSpecification({
        config: this.config,
        context: {
          worldKey: resolvedWorldKey!,
          scopeKey: resolvedScopeKey!,
          mechanicKey: resolvedMechanicKey!,
          contextHash: contextHash!,
          effectiveRules: {
            version: 1,
            digest: ruleSetDigest!,
            rules: [],
            resolved: [],
            conflicts: [],
            structuredSources: [],
          },
        },
        targetCount: input.targetCount,
        difficulty: input.difficulty,
        batchGuidance: input.batchGuidance,
      });
    } catch (error) {
      if (error instanceof GenerationSpecValidationError) {
        return {
          resolvable: false,
          submissionReady: false,
          contextHash,
          ruleSetDigest,
          pricingConfigured: false,
          liveProviderEnabled,
          engineEnabled,
          budget,
          generatorSupported: true,
          diagnostic: { code: error.code, message: error.message },
          blockedCode: error.code,
          blockedReason: error.message,
        };
      }
      throw error;
    }

    const readiness = this.resolveEngineReadiness({
      targetCount: generationSpec.targetCount,
      outputTokensPerCandidate: generationSpec.outputTokensPerCandidate,
    });

    try {
      const costPlan = this.estimateBatchCost(resolvedContext!, generationSpec);
      const {
        estimatedMicros,
        generationEstimatedMicros,
        conditionalJudgeEstimatedMicros,
        maxJudgeEstimatedMicros,
        judgeEligible,
      } = costPlan;

      const batchCapMicros =
        typeof this.budget.batchCapMicros === 'function'
          ? this.budget.batchCapMicros()
          : undefined;
      const totalEstimatedMicros =
        generationEstimatedMicros + maxJudgeEstimatedMicros;
      const withinBatchCap =
        batchCapMicros !== undefined
          ? totalEstimatedMicros <= batchCapMicros
          : true;
      const withinMonthlyBudget =
        totalEstimatedMicros <= budget.availableMicros;

      const planDigest = computePreflightPlanDigest({
        spec: generationSpec,
        estimatedMicros,
        pricingConfigured: true,
        engineEnabled,
        liveProviderEnabled,
        providerReady: readiness.providerReady,
      });

      const planner =
        this.planner ??
        new GenerationPlannerService(this.contexts, this.historicalCoverage);
      let generationPlan: GenerationPlan;
      try {
        generationPlan = await planner.planWithResolvedContext({
          worldKey: generationSpec.worldKey,
          scopeKey: generationSpec.scopeKey,
          mechanicKey: generationSpec.mechanicKey,
          count: generationSpec.targetCount,
          difficulty: generationSpec.difficulty,
          batchGuidance: generationSpec.batchGuidance,
        });
      } catch {
        generationPlan = planner.plan({
          worldKey: generationSpec.worldKey,
          scopeKey: generationSpec.scopeKey,
          mechanicKey: generationSpec.mechanicKey,
          count: generationSpec.targetCount,
          difficulty: generationSpec.difficulty,
          batchGuidance: generationSpec.batchGuidance,
        });
      }

      const submissionReady =
        readiness.submissionReady && withinBatchCap && withinMonthlyBudget;
      const blockedCode = !readiness.submissionReady
        ? (readiness.blockedCode ?? undefined)
        : !withinBatchCap
          ? 'BATCH_CAP_EXCEEDED'
          : !withinMonthlyBudget
            ? 'MONTHLY_BUDGET_EXCEEDED'
            : undefined;
      const blockedReason = !readiness.submissionReady
        ? (readiness.blockedReason ?? undefined)
        : !withinBatchCap
          ? `BATCH_CAP_EXCEEDED: estimated total job cost ${totalEstimatedMicros} micros exceeds batch cap ${batchCapMicros} micros`
          : !withinMonthlyBudget
            ? `MONTHLY_BUDGET_EXCEEDED: estimated total job cost ${totalEstimatedMicros} micros exceeds available monthly budget ${budget.availableMicros} micros`
            : undefined;

      return {
        resolvable: true,
        submissionReady,
        planDigest,
        generationPlan,
        generationSpec,
        contextHash,
        ruleSetDigest,
        estimatedMicros,
        estimatedSar: microsToSar(estimatedMicros),
        totalEstimatedMicros,
        totalEstimatedSar: microsToSar(totalEstimatedMicros),
        generationEstimatedMicros,
        conditionalJudgeEstimatedMicros,
        maxJudgeEstimatedMicros,
        judgeEligible,
        pricingConfigured: true,
        liveProviderEnabled,
        engineEnabled,
        providerConfigured: readiness.providerConfigured,
        providerReady: readiness.providerReady,
        onBoard: runtimeCheck.onBoard,
        offBoardAuthoringAllowed: runtimeCheck.offBoardAuthoringAllowed,
        boardSlotKeys: runtimeCheck.boardSlotKeys,
        withinBatchCap,
        withinMonthlyBudget,
        budget,
        generatorSupported: true,
        ...(blockedCode ? { blockedCode, blockedReason } : {}),
      };
    } catch (error) {
      if (error instanceof PricingUnavailableError) {
        // Not an error state for a preflight — it is the answer. No price, no
        // estimate, and the engine will refuse to reserve later for the same
        // reason.
        const planDigest = computePreflightPlanDigest({
          spec: generationSpec,
          estimatedMicros: null,
          pricingConfigured: false,
          engineEnabled,
          liveProviderEnabled,
          providerReady: readiness.providerReady,
        });
        return {
          resolvable: true,
          submissionReady: false,
          planDigest,
          generationSpec,
          contextHash,
          ruleSetDigest,
          pricingConfigured: false,
          liveProviderEnabled,
          engineEnabled,
          providerConfigured: readiness.providerConfigured,
          providerReady: readiness.providerReady,
          onBoard: runtimeCheck.onBoard,
          offBoardAuthoringAllowed: runtimeCheck.offBoardAuthoringAllowed,
          boardSlotKeys: runtimeCheck.boardSlotKeys,
          budget,
          generatorSupported: true,
          blockedCode: 'PRICING_NOT_CONFIGURED',
          blockedReason: error.message,
        };
      }
      throw error;
    }
  }

  /**
   * Submit a generation job idempotently.
   *
   * Enforces candidate capacity limits, canonical World/Scope/mechanic
   * compatibility, difficulty and guidance constraints, provider/model/pricing/
   * live flag completeness, preflight plan digest matching, and authenticated
   * Admin attribution.
   */
  async submit(
    input: SubmitJobRequest,
    actor?: EngineAdminActor,
  ): Promise<{
    jobId: string;
    created: boolean;
    contextHash: string;
    planDigest?: string;
    generationSpec?: GenerationSpecification;
    createdBy?: string | null;
    createdByEmail?: string | null;
  }> {
    try {
      validateTargetCount(input.targetCount, this.maxBatchSize());
    } catch (error) {
      if (error instanceof GenerationSpecValidationError) {
        throw new BadRequestException({
          code: error.code,
          message: error.message,
        });
      }
      throw error;
    }

    let resolvedContext: ResolvedAuthoringContext;
    let contextHash: string;
    let resolvedMechanicKey: string;
    let resolvedWorldKey: string;
    let resolvedScopeKey: string;
    let ruleSetDigest: string;
    try {
      const context = this.contexts.resolve(input);
      assertNoRuleConflicts(context.effectiveRules);
      resolvedContext = context;
      contextHash = context.contextHash;
      resolvedMechanicKey = context.mechanicKey;
      resolvedWorldKey = context.worldKey ?? input.worldKey;
      resolvedScopeKey = context.scopeKey ?? input.scopeKey;
      ruleSetDigest =
        context.effectiveRules?.digest ??
        createHash('sha256').update(context.contextHash).digest('hex');
    } catch (error) {
      if (
        error instanceof AuthoringContextUnavailableError ||
        error instanceof RuleConflictError
      ) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    // Submission must enforce the same capability boundary as preflight. A
    // caller may skip preflight, and an unsupported mechanic must never become
    // a persisted job that can later reach queueing, budgeting, or a provider.
    const answerMode = generatorAnswerModeFor(resolvedMechanicKey);
    if (!answerMode) {
      const message = `MECHANIC_NOT_GENERATABLE: no authored answer mode for mechanic "${resolvedMechanicKey}"`;
      throw new BadRequestException({
        code: 'MECHANIC_NOT_GENERATABLE',
        message,
      });
    }

    let generationSpec: GenerationSpecification;
    try {
      generationSpec = buildGenerationSpecification({
        config: this.config,
        context: {
          worldKey: resolvedWorldKey,
          scopeKey: resolvedScopeKey,
          mechanicKey: resolvedMechanicKey,
          contextHash,
          effectiveRules: {
            version: 1,
            digest: ruleSetDigest,
            rules: [],
            resolved: [],
            conflicts: [],
            structuredSources: [],
          },
        },
        targetCount: input.targetCount,
        difficulty: input.difficulty,
        batchGuidance: input.batchGuidance,
      });
    } catch (error) {
      if (error instanceof GenerationSpecValidationError) {
        throw new BadRequestException({
          code: error.code,
          message: error.message,
        });
      }
      throw error;
    }

    const runtimeCheck = await this.evaluateRuntimeCompatibility({
      worldKey: resolvedWorldKey,
      scopeKey: resolvedScopeKey,
      mechanicKey: resolvedMechanicKey,
      answerMode,
    });
    if (!runtimeCheck.compatible) {
      throw new BadRequestException({
        code: runtimeCheck.blockedCode,
        message: runtimeCheck.blockedReason,
      });
    }

    // Enforce provider, model, pricing, and live flags when budget/config is wired.
    const hasExplicitEngineConfig =
      this.config.get<string>(CONTENT_ENGINE_ENABLED) !== undefined ||
      this.config.get<string>('ENGINE_PROVIDER_NAME') !== undefined ||
      this.config.get<string>('ENGINE_GENERATION_MODEL') !== undefined ||
      typeof this.budget?.estimate === 'function' ||
      this.aiProvider !== undefined;

    let currentPlanDigest: string | undefined;
    if (hasExplicitEngineConfig) {
      const readiness = this.resolveEngineReadiness({
        targetCount: generationSpec.targetCount,
        outputTokensPerCandidate: generationSpec.outputTokensPerCandidate,
      });
      if (!readiness.submissionReady) {
        throw new BadRequestException({
          code: readiness.blockedCode ?? 'PROVIDER_CONFIG_INCOMPLETE',
          message:
            readiness.blockedReason ??
            'PROVIDER_CONFIG_INCOMPLETE: provider, model, pricing, or live flags are incomplete',
        });
      }

      const costPlan = this.estimateBatchCost(resolvedContext, generationSpec);
      const { estimatedMicros } = costPlan;
      const totalEstimatedMicros =
        costPlan.generationEstimatedMicros + costPlan.maxJudgeEstimatedMicros;

      const budget =
        typeof this.budget?.snapshot === 'function'
          ? await this.budget.snapshot()
          : undefined;
      const batchCapMicros =
        typeof this.budget?.batchCapMicros === 'function'
          ? this.budget.batchCapMicros()
          : undefined;
      if (
        batchCapMicros !== undefined &&
        totalEstimatedMicros > batchCapMicros
      ) {
        throw new BadRequestException({
          code: 'BATCH_CAP_EXCEEDED',
          message: `BATCH_CAP_EXCEEDED: estimated total job cost ${totalEstimatedMicros} micros exceeds batch cap ${batchCapMicros} micros`,
        });
      }
      if (budget && totalEstimatedMicros > budget.availableMicros) {
        throw new BadRequestException({
          code: 'MONTHLY_BUDGET_EXCEEDED',
          message: `MONTHLY_BUDGET_EXCEEDED: estimated total job cost ${totalEstimatedMicros} micros exceeds available monthly budget ${budget.availableMicros} micros`,
        });
      }

      currentPlanDigest = computePreflightPlanDigest({
        spec: generationSpec,
        estimatedMicros,
        pricingConfigured: true,
        engineEnabled: readiness.engineEnabled,
        liveProviderEnabled: readiness.liveProviderEnabled,
        providerReady: readiness.providerReady,
      });

      const suppliedDigest = input.planDigest?.trim();
      if (!suppliedDigest) {
        throw new BadRequestException({
          code: 'PREFLIGHT_PLAN_DIGEST_REQUIRED',
          message:
            'PREFLIGHT_PLAN_DIGEST_REQUIRED: planDigest from preflight is required before submitting a job',
        });
      }
      if (suppliedDigest !== currentPlanDigest) {
        throw new ConflictException({
          code: 'PREFLIGHT_PLAN_DRIFT',
          message:
            'PREFLIGHT_PLAN_DRIFT: generation plan has changed since preflight; run preflight again before submitting',
        });
      }
    } else if (input.planDigest !== undefined) {
      const engineEnabled = this.truthy(CONTENT_ENGINE_ENABLED);
      const liveProviderEnabled = this.truthy(ENGINE_LIVE_PROVIDER_ENABLED);
      currentPlanDigest = computePreflightPlanDigest({
        spec: generationSpec,
        estimatedMicros: null,
        pricingConfigured: false,
        engineEnabled,
        liveProviderEnabled,
        providerReady: true,
      });
      const suppliedDigest = input.planDigest?.trim();
      if (!suppliedDigest) {
        throw new BadRequestException({
          code: 'PREFLIGHT_PLAN_DIGEST_REQUIRED',
          message:
            'PREFLIGHT_PLAN_DIGEST_REQUIRED: planDigest from preflight is required before submitting a job',
        });
      }
      if (suppliedDigest !== currentPlanDigest) {
        throw new ConflictException({
          code: 'PREFLIGHT_PLAN_DRIFT',
          message:
            'PREFLIGHT_PLAN_DRIFT: generation plan has changed since preflight; run preflight again before submitting',
        });
      }
    }

    const result = await this.jobs.submit({
      mechanicKey: input.mechanicKey,
      worldKey: input.worldKey,
      scopeKey: input.scopeKey,
      targetCount: input.targetCount,
      // The context hash is part of the request identity: a Skill edit makes
      // this genuinely different work, while a repeated click does not.
      contextRevision: contextHash,
      generationSpec,
      ...(currentPlanDigest ? { planDigest: currentPlanDigest } : {}),
      ...(actor
        ? {
            createdBy: actor.actorId,
            createdByEmail: actor.actorEmail,
          }
        : {}),
    });
    this.logger.log({
      event: 'engine_job_submitted',
      jobId: result.jobId,
      created: result.created,
      mechanicKey: input.mechanicKey,
      scopeKey: input.scopeKey,
      actorId: actor?.actorId ?? null,
    });
    return {
      jobId: result.jobId,
      created: result.created,
      contextHash,
      ...(currentPlanDigest ? { planDigest: currentPlanDigest } : {}),
      ...(result.generationSpec
        ? { generationSpec: result.generationSpec }
        : {}),
      ...(actor
        ? {
            createdBy: actor.actorId,
            createdByEmail: actor.actorEmail,
          }
        : {}),
    };
  }

  /**
   * Execute one exact job by `jobId`, attributed to the authenticated Admin.
   *
   * Never leases or executes a different queued job, and fails closed if the
   * target job is a legacy record with insufficient provenance.
   */
  async runJob(
    jobId: string,
    actor: EngineAdminActor,
  ): Promise<{ jobId: string | null; alreadyRunning: boolean }> {
    const trimmedJobId = jobId?.trim();
    if (!trimmedJobId) {
      throw new BadRequestException({
        code: 'JOB_ID_REQUIRED',
        message:
          'JOB_ID_REQUIRED: exact jobId is required to execute a generation job',
      });
    }
    if (!actor?.actorId?.trim()) {
      throw new BadRequestException({
        code: 'AUTHENTICATED_ADMIN_REQUIRED',
        message:
          'AUTHENTICATED_ADMIN_REQUIRED: authenticated Admin identity is required to run a job',
      });
    }

    const owner = `admin:${actor.actorId.trim()}`;
    if (this.running.has(trimmedJobId) || this.running.has(owner)) {
      return { jobId: trimmedJobId, alreadyRunning: true };
    }

    const existing = await this.jobs.findById(trimmedJobId);
    if (!existing) {
      throw new NotFoundException(`Job ${trimmedJobId} not found`);
    }

    if (existing.status === 'leased') {
      const now = new Date();
      if (!existing.leaseExpiresAt || existing.leaseExpiresAt >= now) {
        return { jobId: trimmedJobId, alreadyRunning: true };
      }
    }

    if (
      existing.cancellationRequested ||
      existing.status === 'cancelled' ||
      existing.status === 'completed' ||
      existing.status === 'failed' ||
      existing.status === 'awaiting_review'
    ) {
      throw new ConflictException({
        code: 'JOB_NOT_RUNNABLE',
        message: `JOB_NOT_RUNNABLE: job ${trimmedJobId} is in status "${existing.status}"`,
      });
    }

    if (
      !isGenerationSpecificationComplete(existing.generationSpec) ||
      existing.generationSpec.mechanicKey !== existing.mechanicKey ||
      existing.generationSpec.worldKey !== existing.worldKey ||
      existing.generationSpec.scopeKey !== existing.scopeKey ||
      existing.generationSpec.targetCount !== existing.targetCount
    ) {
      throw new ConflictException({
        code: 'JOB_PROVENANCE_INSUFFICIENT',
        message: `JOB_PROVENANCE_INSUFFICIENT: job ${trimmedJobId} lacks a complete generationSpecification and cannot be executed`,
      });
    }

    this.running.add(trimmedJobId);
    this.running.add(owner);
    try {
      const result = await this.orchestrator.runJob(trimmedJobId, owner, {
        actorId: actor.actorId.trim(),
        actorEmail: actor.actorEmail?.trim() ?? null,
      });
      return { jobId: result?.jobId ?? null, alreadyRunning: false };
    } catch (error) {
      if (error instanceof BudgetExceededError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    } finally {
      this.running.delete(trimmedJobId);
      this.running.delete(owner);
    }
  }

  /**
   * Run one job now, under an explicit owner.
   *
   * Two guards against a double click: the in-process set below, and — the one
   * that actually matters across processes — the job lease the orchestrator
   * takes. The set only spares the database a pointless contended claim.
   */
  async runNow(
    owner: string,
    jobId?: string,
    actor?: EngineAdminActor,
  ): Promise<{ jobId: string | null; alreadyRunning: boolean }> {
    if (jobId) {
      return this.runJob(
        jobId,
        actor ?? {
          actorId: owner.replace(/^admin:/, ''),
          actorEmail: '',
        },
      );
    }
    if (this.running.has(owner)) return { jobId: null, alreadyRunning: true };
    this.running.add(owner);
    try {
      const result = await this.orchestrator.runNext(owner);
      return { jobId: result?.jobId ?? null, alreadyRunning: false };
    } catch (error) {
      if (error instanceof BudgetExceededError)
        throw new BadRequestException(error.message);
      throw error;
    } finally {
      this.running.delete(owner);
    }
  }

  private formatJobView(
    jobId: string,
    job: EngineJobDocument,
    spend: { spentMicros: number; reservedMicros: number; calls: number },
    candidates: Record<string, number>,
  ): Record<string, unknown> {
    const provenanceComplete =
      isGenerationSpecificationComplete(job.generationSpec) &&
      job.generationSpec.mechanicKey === job.mechanicKey &&
      job.generationSpec.worldKey === job.worldKey &&
      job.generationSpec.scopeKey === job.scopeKey &&
      job.generationSpec.targetCount === job.targetCount;
    const timestamps = job as unknown as {
      createdAt?: Date | string;
      updatedAt?: Date | string;
    };

    return {
      jobId,
      worldKey: job.worldKey,
      scopeKey: job.scopeKey,
      mechanicKey: job.mechanicKey,
      targetCount: job.targetCount,
      status: job.status,
      pipelineStage: job.pipelineStage,
      attempts: job.attempts,
      cancellationRequested: job.cancellationRequested,
      awaitingReviewReason: job.awaitingReviewReason ?? null,
      lastError: job.lastError ?? null,
      specVersion: job.specVersion ?? job.generationSpec?.specVersion ?? null,
      generationSpec: job.generationSpec
        ? freezeGenerationSpecification(job.generationSpec)
        : null,
      planDigest: job.planDigest ?? null,
      pinnedPlan:
        (
          job as unknown as {
            stageCheckpoints?: {
              context_resolved?: { pinnedPlan?: unknown };
            };
          }
        )?.stageCheckpoints?.context_resolved?.pinnedPlan ?? null,
      provenanceComplete,
      createdBy: job.createdBy ?? null,
      createdByEmail: job.createdByEmail ?? null,
      lastExecutedBy: job.lastExecutedBy ?? null,
      lastExecutedByEmail: job.lastExecutedByEmail ?? null,
      createdAt: timestamps.createdAt ?? null,
      updatedAt: timestamps.updatedAt ?? null,
      candidates,
      spentMicros: spend.spentMicros,
      spentSar: microsToSar(spend.spentMicros),
      outstandingReservedMicros: spend.reservedMicros,
      providerCalls: spend.calls,
    };
  }

  /** Progress for one job: stage, attempts, failure, and what it has spent. */
  async status(jobId: string): Promise<Record<string, unknown> | null> {
    const job = await this.jobs.findById(jobId);
    if (!job) return null;
    const spend = await this.budget.spentForJob(jobId);
    const counts = await this.candidates.aggregate<{
      _id: string;
      count: number;
    }>([
      { $match: { jobId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    return this.formatJobView(
      jobId,
      job,
      spend,
      Object.fromEntries(counts.map((row) => [row._id, row.count])),
    );
  }

  /**
   * Read-only paginated job listing with candidate status counts and ledger spend.
   */
  async listJobs(query?: {
    cursor?: string;
    limit?: number;
    status?: string;
    worldKey?: string;
    scopeKey?: string;
    mechanicKey?: string;
  }): Promise<{
    items: Record<string, unknown>[];
    nextCursor: string | null;
  }> {
    const page = await this.jobs.list(query);
    if (page.items.length === 0) {
      return { items: [], nextCursor: null };
    }

    const jobIds = page.items.map((job) =>
      String((job as { _id?: unknown })._id ?? ''),
    );
    const [candidateRows, spends] = await Promise.all([
      this.candidates.aggregate<{
        _id: { jobId: string; status: string };
        count: number;
      }>([
        { $match: { jobId: { $in: jobIds } } },
        {
          $group: {
            _id: { jobId: '$jobId', status: '$status' },
            count: { $sum: 1 },
          },
        },
      ]),
      Promise.all(jobIds.map((jobId) => this.budget.spentForJob(jobId))),
    ]);

    const candidatesByJob = new Map<string, Record<string, number>>();
    for (const row of candidateRows) {
      const id = row?._id?.jobId;
      const st = row?._id?.status;
      if (!id || !st) continue;
      const existing = candidatesByJob.get(id) ?? {};
      existing[st] = row.count;
      candidatesByJob.set(id, existing);
    }

    const items = page.items.map((job, idx) => {
      const jobId = jobIds[idx];
      return this.formatJobView(
        jobId,
        job,
        spends[idx] ?? { spentMicros: 0, reservedMicros: 0, calls: 0 },
        candidatesByJob.get(jobId) ?? {},
      );
    });

    return {
      items,
      nextCursor: page.nextCursor,
    };
  }

  cancel(jobId: string): Promise<boolean> {
    return this.jobs.requestCancellation(jobId);
  }
}
