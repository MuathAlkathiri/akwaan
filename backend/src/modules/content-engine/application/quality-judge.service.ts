import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProvider } from '../../ai-agent/domain/ai-provider.interface';
import {
  AmbiguousProviderOutcomeError,
  ENGINE_AI_PROVIDER,
} from '../domain/content-engine.constants';
import { GenerationSpecification } from '../domain/generation-specification';
import { ResolvedAuthoringContext } from './authoring-context.service';
import { EngineBudgetService } from './engine-budget.service';

export const QUALITY_JUDGE_MAX_OUTPUT_TOKENS = 900;
export const QUALITY_JUDGE_DRAFT_TOKEN_ALLOWANCE = 200;

export function composeQualityJudgePrompt(
  mechanicText: string,
  serializedDraft: string,
): string {
  return [
    '# CANONICAL MECHANIC SKILL',
    mechanicText ?? '',
    '# ADVISORY QUALITY REVIEW',
    'Evaluate only the candidate below against the canonical mechanic Skill.',
    'Score every dimension 1-5, explain every score, and return actionable rejection feedback.',
    'Do not claim factual verification. Do not override deterministic validation.',
    serializedDraft,
  ].join('\n\n');
}

export function estimateQualityJudgePromptTokens(
  mechanicText: string,
  serializedDraft?: string,
): number {
  if (serializedDraft !== undefined) {
    return Math.ceil(
      composeQualityJudgePrompt(mechanicText, serializedDraft).length / 3,
    );
  }
  const basePrompt = composeQualityJudgePrompt(mechanicText, '');
  return Math.ceil(basePrompt.length / 3) + QUALITY_JUDGE_DRAFT_TOKEN_ALLOWANCE;
}

export const QUALITY_DIMENSIONS = [
  'mechanicNativeGameplay',
  'nonTriviality',
  'unambiguity',
  'recognizabilityAndFairness',
  'teamInteraction',
  'difficultyFit',
  'answerLeakageSafety',
  'overallPlayability',
] as const;
export type QualityDimension = (typeof QUALITY_DIMENSIONS)[number];

export interface QualityEvaluation {
  scores: Record<QualityDimension, number>;
  reasons: Record<QualityDimension, string>;
  difficulty: 'easy' | 'medium' | 'hard';
  recommendation: 'PASS' | 'REVIEW' | 'REJECT';
  rejectionFeedback: string[];
}

export const QUALITY_JUDGE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'scores',
    'reasons',
    'difficulty',
    'recommendation',
    'rejectionFeedback',
  ],
  properties: {
    scores: {
      type: 'object',
      additionalProperties: false,
      required: QUALITY_DIMENSIONS,
      properties: Object.fromEntries(
        QUALITY_DIMENSIONS.map((key) => [
          key,
          { type: 'integer', minimum: 1, maximum: 5 },
        ]),
      ),
    },
    reasons: {
      type: 'object',
      additionalProperties: false,
      required: QUALITY_DIMENSIONS,
      properties: Object.fromEntries(
        QUALITY_DIMENSIONS.map((key) => [key, { type: 'string' }]),
      ),
    },
    difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
    recommendation: {
      type: 'string',
      enum: ['PASS', 'REVIEW', 'REJECT'],
    },
    rejectionFeedback: { type: 'array', items: { type: 'string' } },
  },
};

/** One advisory structured call; it can never clear a deterministic blocker. */
@Injectable()
export class QualityJudgeService {
  constructor(
    private readonly budget: EngineBudgetService,
    private readonly config: ConfigService,
    @Optional()
    @Inject(ENGINE_AI_PROVIDER)
    private readonly provider?: AiProvider,
  ) {}

  async judge(input: {
    jobId: string;
    candidateId: string;
    attempt: number;
    draft: Record<string, unknown>;
    context: ResolvedAuthoringContext;
    generationSpec?: GenerationSpecification;
  }): Promise<QualityEvaluation> {
    if (!this.provider) throw new Error('No engine AiProvider is bound');
    const serializedDraft = JSON.stringify(input.draft);
    const prompt = this.prompt(input.context, input.draft);
    const reservationId = `${input.jobId}:quality:${input.candidateId}:${input.attempt}`;
    const providerName =
      input.generationSpec?.provider ??
      this.config.get<string>('ENGINE_PROVIDER_NAME') ??
      'fake';
    const model =
      input.generationSpec?.qualityModel ??
      this.config.get<string>('ENGINE_QUALITY_MODEL') ??
      input.generationSpec?.generationModel ??
      this.config.get<string>('ENGINE_GENERATION_MODEL') ??
      'fake-model';
    await this.budget.reserve({
      reservationId,
      jobId: input.jobId,
      stage: 'quality',
      provider: providerName,
      model,
      expected: {
        promptTokens: estimateQualityJudgePromptTokens(
          input.context.mechanic,
          serializedDraft,
        ),
        maxOutputTokens: QUALITY_JUDGE_MAX_OUTPUT_TOKENS,
      },
    });

    let raw: string;
    try {
      const response = await this.provider.generateText({
        model,
        prompt,
        responseSchema: QUALITY_JUDGE_SCHEMA,
        temperature: 0,
        omitTemperature: false,
        reasoningEffort: null,
        maxOutputTokens: QUALITY_JUDGE_MAX_OUTPUT_TOKENS,
      });
      raw = response.text;
      await this.budget.settle({ reservationId, usage: response.usage });
    } catch (error) {
      const providerRejected =
        (error as { definitelyNotBilled?: unknown })?.definitelyNotBilled ===
        true;
      await this.budget.settle({
        reservationId,
        ...(providerRejected ? { providerRejected: true } : { timedOut: true }),
      });
      throw new AmbiguousProviderOutcomeError(
        'quality',
        error instanceof Error ? error.message : String(error),
      );
    }
    return this.parse(raw);
  }

  private prompt(
    context: ResolvedAuthoringContext,
    draft: Record<string, unknown>,
  ): string {
    return composeQualityJudgePrompt(context.mechanic, JSON.stringify(draft));
  }

  private parse(raw: string): QualityEvaluation {
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new QualityJudgeParseError('QUALITY_JUDGE_JSON_INVALID');
    }
    const candidate = value as Partial<QualityEvaluation>;
    if (
      !candidate.scores ||
      !candidate.reasons ||
      !['easy', 'medium', 'hard'].includes(candidate.difficulty ?? '') ||
      !['PASS', 'REVIEW', 'REJECT'].includes(candidate.recommendation ?? '') ||
      !Array.isArray(candidate.rejectionFeedback)
    ) {
      throw new QualityJudgeParseError('QUALITY_JUDGE_SHAPE_INVALID');
    }
    for (const dimension of QUALITY_DIMENSIONS) {
      const score = candidate.scores[dimension];
      const reason = candidate.reasons[dimension];
      if (
        !Number.isInteger(score) ||
        score < 1 ||
        score > 5 ||
        typeof reason !== 'string' ||
        !reason.trim()
      ) {
        throw new QualityJudgeParseError(
          `QUALITY_JUDGE_RUBRIC_INVALID:${dimension}`,
        );
      }
    }
    if (
      candidate.rejectionFeedback.some(
        (entry) => typeof entry !== 'string' || !entry.trim(),
      )
    ) {
      throw new QualityJudgeParseError('QUALITY_JUDGE_FEEDBACK_INVALID');
    }
    return candidate as QualityEvaluation;
  }
}

export class QualityJudgeParseError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
