import { QuestionWriterAgentService } from './question-writer-agent.service';
import { QuestionRepairAgentService } from './question-repair-agent.service';
import { QuestionReviewAgentService } from './question-review-agent.service';
import { SourceQuestionNormalizerService } from './source-question-normalizer.service';
import type { LlmClientService } from '../infrastructure/ai/llm-client.service';

describe('question curation agents', () => {
  const source = new SourceQuestionNormalizerService().normalize({
    sourceId: 'source',
    sourceUrl: 'https://source',
    sourceCategory: 'General',
    question: 'Who won?',
    correctAnswer: 'Winner',
    incorrectAnswers: ['A', 'B', 'C'],
    type: 'multiple',
    difficulty: 'easy',
  })!;
  const slot = {
    slotId: 'slot-1',
    difficulty: 'easy' as const,
    gameMode: 'trivia' as const,
    requestedAssetType: 'text' as const,
    sourceCandidate: source,
  };
  const candidate = {
    curationStatus: 'APPROVE' as const,
    sameMeaning: true,
    sourceFingerprint: source.fingerprint,
    question: 'من فاز؟',
    answer: 'Winner',
    acceptedAnswers: [],
    wrongAnswers: ['أ', 'ب', 'ج'],
    difficulty: 'easy' as const,
    gameMode: 'trivia' as const,
    type: 'text' as const,
    explanation: 'شرح.',
    assetRequest: null,
    knowledgeFactIds: [],
    sourceIds: ['source'],
  };
  it('uses one minimal structured curation call without malformed-output repair', async () => {
    const llm = {
      generateStructured: jest.fn().mockResolvedValue({
        value: {
          status: 'ACCEPT',
          question: 'من فاز؟',
          answer: 'الفائز',
          reason: null,
        },
      }),
    } as unknown as LlmClientService;
    const result = await new QuestionWriterAgentService(llm).curate(
      source,
      slot,
    );
    expect(result.value).toMatchObject({
      curationStatus: 'APPROVE',
      question: 'من فاز؟',
      answer: 'الفائز',
      sourceIds: ['source'],
      sourceFingerprint: source.fingerprint,
    });
    expect(llm.generateStructured).toHaveBeenCalledTimes(1);
    expect(llm.generateStructured).toHaveBeenCalledWith(
      expect.objectContaining({ repairMalformed: false }),
    );
  });

  it.each([
    ['True', 'صح'],
    ['False', 'خطأ'],
  ])('maps boolean %s to %s', async (correctAnswer, expected) => {
    const booleanSource = new SourceQuestionNormalizerService().normalize({
      sourceId: 'source',
      sourceUrl: 'https://source',
      sourceCategory: 'Sports',
      question: 'Cristiano Ronaldo opened a museum.',
      correctAnswer,
      incorrectAnswers: [correctAnswer === 'True' ? 'False' : 'True'],
      type: 'boolean',
      difficulty: 'easy',
    })!;
    const llm = {
      generateStructured: jest.fn().mockResolvedValue({
        value: {
          status: 'ACCEPT',
          question: 'افتتح كريستيانو رونالدو متحفًا.',
          answer: 'ignored',
          reason: null,
        },
      }),
    } as unknown as LlmClientService;
    const result = await new QuestionWriterAgentService(llm).curate(
      booleanSource,
      { ...slot, sourceCandidate: booleanSource },
    );
    expect(result.value.question).toBe(
      'صح أم خطأ: افتتح كريستيانو رونالدو متحفًا.',
    );
    expect(result.value.answer).toBe(expected);
    expect(result.value.wrongAnswers).toEqual([
      correctAnswer === 'True' ? 'False' : 'True',
    ]);
  });
  it('repair cannot change answer or provenance', async () => {
    const llm = {
      generateStructured: jest.fn().mockResolvedValue({
        value: {
          ...candidate,
          answer: 'Changed',
          sourceIds: ['other'],
          sourceFingerprint: 'other',
        },
      }),
    } as unknown as LlmClientService;
    expect(
      (
        await new QuestionRepairAgentService(llm).repairCuration(
          source,
          candidate,
          ['LANGUAGE'],
        )
      ).value,
    ).toMatchObject({
      answer: 'Winner',
      sourceIds: ['source'],
      sourceFingerprint: source.fingerprint,
    });
  });
  it('reviewer rejects an unsupported added claim', async () => {
    const llm = {
      generateStructured: jest.fn().mockResolvedValue({
        value: {
          verdict: 'approved',
          score: 9,
          issues: [{ code: 'UNSUPPORTED_CLAIM', message: 'added' }],
          sameQuestionMeaning: true,
          sameCorrectAnswer: true,
          noNewFacts: false,
          optionsFaithful: true,
        },
      }),
    } as unknown as LlmClientService;
    expect(
      (
        await new QuestionReviewAgentService(llm).reviewCuration(
          source,
          candidate,
        )
      ).value.verdict,
    ).toBe('rejected');
  });
});
