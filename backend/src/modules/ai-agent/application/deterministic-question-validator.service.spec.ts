import { DeterministicQuestionValidatorService } from './deterministic-question-validator.service';
import { categoryProfileRegistry } from './category-generation-profile.registry';

describe('DeterministicQuestionValidatorService', () => {
  const validator = new DeterministicQuestionValidatorService();
  const profile = categoryProfileRegistry.byId('general-text-trivia');
  const fact = {
    id: 'f1',
    fact: 'الرياض عاصمة السعودية',
    canonicalAnswer: 'الرياض',
    acceptedAnswerHints: [],
    entities: ['الرياض'],
    topic: 'مدن',
    source: {
      title: 'source',
      url: 'knowledge://source',
      excerpt: 'الرياض عاصمة السعودية',
    },
    confidence: 1,
  };
  const slot = {
    slotId: 'slot-1',
    difficulty: 'easy' as const,
    gameMode: 'trivia' as const,
    requestedAssetType: 'text' as const,
  };
  it('reports stable leakage, answer, mode, and asset diagnostics', () => {
    const issues = validator.validate(
      {
        question: 'هل الإجابة الرياض؟',
        answer: '',
        acceptedAnswers: [],
        wrongAnswers: [],
        difficulty: 'easy',
        gameMode: 'identifySong',
        type: 'audio',
        explanation: '',
        assetRequest: null,
      },
      fact,
      slot,
      profile,
    );
    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'ANSWER_REQUIRED',
        'UNSUPPORTED_GAME_MODE',
        'UNSUPPORTED_ASSET_TYPE',
        'ASSET_REQUEST_REQUIRED',
        'CANONICAL_ANSWER_CHANGED',
      ]),
    );
  });
});
