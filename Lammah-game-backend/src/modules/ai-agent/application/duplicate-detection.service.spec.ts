import { DuplicateDetectionService } from './duplicate-detection.service';
import { SourceQuestionNormalizerService } from './source-question-normalizer.service';

describe('DuplicateDetectionService', () => {
  const fact = {
    id: 'f1',
    fact: 'fact',
    canonicalAnswer: 'الرياض',
    acceptedAnswerHints: [],
    entities: ['السعودية'],
    topic: 'عواصم',
    source: { title: 's', url: 'knowledge://s', excerpt: 'fact' },
    confidence: 1,
  };
  const candidate = {
    question: 'ما عاصمة السعودية؟',
    answer: 'الرياض',
    acceptedAnswers: [],
    wrongAnswers: [],
    difficulty: 'easy' as const,
    gameMode: 'trivia' as const,
    type: 'text' as const,
    explanation: '',
    assetRequest: null,
  };
  it('detects persisted exact and current-batch duplicates', () => {
    const service = new DuplicateDetectionService();
    expect(
      service.check(candidate, fact, [{ question: 'ما عاصمة السعودية؟' }]),
    ).toEqual(['DUPLICATE_EXACT']);
    expect(service.check(candidate, fact, [])).toEqual([]);
    expect(service.check(candidate, fact, [])).toEqual(['DUPLICATE_IN_BATCH']);
  });

  it('rejects the same fact when the question and topic are reformatted', () => {
    const service = new DuplicateDetectionService();
    expect(service.check(candidate, fact, [])).toEqual([]);
    expect(
      service.check(
        {
          ...candidate,
          question: 'من الشخصية التي تستخدم جهاز البوابات في Portal؟',
        },
        { ...fact, topic: 'شخصيات Portal' },
        [],
      ),
    ).toEqual(['DUPLICATE_IN_BATCH']);
  });

  it('rejects a paraphrase of a stored question and a reused stored answer', () => {
    const service = new DuplicateDetectionService();
    expect(
      service.check(candidate, fact, [
        {
          question: 'ما هي عاصمة المملكة العربية السعودية؟',
          correctAnswer: 'الرياض',
        },
      ]),
    ).toEqual(['DUPLICATE_SEMANTIC']);
  });

  it('rejects the same source question and translated batch duplicate', () => {
    const source = new SourceQuestionNormalizerService().normalize({
      sourceId: 'open-trivia-db',
      sourceUrl: 'https://opentdb.com',
      sourceCategory: 'General',
      question: 'What is the capital of Saudi Arabia?',
      correctAnswer: 'Riyadh',
      incorrectAnswers: ['Jeddah', 'Dammam', 'Mecca'],
      type: 'multiple',
      difficulty: 'easy',
    })!;
    const service = new DuplicateDetectionService();
    expect(service.checkSource(candidate, source, [])).toEqual([]);
    expect(
      service.checkSource(
        { ...candidate, question: 'أي مدينة هي عاصمة السعودية؟' },
        source,
        [],
      ),
    ).toEqual(['DUPLICATE_IN_BATCH']);
  });

  it('rejects source curation similar to a stored question', () => {
    const source = new SourceQuestionNormalizerService().normalize({
      sourceId: 'open-trivia-db',
      sourceUrl: 'https://opentdb.com',
      sourceCategory: 'General',
      question: 'What is the capital of Saudi Arabia?',
      correctAnswer: 'Riyadh',
      incorrectAnswers: ['Jeddah', 'Dammam', 'Mecca'],
      type: 'multiple',
      difficulty: 'easy',
    })!;
    expect(
      new DuplicateDetectionService().checkSource(candidate, source, [
        { question: 'ما عاصمة السعودية؟' },
      ]),
    ).toEqual(['DUPLICATE_EXACT']);
  });
});
