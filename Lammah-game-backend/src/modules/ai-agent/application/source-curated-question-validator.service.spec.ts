import { SourceCuratedQuestionValidatorService } from './source-curated-question-validator.service';
import { SourceQuestionNormalizerService } from './source-question-normalizer.service';

describe('SourceCuratedQuestionValidatorService', () => {
  const normalizer = new SourceQuestionNormalizerService();
  const source = normalizer.normalize({
    sourceId: 'open-trivia-db',
    sourceUrl: 'https://opentdb.com',
    sourceCategory: 'Sports',
    question: 'Who won?',
    correctAnswer: 'Lionel Messi',
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
    question: 'من فاز؟',
    answer: 'Lionel Messi',
    acceptedAnswers: [],
    wrongAnswers: ['أ', 'ب', 'ج'],
    difficulty: 'easy' as const,
    gameMode: 'trivia' as const,
    type: 'text' as const,
    explanation: 'فاز في المسابقة.',
    assetRequest: null,
    knowledgeFactIds: [],
    sourceIds: ['open-trivia-db'],
    sourceFingerprint: source.fingerprint,
    sameMeaning: true,
    curationStatus: 'APPROVE' as const,
  };
  const validate = (overrides = {}) =>
    new SourceCuratedQuestionValidatorService(normalizer)
      .validate({ ...candidate, ...overrides }, source, slot)
      .map((i) => i.code);
  it('passes faithful curation', () => expect(validate()).toEqual([]));
  it('allows a translated answer for human review', () =>
    expect(validate({ answer: 'ليونيل ميسي' })).toEqual([]));
  it('rejects changed source ID', () =>
    expect(validate({ sourceIds: ['other'] })).toContain('SOURCE_ID_CHANGED'));
  it('rejects changed fingerprint', () =>
    expect(validate({ sourceFingerprint: 'other' })).toContain(
      'SOURCE_FINGERPRINT_CHANGED',
    ));
  it('does not validate source wrong-answer language or option count', () =>
    expect(validate({ wrongAnswers: ['English'] })).toEqual([]));
  it('does not use curator self-assessment as a validation layer', () =>
    expect(validate({ sameMeaning: false })).toEqual([]));
  it('rejects an unusable structure returned by curation', () =>
    expect(validate({ curationStatus: 'REJECT' })).toContain(
      'SOURCE_STRUCTURE_UNUSABLE',
    ));
  it('rejects source option-dependent wording', () =>
    expect(validate({ question: 'Which of the following won?' })).toContain(
      'OPTION_DEPENDENT_QUESTION',
    ));
  it('rejects multiple-choice markers', () =>
    expect(validate({ question: 'اختر الإجابة: A. واحد B. اثنان' })).toContain(
      'MULTIPLE_CHOICE_MARKERS_REMAIN',
    ));
  it('rejects remaining HTML entities and markup', () => {
    expect(validate({ question: 'من فاز &amp;؟' })).toContain(
      'HTML_ENTITY_REMAINS',
    );
    expect(validate({ question: '<b>من فاز؟</b>' })).toContain(
      'MALFORMED_MARKUP_REMAINS',
    );
  });
  it('rejects a clearly non-Arabic question', () =>
    expect(validate({ question: 'Who won the award?' })).toContain(
      'OUTPUT_LANGUAGE_MISMATCH',
    ));

  it.each([
    ['True', 'صح'],
    ['False', 'خطأ'],
  ])('accepts boolean %s mapped to %s', (correctAnswer, answer) => {
    const booleanSource = normalizer.normalize({
      sourceId: 'open-trivia-db',
      sourceUrl: 'https://opentdb.com',
      sourceCategory: 'Sports',
      question: 'Cristiano Ronaldo opened a museum dedicated to himself.',
      correctAnswer,
      incorrectAnswers: [correctAnswer === 'True' ? 'False' : 'True'],
      type: 'boolean',
      difficulty: 'easy',
    })!;
    const booleanSlot = { ...slot, sourceCandidate: booleanSource };
    const issues = new SourceCuratedQuestionValidatorService(
      normalizer,
    ).validate(
      {
        ...candidate,
        question: 'صح أم خطأ: افتتح كريستيانو رونالدو متحفًا مخصصًا لنفسه.',
        answer,
        wrongAnswers: [correctAnswer === 'True' ? 'False' : 'True'],
        sourceFingerprint: booleanSource.fingerprint,
      },
      booleanSource,
      booleanSlot,
    );
    expect(issues).toEqual([]);
  });
});
