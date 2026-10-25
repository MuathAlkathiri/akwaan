import { FakeAiProvider } from '../testing/fake-ai.provider';
import {
  QualityJudgeParseError,
  QualityJudgeService,
} from './quality-judge.service';

const rubric = (overrides: Record<string, unknown> = {}) => ({
  scores: {
    mechanicNativeGameplay: 2,
    nonTriviality: 1,
    unambiguity: 4,
    recognizabilityAndFairness: 3,
    teamInteraction: 1,
    difficultyFit: 2,
    answerLeakageSafety: 5,
    overallPlayability: 1,
  },
  reasons: {
    mechanicNativeGameplay: 'Mostly ordinary recall.',
    nonTriviality: 'The answer is immediate.',
    unambiguity: 'The wording is clear.',
    recognizabilityAndFairness: 'Recognizable but shallow.',
    teamInteraction: 'Creates little discussion.',
    difficultyFit: 'Too easy for the intended pool.',
    answerLeakageSafety: 'The answer is not shown.',
    overallPlayability: 'Not strong enough to play.',
  },
  difficulty: 'easy',
  recommendation: 'REJECT',
  rejectionFeedback: [
    'Replace generic recall with a mechanic-native decision.',
  ],
  ...overrides,
});

describe('QualityJudgeService', () => {
  const context = {
    mechanic: 'CANONICAL MECHANIC RULES',
  } as never;
  const config = {
    get: (key: string) =>
      ({
        ENGINE_PROVIDER_NAME: 'fake',
        ENGINE_QUALITY_MODEL: 'fake-model',
      })[key],
  } as never;
  const budget = {
    reserve: jest.fn(async () => ({ reservedMicros: 1 })),
    settle: jest.fn(async () => ({ actualMicros: 1 })),
  } as never;

  it('persists a complete advisory rejection for a trivial candidate', async () => {
    const provider = new FakeAiProvider({ text: JSON.stringify(rubric()) });
    const result = await new QualityJudgeService(
      budget,
      config,
      provider,
    ).judge({
      jobId: 'job',
      candidateId: 'candidate',
      attempt: 1,
      draft: { prompt: { ar: 'سؤال ضعيف؟' } },
      context,
    });
    expect(result.recommendation).toBe('REJECT');
    expect(result.scores.overallPlayability).toBe(1);
    expect(provider.calls[0].prompt).toContain('CANONICAL MECHANIC RULES');
  });

  it('rejects malformed or incomplete rubric output after settling the call', async () => {
    const provider = new FakeAiProvider({ text: '{"scores":{}}' });
    await expect(
      new QualityJudgeService(budget, config, provider).judge({
        jobId: 'job',
        candidateId: 'candidate',
        attempt: 1,
        draft: {},
        context,
      }),
    ).rejects.toBeInstanceOf(QualityJudgeParseError);
    expect((budget as { settle: jest.Mock }).settle).toHaveBeenCalled();
  });

  it('rejects out-of-range rubric scores', async () => {
    const invalid = rubric({
      scores: { ...rubric().scores, overallPlayability: 6 },
    });
    const provider = new FakeAiProvider({ text: JSON.stringify(invalid) });
    await expect(
      new QualityJudgeService(budget, config, provider).judge({
        jobId: 'job',
        candidateId: 'candidate',
        attempt: 1,
        draft: {},
        context,
      }),
    ).rejects.toThrow('QUALITY_JUDGE_RUBRIC_INVALID');
  });

  it('executes using pinned generationSpec provider and qualityModel even when ConfigService environment drifts', async () => {
    const provider = new FakeAiProvider({ text: JSON.stringify(rubric()) });
    const driftedConfig = {
      get: (key: string) =>
        ({
          ENGINE_PROVIDER_NAME: 'drifted-provider',
          ENGINE_QUALITY_MODEL: 'drifted-quality-model',
          ENGINE_GENERATION_MODEL: 'drifted-gen-model',
        })[key],
    } as never;
    const localBudget = {
      reserve: jest.fn(async () => ({ reservedMicros: 1 })),
      settle: jest.fn(async () => ({ actualMicros: 1 })),
    };

    await new QualityJudgeService(
      localBudget as never,
      driftedConfig,
      provider,
    ).judge({
      jobId: 'job-pinned',
      candidateId: 'cand-1',
      attempt: 1,
      draft: { prompt: { ar: 'سؤال؟' } },
      context,
      generationSpec: {
        specVersion: 'generation-spec-v1',
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        mechanicKey: 'read-your-opponent',
        answerMode: 'multiple_choice',
        targetCount: 2,
        difficulty: 'mixed',
        ryoDifficultyTargets: { easy: 25, medium: 50, relativelyDifficult: 25 },
        batchGuidance: null,
        promptVersion: 'mc-v2',
        provider: 'pinned-provider',
        generationModel: 'pinned-gen-model',
        qualityModel: 'pinned-quality-model',
        temperature: 0.8,
        omitTemperature: false,
        reasoningEffort: null,
        outputTokensPerCandidate: 800,
        maxOutputTokens: 1600,
        contextHash: 'c'.repeat(64),
        ruleSetDigest: 'r'.repeat(64),
      },
    });

    expect(localBudget.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'pinned-provider',
        model: 'pinned-quality-model',
        expected: expect.objectContaining({
          maxOutputTokens: 900,
        }),
      }),
    );
    expect(provider.calls[0].model).toBe('pinned-quality-model');
    expect(provider.calls[0].maxOutputTokens).toBe(900);
  });

  it('releases judge budget reservation when provider explicitly declines before running (definitelyNotBilled: true)', async () => {
    const provider = {
      generateText: jest.fn(async () => {
        const error = new Error('OpenRouter responded 400: Bad Request');
        (error as { definitelyNotBilled?: boolean }).definitelyNotBilled = true;
        throw error;
      }),
    };
    const localBudget = {
      reserve: jest.fn(async () => ({ reservedMicros: 500 })),
      settle: jest.fn(async () => ({ actualMicros: 0 })),
    };

    await expect(
      new QualityJudgeService(
        localBudget as never,
        config,
        provider as never,
      ).judge({
        jobId: 'job-rejected',
        candidateId: 'cand-1',
        attempt: 1,
        draft: { prompt: { ar: 'سؤال؟' } },
        context,
      }),
    ).rejects.toThrow('Ambiguous provider outcome during quality');

    expect(localBudget.settle).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationId: 'job-rejected:quality:cand-1:1',
        providerRejected: true,
      }),
    );
  });

  it('charges full judge reservation when provider fails ambiguously (HTTP 500 / 504 / timeout)', async () => {
    const provider = {
      generateText: jest.fn(async () => {
        const error = new Error('OpenRouter responded 504: Gateway Timeout');
        (error as { definitelyNotBilled?: boolean }).definitelyNotBilled = false;
        throw error;
      }),
    };
    const localBudget = {
      reserve: jest.fn(async () => ({ reservedMicros: 500 })),
      settle: jest.fn(async () => ({ actualMicros: 500 })),
    };

    await expect(
      new QualityJudgeService(
        localBudget as never,
        config,
        provider as never,
      ).judge({
        jobId: 'job-504',
        candidateId: 'cand-1',
        attempt: 1,
        draft: { prompt: { ar: 'سؤال؟' } },
        context,
      }),
    ).rejects.toThrow('Ambiguous provider outcome during quality');

    expect(localBudget.settle).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationId: 'job-504:quality:cand-1:1',
        timedOut: true,
      }),
    );
  });
});
