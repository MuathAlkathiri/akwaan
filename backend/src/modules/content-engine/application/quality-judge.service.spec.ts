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
});
