import { Logger } from '@nestjs/common';
import { CandidateGeneratorService } from './candidate-generator.service';
import { ContentEngineOrchestratorService } from './content-engine-orchestrator.service';
import { QualityJudgeService } from './quality-judge.service';
import { EnginePricingService } from '../domain/engine-pricing.service';
import {
  AmbiguousProviderOutcomeError,
  PROVIDER_OUTPUT_TOKENS_EXHAUSTED,
  ProviderOutputTokensExhaustedError,
} from '../domain/content-engine.constants';
import {
  OpenRouterAiProvider,
  OpenRouterEmptyCompletionError,
  OpenRouterUnavailableError,
} from '../infrastructure/openrouter-ai.provider';
import { CandidateParseError } from './candidate-generator.service';

/**
 * Phase D Pilot 01 — production job 6aef38bd76040ea7635f507e.
 *
 * OpenRouter generation gen-1794062548-B0MkPimwx5NimJIbjm3v (Azure): HTTP 200,
 * 17,391 input tokens, 2,400 output tokens of which 2,400 were reasoning, no
 * visible content, finish_reason "length", native_finish_reason "max_tokens".
 * The engine discarded that evidence, charged the 242,948-micro reservation as
 * if usage were unknown, and parked the job as "provider outcome ambiguous".
 */
const PILOT_01_RESPONSE = {
  id: 'gen-1794062548-B0MkPimwx5NimJIbjm3v',
  model: 'anthropic/claude-sonnet-5.5',
  choices: [
    {
      finish_reason: 'length',
      native_finish_reason: 'max_tokens',
      message: {
        role: 'assistant',
        content: '',
        reasoning: 'SECRET-REASONING-MUST-NOT-BE-LOGGED',
      },
    },
  ],
  usage: {
    prompt_tokens: 17_391,
    completion_tokens: 2_400,
    total_tokens: 19_791,
    completion_tokens_details: { reasoning_tokens: 2_400 },
    cost: 0.058782,
  },
};

/** Production rates (SAR micros per million tokens), as configured on Render. */
const PRODUCTION_PRICING = JSON.stringify({
  'openrouter/openai/gpt-4o-mini': {
    inputMicrosPerMillion: 562_500,
    outputMicrosPerMillion: 2_250_000,
    reasoningMicrosPerMillion: 2_250_000,
  },
  'openrouter/anthropic/claude-sonnet-5.5': {
    inputMicrosPerMillion: 7_500_000,
    outputMicrosPerMillion: 37_500_000,
    reasoningMicrosPerMillion: 37_500_000,
  },
});

const config = (extra: Record<string, string> = {}) => {
  const values: Record<string, string> = {
    OPENROUTER_API_KEY: 'test-key-not-real',
    ENGINE_GENERATION_MODEL: 'anthropic/claude-sonnet-5.5',
    ENGINE_PROVIDER_NAME: 'openrouter',
    ENGINE_OMIT_TEMPERATURE: 'true',
    ENGINE_MODEL_PRICING: PRODUCTION_PRICING,
    ...extra,
  };
  return { get: (key: string) => values[key] } as never;
};

const respondWith = (payload: unknown) => {
  const requests: Array<Record<string, unknown>> = [];
  const fetchImpl = (async (_url: string, init: { body: string }) => {
    requests.push(JSON.parse(init.body) as Record<string, unknown>);
    return {
      ok: true,
      status: 200,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    };
  }) as unknown as typeof fetch;
  return { fetchImpl, requests };
};

const generationContext = {
  mechanicKey: 'read-your-opponent',
  worldKey: 'football',
  scopeKey: 'premier-league',
  contextHash: 'pilot-01-hash',
  answerMode: 'multiple_choice',
  world: 'w',
  scope: 's',
  mechanic: 'm',
  questionCraft: 'q',
  approvedExemplars: '',
  exemplarDiagnostics: [],
  effectiveRules: { version: 1, digest: 'd', rules: [], conflicts: [] },
} as never;

describe('Pilot 01 — output-token exhaustion (reasoning-only empty completion)', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  describe('OpenRouter adapter', () => {
    it('preserves finish reasons, usage, reasoning tokens, cost and generation id', async () => {
      const { fetchImpl } = respondWith(PILOT_01_RESPONSE);
      const provider = new OpenRouterAiProvider(config(), fetchImpl);
      let thrown: unknown;
      try {
        await provider.generateText({
          prompt: 'p',
          maxOutputTokens: 2_400,
          responseSchema: { type: 'object', properties: {} },
        } as never);
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(OpenRouterEmptyCompletionError);
      // Still the old type for every caller that matched on it.
      expect(thrown).toBeInstanceOf(OpenRouterUnavailableError);
      const error = thrown as OpenRouterEmptyCompletionError;
      expect(error.evidence).toEqual({
        finishReason: 'length',
        nativeFinishReason: 'max_tokens',
        promptTokens: 17_391,
        completionTokens: 2_400,
        reasoningTokens: 2_400,
        providerReportedCostUsd: 0.058782,
        generationId: 'gen-1794062548-B0MkPimwx5NimJIbjm3v',
      });
      expect(error.outputTokensExhausted).toBe(true);
      // Reasoning is inside completion_tokens; billing it again would double count.
      expect(error.billableUsage).toEqual({
        promptTokens: 17_391,
        completionTokens: 2_400,
      });
      expect(error.definitelyNotBilled).toBe(false);
    });

    it('logs metadata only — never the reasoning or any content', async () => {
      const { fetchImpl } = respondWith(PILOT_01_RESPONSE);
      const provider = new OpenRouterAiProvider(config(), fetchImpl);
      await provider
        .generateText({
          prompt: 'PROMPT-TEXT',
          maxOutputTokens: 2_400,
        } as never)
        .catch(() => undefined);
      const logged = JSON.stringify(warn.mock.calls);
      expect(logged).toContain('engine_provider_empty_completion');
      expect(logged).toContain('max_tokens');
      expect(logged).not.toContain('SECRET-REASONING-MUST-NOT-BE-LOGGED');
      expect(logged).not.toContain('PROMPT-TEXT');
      expect(logged).not.toContain('test-key-not-real');
    });

    it('does not claim exhaustion for an empty answer that stopped normally', async () => {
      const payload = {
        ...PILOT_01_RESPONSE,
        choices: [{ ...PILOT_01_RESPONSE.choices[0], finish_reason: 'stop' }],
      };
      const { fetchImpl } = respondWith(payload);
      const error = (await new OpenRouterAiProvider(config(), fetchImpl)
        .generateText({ prompt: 'p' } as never)
        .catch((e: unknown) => e)) as OpenRouterEmptyCompletionError;
      expect(error.outputTokensExhausted).toBe(false);
      expect(error.evidence.finishReason).toBe('stop');
    });

    it('does not claim exhaustion when usage is missing, even on a length finish', async () => {
      const payload = { ...PILOT_01_RESPONSE, usage: undefined };
      const { fetchImpl } = respondWith(payload);
      const error = (await new OpenRouterAiProvider(config(), fetchImpl)
        .generateText({ prompt: 'p' } as never)
        .catch((e: unknown) => e)) as OpenRouterEmptyCompletionError;
      expect(error.outputTokensExhausted).toBe(false);
      expect(error.billableUsage).toBeUndefined();
      expect(error.evidence.finishReason).toBe('length');
    });

    it('transmits an explicit low reasoning effort for the generation model', async () => {
      const { fetchImpl, requests } = respondWith(PILOT_01_RESPONSE);
      await new OpenRouterAiProvider(
        config({ ENGINE_REASONING_EFFORT: 'low' }),
        fetchImpl,
      )
        .generateText({ prompt: 'p', maxOutputTokens: 7_500 } as never)
        .catch(() => undefined);
      expect(requests[0].reasoning).toEqual({ effort: 'low' });
      expect(requests[0].max_tokens).toBe(7_500);
    });

    it('sends no reasoning parameter when the effort is unset (unchanged default)', async () => {
      const { fetchImpl, requests } = respondWith(PILOT_01_RESPONSE);
      await new OpenRouterAiProvider(config(), fetchImpl)
        .generateText({ prompt: 'p' } as never)
        .catch(() => undefined);
      expect(requests[0]).not.toHaveProperty('reasoning');
    });

    it('never leaks the generation effort into another model (the judge)', async () => {
      const { fetchImpl, requests } = respondWith(PILOT_01_RESPONSE);
      await new OpenRouterAiProvider(
        config({ ENGINE_REASONING_EFFORT: 'low' }),
        fetchImpl,
      )
        .generateText({
          prompt: 'p',
          model: 'openai/gpt-4o-mini',
          reasoningEffort: null,
        } as never)
        .catch(() => undefined);
      expect(requests[0]).not.toHaveProperty('reasoning');
    });
  });

  describe('generation accounting and classification', () => {
    const makeGenerator = (generateText: jest.Mock) => {
      const reserve = jest.fn(async () => ({ reservedMicros: 242_948 }));
      const settle = jest.fn(async () => ({ actualMicros: 0 }));
      const candidates = { updateOne: jest.fn() };
      const generator = new CandidateGeneratorService(
        candidates as never,
        { holdsLease: async () => true } as never,
        { reserve, settle } as never,
        config(),
        { generateText } as never,
      );
      return { generator, reserve, settle, candidates };
    };

    it('settles the exact Pilot 01 call at its reported usage (≈220,433 micro-SAR) and fails deterministically', async () => {
      const { fetchImpl } = respondWith(PILOT_01_RESPONSE);
      const provider = new OpenRouterAiProvider(config(), fetchImpl);
      const generateText = jest.fn((request: never) =>
        provider.generateText(request),
      );
      const { generator, settle, candidates } = makeGenerator(generateText);

      const outcome = await generator
        .generate({
          jobId: '6aef38bd76040ea7635f507e',
          leaseEpoch: 1,
          attempt: 1,
          context: generationContext,
          count: 3,
        })
        .catch((error: unknown) => error);

      expect(outcome).toBeInstanceOf(ProviderOutputTokensExhaustedError);
      expect(outcome).not.toBeInstanceOf(AmbiguousProviderOutcomeError);
      expect((outcome as Error).message).toContain(
        PROVIDER_OUTPUT_TOKENS_EXHAUSTED,
      );
      // One settlement, at reported usage — not the timeout path.
      expect(settle).toHaveBeenCalledTimes(1);
      const settled = (settle.mock.calls[0] as unknown[])[0] as {
        usage: { promptTokens: number; completionTokens: number };
        timedOut?: boolean;
        providerRejected?: boolean;
        diagnostics: Record<string, unknown>;
      };
      expect(settled.timedOut).toBeUndefined();
      expect(settled.providerRejected).toBeUndefined();
      expect(settled.usage).toEqual({
        promptTokens: 17_391,
        completionTokens: 2_400,
      });
      expect(settled.diagnostics).toMatchObject({
        finishReason: 'length',
        nativeFinishReason: 'max_tokens',
        reasoningTokens: 2_400,
      });
      // What the ledger will charge for that usage at production rates.
      const micros = new EnginePricingService(config()).costMicros(
        'openrouter',
        'anthropic/claude-sonnet-5.5',
        settled.usage,
      );
      expect(micros).toBe(220_433);
      expect(micros).toBeLessThan(242_948);
      // Nothing generated, nothing persisted, nothing published.
      expect(candidates.updateOne).not.toHaveBeenCalled();
      expect(generateText).toHaveBeenCalledTimes(1);
    });

    it('keeps conservative accounting when an empty answer carries no usage', async () => {
      const { fetchImpl } = respondWith({
        ...PILOT_01_RESPONSE,
        usage: undefined,
      });
      const provider = new OpenRouterAiProvider(config(), fetchImpl);
      const { generator, settle } = makeGenerator(
        jest.fn((request: never) => provider.generateText(request)),
      );
      const outcome = await generator
        .generate({
          jobId: 'job-no-usage',
          leaseEpoch: 1,
          attempt: 1,
          context: generationContext,
          count: 3,
        })
        .catch((error: unknown) => error);
      expect(outcome).toBeInstanceOf(AmbiguousProviderOutcomeError);
      expect(settle).toHaveBeenCalledWith(
        expect.objectContaining({
          timedOut: true,
          // The evidence is now kept even on the conservative path.
          diagnostics: expect.objectContaining({ finishReason: 'length' }),
        }),
      );
    });

    it('still fails malformed JSON as a parse error, settled at reported usage', async () => {
      const malformed = {
        ...PILOT_01_RESPONSE,
        choices: [
          {
            finish_reason: 'stop',
            message: { role: 'assistant', content: '{"candidates": [' },
          },
        ],
      };
      const { fetchImpl } = respondWith(malformed);
      const provider = new OpenRouterAiProvider(config(), fetchImpl);
      const { generator, settle } = makeGenerator(
        jest.fn((request: never) => provider.generateText(request)),
      );
      const outcome = await generator
        .generate({
          jobId: 'job-malformed',
          leaseEpoch: 1,
          attempt: 1,
          context: generationContext,
          count: 3,
        })
        .catch((error: unknown) => error);
      expect(outcome).toBeInstanceOf(CandidateParseError);
      expect(settle).toHaveBeenCalledWith(
        expect.objectContaining({
          usage: expect.objectContaining({ promptTokens: 17_391 }),
        }),
      );
      expect(
        (settle.mock.calls[0] as unknown[])[0] as { timedOut?: boolean },
      ).not.toHaveProperty('timedOut');
    });
  });

  describe('quality judge', () => {
    it('settles a token-exhausted judgement at reported usage and reports it deterministically', async () => {
      const judgePayload = {
        ...PILOT_01_RESPONSE,
        model: 'openai/gpt-4o-mini',
        usage: {
          prompt_tokens: 3_000,
          completion_tokens: 900,
          total_tokens: 3_900,
        },
      };
      const { fetchImpl } = respondWith(judgePayload);
      const provider = new OpenRouterAiProvider(
        config({ ENGINE_QUALITY_MODEL: 'openai/gpt-4o-mini' }),
        fetchImpl,
      );
      const budget = {
        reserve: jest.fn(async () => ({ reservedMicros: 5_000 })),
        settle: jest.fn(async () => ({ actualMicros: 0 })),
      };
      const outcome = await new QualityJudgeService(
        budget as never,
        config({ ENGINE_QUALITY_MODEL: 'openai/gpt-4o-mini' }),
        provider,
      )
        .judge({
          jobId: 'job-judge',
          candidateId: 'cand-1',
          attempt: 1,
          draft: { prompt: { ar: 'سؤال؟' } },
          context: { mechanic: 'm' } as never,
        })
        .catch((error: unknown) => error);
      expect(outcome).toBeInstanceOf(ProviderOutputTokensExhaustedError);
      expect((outcome as ProviderOutputTokensExhaustedError).stage).toBe(
        'quality',
      );
      expect(budget.settle).toHaveBeenCalledTimes(1);
      expect(budget.settle).toHaveBeenCalledWith(
        expect.objectContaining({
          reservationId: 'job-judge:quality:cand-1:1',
          usage: { promptTokens: 3_000, completionTokens: 900 },
        }),
      );
      expect(
        (budget.settle.mock.calls[0] as unknown[])[0] as { timedOut?: boolean },
      ).not.toHaveProperty('timedOut');
    });
  });

  describe('orchestrator classification', () => {
    it('fails the job deterministically — no retry, never provider_outcome_ambiguous', async () => {
      const fail = jest.fn(async () => undefined);
      const releaseForRetry = jest.fn(async () => undefined);
      const awaitReview = jest.fn(async () => undefined);
      const orchestrator = new ContentEngineOrchestratorService(
        {
          find: () => ({
            sort: () => ({ lean: () => ({ exec: async () => [] }) }),
          }),
        } as never,
        {
          checkpoint: jest.fn(async () => undefined),
          awaitReview,
          releaseForRetry,
          fail,
          isCancellationRequested: async () => false,
          holdsLease: async () => true,
        } as never,
        { hasLedgerEntry: jest.fn(async () => false) } as never,
        {
          resolve: () => ({
            mechanicKey: 'read-your-opponent',
            worldKey: 'football',
            scopeKey: 'premier-league',
            contextHash: 'hash',
            effectiveRules: {
              version: 1,
              digest: 'd',
              rules: [],
              conflicts: [],
            },
          }),
        } as never,
        {
          generate: jest.fn(async () => {
            throw new ProviderOutputTokensExhaustedError('generation', {
              finishReason: 'length',
              nativeFinishReason: 'max_tokens',
              promptTokens: 17_391,
              completionTokens: 2_400,
              reasoningTokens: 2_400,
            });
          }),
        } as never,
        { beginBatch: jest.fn(), screen: jest.fn() } as never,
        { verify: jest.fn() } as never,
        { evaluate: jest.fn() } as never,
        { evaluate: jest.fn() } as never,
      );

      await orchestrator.run({
        jobId: '6aef38bd76040ea7635f507e',
        leaseEpoch: 1,
        attempts: 1,
        mechanicKey: 'read-your-opponent',
        worldKey: 'football',
        scopeKey: 'premier-league',
        targetCount: 3,
      } as never);

      expect(fail).toHaveBeenCalledWith(
        '6aef38bd76040ea7635f507e',
        1,
        expect.stringContaining(PROVIDER_OUTPUT_TOKENS_EXHAUSTED),
      );
      expect(releaseForRetry).not.toHaveBeenCalled();
      expect(awaitReview).not.toHaveBeenCalled();
    });
  });
});
