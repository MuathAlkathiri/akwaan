import { SourceQuestionNormalizerService } from './source-question-normalizer.service';

describe('SourceQuestionNormalizerService', () => {
  const service = new SourceQuestionNormalizerService();
  const raw = (overrides = {}) => ({
    sourceId: 's',
    sourceUrl: 'https://s',
    sourceCategory: 'General',
    question: 'Who &amp; where?',
    correctAnswer: 'A',
    incorrectAnswers: ['B', 'C', 'D'],
    type: 'multiple' as const,
    difficulty: 'easy' as const,
    ...overrides,
  });
  it('decodes HTML entities', () =>
    expect(service.normalize(raw())?.originalQuestion).toBe('Who & where?'));
  it('decodes numeric entities', () =>
    expect(service.clean('A &#38; B &#x26; C')).toBe('A & B & C'));
  it('normalizes unicode and whitespace', () =>
    expect(service.clean('  Ａ\n B  ')).toBe('A B'));
  it('strips markup', () =>
    expect(service.clean('<b>Hello</b>')).toBe('Hello'));
  it('rejects an empty question', () =>
    expect(service.normalize(raw({ question: ' <b></b> ' }))).toBeNull());
  it('rejects media-only content', () =>
    expect(service.normalize(raw({ question: '🎵🎵' }))).toBeNull());
  it('rejects duplicate options', () =>
    expect(
      service.normalize(raw({ incorrectAnswers: ['A', 'B', 'C'] })),
    ).toBeNull());
  it('creates stable fingerprints', () =>
    expect(service.normalize(raw())?.fingerprint).toBe(
      service.normalize(raw())?.fingerprint,
    ));
  it('deduplicates exact source candidates', () => {
    const candidate = service.normalize(raw())!;
    expect(service.deduplicate([candidate, candidate])).toHaveLength(1);
  });
});
