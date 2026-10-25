import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import type { ResolvedAuthoringContext } from '../application/authoring-context.service';

export const GENERATION_SPEC_VERSION = 'generation-spec-v1' as const;

export const DEFAULT_BATCH_SIZE = 10;
export const MAX_SUPPORTED_BATCH_SIZE = 50;
export const MAX_BATCH_GUIDANCE_LENGTH = 1000;
export const OUTPUT_TOKENS_PER_CANDIDATE = 800;
export const DEFAULT_GENERATION_TEMPERATURE = 0.8;

export const MECHANIC_ANSWER_MODES = {
  'read-your-opponent': 'multiple_choice',
  closest: 'closest',
} as const;

export type GeneratorMechanicKey = keyof typeof MECHANIC_ANSWER_MODES;
export type GeneratorAnswerMode =
  (typeof MECHANIC_ANSWER_MODES)[GeneratorMechanicKey];

export const generatorAnswerModeFor = (
  mechanicKey: string,
): GeneratorAnswerMode | undefined =>
  (MECHANIC_ANSWER_MODES as Record<string, GeneratorAnswerMode | undefined>)[
    mechanicKey
  ];

export const PROMPT_VERSIONS: Record<GeneratorAnswerMode, string> = {
  multiple_choice: 'mc-v2',
  closest: 'closest-v2',
};

export const RYO_REQUESTED_DIFFICULTIES = [
  'mixed',
  'easy',
  'medium',
  'relatively_difficult',
] as const;

export type RyoRequestedDifficulty =
  (typeof RYO_REQUESTED_DIFFICULTIES)[number];

export const DEFAULT_RYO_DIFFICULTY_TARGETS = {
  easy: 25,
  medium: 50,
  relativelyDifficult: 25,
} as const;

export const RYO_DIFFICULTY_CONFIG_KEYS = {
  easy: 'ENGINE_RYO_DIFFICULTY_EASY_PERCENT',
  medium: 'ENGINE_RYO_DIFFICULTY_MEDIUM_PERCENT',
  relativelyDifficult: 'ENGINE_RYO_DIFFICULTY_RELATIVELY_DIFFICULT_PERCENT',
} as const;

export interface RyoDifficultyTargets {
  easy: number;
  medium: number;
  relativelyDifficult: number;
}

export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';

const REASONING_EFFORTS: readonly ReasoningEffort[] = [
  'minimal',
  'low',
  'medium',
  'high',
];

/**
 * Versioned, immutable generation specification.
 *
 * Captures the complete resolved generation contract at preflight/submission
 * time so job identity, cost estimation, and execution cannot silently drift.
 */
export interface GenerationSpecification {
  readonly specVersion: typeof GENERATION_SPEC_VERSION;
  readonly worldKey: string;
  readonly scopeKey: string;
  readonly mechanicKey: string;
  readonly answerMode: GeneratorAnswerMode;
  readonly targetCount: number;
  readonly difficulty: RyoRequestedDifficulty | null;
  readonly ryoDifficultyTargets: Readonly<RyoDifficultyTargets> | null;
  readonly batchGuidance: string | null;
  readonly contextHash: string;
  readonly ruleSetDigest: string;
  readonly promptVersion: string;
  readonly provider: string;
  readonly generationModel: string;
  readonly qualityModel: string | null;
  readonly temperature: number | null;
  readonly omitTemperature: boolean;
  readonly reasoningEffort: ReasoningEffort | null;
  readonly outputTokensPerCandidate: number;
  readonly maxOutputTokens: number;
}

export class GenerationSpecValidationError extends Error {
  constructor(
    public readonly code: string,
    detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = 'GenerationSpecValidationError';
  }
}

export const resolveMaxBatchSize = (config?: ConfigService): number => {
  const raw = config?.get<string>('ENGINE_BATCH_SIZE');
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return DEFAULT_BATCH_SIZE;
  }
  const configured = Number(raw);
  if (!Number.isFinite(configured) || configured < 1) {
    return DEFAULT_BATCH_SIZE;
  }
  return Math.min(Math.floor(configured), MAX_SUPPORTED_BATCH_SIZE);
};

export const validateTargetCount = (
  targetCount: unknown,
  maxBatchSize: number,
): number => {
  if (
    typeof targetCount !== 'number' ||
    !Number.isInteger(targetCount) ||
    targetCount < 1
  ) {
    throw new GenerationSpecValidationError(
      'CANDIDATE_COUNT_INVALID',
      `targetCount must be an integer >= 1 (received ${String(targetCount)})`,
    );
  }
  if (targetCount > maxBatchSize) {
    throw new GenerationSpecValidationError(
      'CANDIDATE_COUNT_EXCEEDS_CAPACITY',
      `requested targetCount ${targetCount} exceeds supported batch capacity of ${maxBatchSize}`,
    );
  }
  return targetCount;
};

export const normalizeBatchGuidance = (guidance?: unknown): string | null => {
  if (guidance === undefined || guidance === null) return null;
  if (typeof guidance !== 'string') {
    throw new GenerationSpecValidationError(
      'BATCH_GUIDANCE_INVALID',
      'batchGuidance must be a string when provided',
    );
  }
  const trimmed = guidance.trim();
  if (!trimmed) return null;
  if (trimmed.length > MAX_BATCH_GUIDANCE_LENGTH) {
    throw new GenerationSpecValidationError(
      'BATCH_GUIDANCE_TOO_LONG',
      `batchGuidance must be at most ${MAX_BATCH_GUIDANCE_LENGTH} characters (received ${trimmed.length})`,
    );
  }
  return trimmed;
};

export const resolveRequestedDifficulty = (
  mechanicKey: string,
  difficulty?: unknown,
): RyoRequestedDifficulty | null => {
  if (mechanicKey === 'read-your-opponent') {
    if (
      difficulty === undefined ||
      difficulty === null ||
      (typeof difficulty === 'string' && difficulty.trim() === '')
    ) {
      return 'mixed';
    }
    if (typeof difficulty !== 'string') {
      throw new GenerationSpecValidationError(
        'INVALID_DIFFICULTY_SELECTION',
        `difficulty must be one of ${RYO_REQUESTED_DIFFICULTIES.join(', ')}`,
      );
    }
    const normalized = difficulty.trim();
    if (
      RYO_REQUESTED_DIFFICULTIES.includes(normalized as RyoRequestedDifficulty)
    ) {
      return normalized as RyoRequestedDifficulty;
    }
    throw new GenerationSpecValidationError(
      'INVALID_DIFFICULTY_SELECTION',
      `difficulty "${normalized}" is not supported for read-your-opponent; allowed values are ${RYO_REQUESTED_DIFFICULTIES.join(', ')}`,
    );
  }

  if (
    difficulty !== undefined &&
    difficulty !== null &&
    String(difficulty).trim() !== ''
  ) {
    throw new GenerationSpecValidationError(
      'DIFFICULTY_SELECTION_NOT_SUPPORTED',
      `difficulty selection is not supported for mechanic "${mechanicKey}" (CLOSEST_DIFFICULTY_DEFERRED)`,
    );
  }
  return null;
};

export const resolveRyoMixedDifficultyTargets = (
  config?: ConfigService,
): RyoDifficultyTargets => {
  const configured = {
    easy: config?.get<string>(RYO_DIFFICULTY_CONFIG_KEYS.easy)?.trim(),
    medium: config?.get<string>(RYO_DIFFICULTY_CONFIG_KEYS.medium)?.trim(),
    relativelyDifficult: config
      ?.get<string>(RYO_DIFFICULTY_CONFIG_KEYS.relativelyDifficult)
      ?.trim(),
  };
  const targets: RyoDifficultyTargets = {
    easy:
      configured.easy === undefined || configured.easy === ''
        ? DEFAULT_RYO_DIFFICULTY_TARGETS.easy
        : Number(configured.easy),
    medium:
      configured.medium === undefined || configured.medium === ''
        ? DEFAULT_RYO_DIFFICULTY_TARGETS.medium
        : Number(configured.medium),
    relativelyDifficult:
      configured.relativelyDifficult === undefined ||
      configured.relativelyDifficult === ''
        ? DEFAULT_RYO_DIFFICULTY_TARGETS.relativelyDifficult
        : Number(configured.relativelyDifficult),
  };
  const values = Object.values(targets);
  const sum = values.reduce((acc, value) => acc + value, 0);
  if (
    values.some((value) => !Number.isFinite(value) || value < 0) ||
    Math.abs(sum - 100) > 1e-9
  ) {
    throw new GenerationSpecValidationError(
      'RYO_DIFFICULTY_TARGETS_INVALID',
      `${RYO_DIFFICULTY_CONFIG_KEYS.easy}, ${RYO_DIFFICULTY_CONFIG_KEYS.medium} and ${RYO_DIFFICULTY_CONFIG_KEYS.relativelyDifficult} must be non-negative numbers totalling 100`,
    );
  }
  return Object.freeze(targets);
};

export const resolveEffectiveRyoDifficultyTargets = (
  difficulty: RyoRequestedDifficulty | null,
  config?: ConfigService,
): Readonly<RyoDifficultyTargets> | null => {
  if (difficulty === null) return null;
  if (difficulty === 'mixed') {
    return resolveRyoMixedDifficultyTargets(config);
  }
  if (difficulty === 'easy') {
    return Object.freeze({ easy: 100, medium: 0, relativelyDifficult: 0 });
  }
  if (difficulty === 'medium') {
    return Object.freeze({ easy: 0, medium: 100, relativelyDifficult: 0 });
  }
  return Object.freeze({ easy: 0, medium: 0, relativelyDifficult: 100 });
};

export const resolveOmitTemperature = (config?: ConfigService): boolean =>
  ['true', '1', 'yes', 'on'].includes(
    config?.get<string>('ENGINE_OMIT_TEMPERATURE')?.trim().toLowerCase() ?? '',
  );

export const resolveGenerationTemperature = (
  config?: ConfigService,
): number | null => {
  if (resolveOmitTemperature(config)) return null;
  const raw = config?.get<string>('ENGINE_GENERATION_TEMPERATURE');
  const parsed = raw !== undefined && raw !== '' ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : DEFAULT_GENERATION_TEMPERATURE;
};

export const resolveReasoningEffort = (
  config?: ConfigService,
): ReasoningEffort | null => {
  const raw = config
    ?.get<string>('ENGINE_REASONING_EFFORT')
    ?.trim()
    .toLowerCase();
  return REASONING_EFFORTS.includes(raw as ReasoningEffort)
    ? (raw as ReasoningEffort)
    : null;
};

export const resolveOutputTokensPerCandidate = (
  config?: ConfigService,
): number => {
  const raw = Number(config?.get<string>('ENGINE_OUTPUT_TOKENS_PER_CANDIDATE'));
  return Number.isFinite(raw) && raw > 0
    ? Math.floor(raw)
    : OUTPUT_TOKENS_PER_CANDIDATE;
};

export const freezeGenerationSpecification = (
  spec: GenerationSpecification,
): GenerationSpecification => {
  const frozenTargets = spec.ryoDifficultyTargets
    ? Object.freeze({
        easy: spec.ryoDifficultyTargets.easy,
        medium: spec.ryoDifficultyTargets.medium,
        relativelyDifficult: spec.ryoDifficultyTargets.relativelyDifficult,
      })
    : null;
  return Object.freeze({
    specVersion: GENERATION_SPEC_VERSION,
    worldKey: spec.worldKey,
    scopeKey: spec.scopeKey,
    mechanicKey: spec.mechanicKey,
    answerMode: spec.answerMode,
    targetCount: spec.targetCount,
    difficulty: spec.difficulty,
    ryoDifficultyTargets: frozenTargets,
    batchGuidance: spec.batchGuidance,
    contextHash: spec.contextHash,
    ruleSetDigest: spec.ruleSetDigest,
    promptVersion: spec.promptVersion,
    provider: spec.provider,
    generationModel: spec.generationModel,
    qualityModel: spec.qualityModel,
    temperature: spec.temperature,
    omitTemperature: spec.omitTemperature,
    reasoningEffort: spec.reasoningEffort,
    outputTokensPerCandidate: spec.outputTokensPerCandidate,
    maxOutputTokens: spec.maxOutputTokens,
  });
};

export const buildGenerationSpecification = (input: {
  config?: ConfigService;
  context: Pick<
    ResolvedAuthoringContext,
    'worldKey' | 'scopeKey' | 'mechanicKey' | 'contextHash' | 'effectiveRules'
  >;
  targetCount: unknown;
  difficulty?: unknown;
  batchGuidance?: unknown;
  providerOverride?: string;
  generationModelOverride?: string;
  qualityModelOverride?: string | null;
}): GenerationSpecification => {
  const maxBatchSize = resolveMaxBatchSize(input.config);
  const targetCount = validateTargetCount(input.targetCount, maxBatchSize);
  const answerMode = generatorAnswerModeFor(input.context.mechanicKey);
  if (!answerMode) {
    throw new GenerationSpecValidationError(
      'GENERATOR_MECHANIC_UNSUPPORTED',
      `mechanic "${input.context.mechanicKey}" has no authored generator answer mode`,
    );
  }

  const difficulty = resolveRequestedDifficulty(
    input.context.mechanicKey,
    input.difficulty,
  );
  const batchGuidance = normalizeBatchGuidance(input.batchGuidance);
  const ryoDifficultyTargets = resolveEffectiveRyoDifficultyTargets(
    difficulty,
    input.config,
  );
  const omitTemperature = resolveOmitTemperature(input.config);
  const temperature = resolveGenerationTemperature(input.config);
  const reasoningEffort = resolveReasoningEffort(input.config);
  const outputTokensPerCandidate = resolveOutputTokensPerCandidate(
    input.config,
  );
  const provider =
    input.providerOverride ??
    (input.config?.get<string>('ENGINE_PROVIDER_NAME')?.trim() || 'fake');
  const generationModel =
    input.generationModelOverride ??
    (input.config?.get<string>('ENGINE_GENERATION_MODEL')?.trim() ||
      'fake-model');
  const configuredQualityModel = input.config
    ?.get<string>('ENGINE_QUALITY_MODEL')
    ?.trim();
  const qualityModel =
    input.qualityModelOverride !== undefined
      ? input.qualityModelOverride
      : configuredQualityModel || generationModel;

  return freezeGenerationSpecification({
    specVersion: GENERATION_SPEC_VERSION,
    worldKey: input.context.worldKey,
    scopeKey: input.context.scopeKey,
    mechanicKey: input.context.mechanicKey,
    answerMode,
    targetCount,
    difficulty,
    ryoDifficultyTargets,
    batchGuidance,
    contextHash: input.context.contextHash,
    ruleSetDigest: input.context.effectiveRules.digest,
    promptVersion: PROMPT_VERSIONS[answerMode],
    provider,
    generationModel,
    qualityModel,
    temperature,
    omitTemperature,
    reasoningEffort,
    outputTokensPerCandidate,
    maxOutputTokens: targetCount * outputTokensPerCandidate,
  });
};

export const isGenerationSpecificationComplete = (
  value: unknown,
): value is GenerationSpecification => {
  if (!value || typeof value !== 'object') return false;
  const spec = value as Partial<GenerationSpecification>;
  if (spec.specVersion !== GENERATION_SPEC_VERSION) return false;
  if (typeof spec.worldKey !== 'string' || !spec.worldKey.trim()) return false;
  if (typeof spec.scopeKey !== 'string' || !spec.scopeKey.trim()) return false;
  if (typeof spec.mechanicKey !== 'string' || !spec.mechanicKey.trim()) {
    return false;
  }
  const expectedMode = generatorAnswerModeFor(spec.mechanicKey);
  if (!expectedMode || spec.answerMode !== expectedMode) return false;
  if (
    typeof spec.targetCount !== 'number' ||
    !Number.isInteger(spec.targetCount) ||
    spec.targetCount < 1 ||
    spec.targetCount > MAX_SUPPORTED_BATCH_SIZE
  ) {
    return false;
  }
  if (spec.mechanicKey === 'read-your-opponent') {
    if (
      typeof spec.difficulty !== 'string' ||
      !RYO_REQUESTED_DIFFICULTIES.includes(
        spec.difficulty as RyoRequestedDifficulty,
      )
    ) {
      return false;
    }
    const targets = spec.ryoDifficultyTargets;
    if (
      !targets ||
      typeof targets.easy !== 'number' ||
      typeof targets.medium !== 'number' ||
      typeof targets.relativelyDifficult !== 'number' ||
      Math.abs(
        targets.easy + targets.medium + targets.relativelyDifficult - 100,
      ) > 1e-6
    ) {
      return false;
    }
  } else {
    if (spec.difficulty !== null || spec.ryoDifficultyTargets !== null) {
      return false;
    }
  }
  if (
    spec.batchGuidance !== null &&
    (typeof spec.batchGuidance !== 'string' ||
      spec.batchGuidance.length > MAX_BATCH_GUIDANCE_LENGTH)
  ) {
    return false;
  }
  if (typeof spec.contextHash !== 'string' || !spec.contextHash.trim()) {
    return false;
  }
  if (typeof spec.ruleSetDigest !== 'string' || !spec.ruleSetDigest.trim()) {
    return false;
  }
  if (typeof spec.promptVersion !== 'string' || !spec.promptVersion.trim()) {
    return false;
  }
  if (typeof spec.provider !== 'string' || !spec.provider.trim()) return false;
  if (
    typeof spec.generationModel !== 'string' ||
    !spec.generationModel.trim()
  ) {
    return false;
  }
  if (
    spec.qualityModel !== null &&
    (typeof spec.qualityModel !== 'string' || !spec.qualityModel.trim())
  ) {
    return false;
  }
  if (typeof spec.omitTemperature !== 'boolean') return false;
  if (spec.omitTemperature) {
    if (spec.temperature !== null) return false;
  } else if (
    typeof spec.temperature !== 'number' ||
    !Number.isFinite(spec.temperature) ||
    spec.temperature < 0
  ) {
    return false;
  }
  if (
    spec.reasoningEffort !== null &&
    !REASONING_EFFORTS.includes(spec.reasoningEffort as ReasoningEffort)
  ) {
    return false;
  }
  if (
    typeof spec.outputTokensPerCandidate !== 'number' ||
    !Number.isInteger(spec.outputTokensPerCandidate) ||
    spec.outputTokensPerCandidate < 1
  ) {
    return false;
  }
  if (
    typeof spec.maxOutputTokens !== 'number' ||
    spec.maxOutputTokens !== spec.targetCount * spec.outputTokensPerCandidate
  ) {
    return false;
  }
  return true;
};

const canonicalSpecPayload = (spec: GenerationSpecification) => ({
  specVersion: spec.specVersion,
  worldKey: spec.worldKey,
  scopeKey: spec.scopeKey,
  mechanicKey: spec.mechanicKey,
  answerMode: spec.answerMode,
  targetCount: spec.targetCount,
  difficulty: spec.difficulty,
  ryoDifficultyTargets: spec.ryoDifficultyTargets
    ? {
        easy: spec.ryoDifficultyTargets.easy,
        medium: spec.ryoDifficultyTargets.medium,
        relativelyDifficult: spec.ryoDifficultyTargets.relativelyDifficult,
      }
    : null,
  batchGuidance: spec.batchGuidance,
  contextHash: spec.contextHash,
  ruleSetDigest: spec.ruleSetDigest,
  promptVersion: spec.promptVersion,
  provider: spec.provider,
  generationModel: spec.generationModel,
  qualityModel: spec.qualityModel,
  temperature: spec.temperature,
  omitTemperature: spec.omitTemperature,
  reasoningEffort: spec.reasoningEffort,
  outputTokensPerCandidate: spec.outputTokensPerCandidate,
  maxOutputTokens: spec.maxOutputTokens,
});

export const computeGenerationRequestHash = (
  spec: GenerationSpecification,
): string =>
  createHash('sha256')
    .update(JSON.stringify(canonicalSpecPayload(spec)), 'utf8')
    .digest('hex');

export const computePreflightPlanDigest = (input: {
  spec: GenerationSpecification;
  estimatedMicros: number | null;
  pricingConfigured: boolean;
  engineEnabled: boolean;
  liveProviderEnabled: boolean;
  providerReady: boolean;
}): string =>
  createHash('sha256')
    .update(
      JSON.stringify({
        planVersion: GENERATION_SPEC_VERSION,
        spec: canonicalSpecPayload(input.spec),
        estimatedMicros: input.estimatedMicros,
        pricingConfigured: input.pricingConfigured,
        engineEnabled: input.engineEnabled,
        liveProviderEnabled: input.liveProviderEnabled,
        providerReady: input.providerReady,
      }),
      'utf8',
    )
    .digest('hex');
