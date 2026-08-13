import { LanguageValidatorService } from './language-validator.service';
import type {
  FactCandidate,
  PipelineQuestionCandidate,
} from './ai-generation-pipeline.types';

describe('LanguageValidatorService', () => {
  const validator = new LanguageValidatorService();
  const fact: FactCandidate = {
    id: 'f1',
    fact: 'Lionel Messi captains Argentina',
    canonicalAnswer: 'Lionel Messi',
    acceptedAnswerHints: ['ليونيل ميسي'],
    entities: ['Lionel Messi', 'UEFA Champions League'],
    source: { title: 'source', url: 'https://source', excerpt: 'fact' },
    confidence: 1,
  };
  const candidate = (
    overrides: Partial<PipelineQuestionCandidate> = {},
  ): PipelineQuestionCandidate => ({
    question: 'من هو قائد منتخب الأرجنتين؟',
    answer: 'Lionel Messi',
    acceptedAnswers: ['ليونيل ميسي'],
    wrongAnswers: ['دييغو مارادونا', 'أنخيل دي ماريا', 'سيرخيو أغويرو'],
    difficulty: 'easy',
    gameMode: 'trivia',
    type: 'text',
    explanation: 'هو قائد منتخب الأرجنتين.',
    assetRequest: null,
    ...overrides,
  });

  it('passes a fully Arabic football question', () => {
    expect(validator.validate(candidate(), fact, 'ar').status).toBe('PASS');
  });
  it('marks a fully English question under Arabic locale as repairable', () => {
    const result = validator.validate(
      candidate({
        question:
          'Who is the Argentine professional footballer who captains Argentina?',
      }),
      fact,
      'ar',
    );
    expect(result.status).toBe('REPAIRABLE');
    expect(result.issueCodes).toContain('OUTPUT_LANGUAGE_MISMATCH');
  });
  it.each([
    'من هو اللاعب المعروف باسم Lionel Messi؟',
    'من فاز ببطولة UEFA Champions League في ذلك الموسم؟',
  ])('allows official proper names in Arabic: %s', (question) => {
    expect(validator.validate(candidate({ question }), fact, 'ar').status).toBe(
      'PASS',
    );
  });
  it('fails an excessively mixed Arabic/English sentence', () => {
    const result = validator.validate(
      candidate({
        question: 'من هو player who became the captain وقاد team to the final؟',
      }),
      fact,
      'ar',
    );
    expect(result.status).toBe('FAIL');
    expect(result.issueCodes).toContain('OUTPUT_LANGUAGE_MIXED_EXCESSIVELY');
  });
  it('flags unsupported English wrong answers for repair', () => {
    const result = validator.validate(
      candidate({ wrongAnswers: ['Neymar', 'Kylian Mbappe', 'Harry Kane'] }),
      fact,
      'ar',
    );
    expect(result.issueCodes).toContain('WRONG_ANSWERS_LANGUAGE_MISMATCH');
  });
});
