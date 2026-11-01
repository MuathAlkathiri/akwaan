import { FactVerificationResult } from './fact-verification.types';
import { LibrarySeed } from './library-sourcing';
import {
  bindStructuredSeed,
  factVerificationAfterEdit,
  seedsForCandidate,
  windowTokens,
  withSeedBinding,
} from './structured-seed-binding';

const TODAY = '2026-11-01';

const seed = (over: Partial<LibrarySeed> = {}): LibrarySeed => ({
  libraryId: 'LIB-021',
  role: 'EXEMPLAR_CANDIDATE',
  questionText: 'ماذا كان دور دوما البشري قبل أن يصبح شيطانًا؟',
  verifiedAnswer: 'زعيم طائفة دينية',
  canonicalAnswer: 'زعيم طائفة دينية',
  canonicalNumber: null,
  sourceUrl: 'https://otakumode.com/doma',
  verifiedOn: '2026-11-01',
  revalidateAfter: null,
  sourceWarning: 'WEAK_SOURCE',
  ...over,
});

const ryoDraft = (correctLabel: string, prompt = 'ما كان عمل دوما؟') => ({
  prompt: { ar: prompt },
  answerPayload: {
    mode: 'multiple_choice',
    correctOptionId: 'a',
    options: [
      { id: 'a', label: { ar: correctLabel } },
      { id: 'b', label: { ar: 'طبيب نفسي' } },
    ],
  },
});

const closestDraft = (correctValue: number, prompt: string) => ({
  prompt: { ar: prompt },
  answerPayload: { mode: 'closest', correctValue },
});

const season = seed({
  libraryId: 'LIB-069',
  questionText: 'كم نقطة حقق الهلال بطلًا للدوري السعودي في موسم 2023–24؟',
  verifiedAnswer: '96 نقطة',
  canonicalAnswer: '96 نقطة',
  canonicalNumber: 96,
  sourceUrl: 'https://en.wikipedia.org/wiki/2023-24_Al_Hilal',
  sourceWarning: null,
});

describe('windowTokens', () => {
  it.each([
    ['موسم 2023–24', ['2023-24']],
    ['موسم 2023/24', ['2023-24']],
    ['موسم 2023-2024', ['2023-24']],
    ['موسم ٢٠٢٣–٢٤', ['2023-24']],
    ['بين 2002 و2026', ['2002', '2026']],
    ['كم نادٍ فاز باللقب؟', []],
  ])('reads %s', (text, expected) => {
    expect(windowTokens(text)).toEqual(expected);
  });

  it('does not read a plain large number as a year', () => {
    expect(windowTokens('سجل 3500 هدف من 12345 محاولة')).toEqual([]);
  });
});

describe('bindStructuredSeed', () => {
  it('covers a candidate that keeps the exact answer', () => {
    const binding = bindStructuredSeed({
      draft: ryoDraft('زعيم طائفة دينية'),
      seeds: [seed()],
      today: TODAY,
    });
    expect(binding).toMatchObject({ covered: true, libraryId: 'LIB-021' });
  });

  it('attaches the source and verification date to the evidence', () => {
    const binding = bindStructuredSeed({
      draft: ryoDraft('زعيم طائفة دينية'),
      seeds: [seed()],
      today: TODAY,
    });
    expect(binding.covered && binding.evidence).toMatchObject({
      method: 'structured-seed',
      url: 'https://otakumode.com/doma',
      verifiedOn: '2026-11-01',
      relation: 'supports',
      sourceWarning: 'WEAK_SOURCE',
    });
  });

  it('does not stretch to a near answer', () => {
    expect(
      bindStructuredSeed({
        draft: ryoDraft('زعيم طائفة'),
        seeds: [seed()],
        today: TODAY,
      }),
    ).toEqual({ covered: false, reason: 'ANSWER_CHANGED', libraryId: null });
    expect(
      bindStructuredSeed({
        draft: ryoDraft('زعيم طائفة «الجنة الأبدية»'),
        seeds: [seed()],
        today: TODAY,
      }),
    ).toMatchObject({ covered: false, reason: 'ANSWER_CHANGED' });
  });

  it('reads the keyed option, not any option on the card', () => {
    const draft = ryoDraft('طبيب نفسي');
    draft.answerPayload.options[1].label.ar = 'زعيم طائفة دينية';
    expect(
      bindStructuredSeed({ draft, seeds: [seed()], today: TODAY }),
    ).toMatchObject({ covered: false, reason: 'ANSWER_CHANGED' });
  });

  it('covers a Closest candidate on the exact number and same season', () => {
    expect(
      bindStructuredSeed({
        draft: closestDraft(96, 'كم نقطة جمع الهلال في موسم 2023/24؟'),
        seeds: [season],
        today: TODAY,
      }),
    ).toMatchObject({ covered: true, libraryId: 'LIB-069' });
  });

  it('does not cover a different number', () => {
    expect(
      bindStructuredSeed({
        draft: closestDraft(95, 'كم نقطة جمع الهلال في موسم 2023–24؟'),
        seeds: [season],
        today: TODAY,
      }),
    ).toMatchObject({ covered: false, reason: 'ANSWER_CHANGED' });
  });

  it.each([
    ['moves it to another season', 'كم نقطة جمع الهلال في موسم 2022–23؟'],
    ['drops the season', 'كم نقطة جمع الهلال؟'],
    ['adds a second window', 'كم نقطة جمع الهلال في موسم 2023–24 و2024–25؟'],
  ])('does not cover a question that %s', (_label, prompt) => {
    expect(
      bindStructuredSeed({
        draft: closestDraft(96, prompt),
        seeds: [season],
        today: TODAY,
      }),
    ).toEqual({
      covered: false,
      reason: 'WINDOW_CHANGED',
      libraryId: 'LIB-069',
    });
  });

  it('does not cover a question that adds a window the row never had', () => {
    expect(
      bindStructuredSeed({
        draft: ryoDraft('زعيم طائفة دينية', 'ما كان عمل دوما في عام 2020؟'),
        seeds: [seed()],
        today: TODAY,
      }),
    ).toMatchObject({ covered: false, reason: 'WINDOW_CHANGED' });
  });

  it('honours evidence until its revalidation date, then expires it', () => {
    const dated = seed({ revalidateAfter: '2027-05-31' });
    const draft = ryoDraft('زعيم طائفة دينية');
    expect(
      bindStructuredSeed({ draft, seeds: [dated], today: '2027-05-31' }),
    ).toMatchObject({ covered: true, revalidateAfter: '2027-05-31' });
    expect(
      bindStructuredSeed({ draft, seeds: [dated], today: '2027-06-01' }),
    ).toEqual({
      covered: false,
      reason: 'EVIDENCE_EXPIRED',
      libraryId: 'LIB-021',
    });
  });

  it('binds to whichever pinned row the answer belongs to', () => {
    expect(
      bindStructuredSeed({
        draft: closestDraft(96, 'كم نقطة جمع الهلال في موسم 2023–24؟'),
        seeds: [seed(), season],
        today: TODAY,
      }),
    ).toMatchObject({ covered: true, libraryId: 'LIB-069' });
  });

  it('refuses a mode it cannot read', () => {
    expect(
      bindStructuredSeed({
        draft: { prompt: { ar: 'س' }, answerPayload: { mode: 'top_5' } },
        seeds: [seed()],
        today: TODAY,
      }),
    ).toMatchObject({ covered: false, reason: 'ANSWER_CHANGED' });
    expect(
      bindStructuredSeed({ draft: null, seeds: [seed()], today: TODAY }),
    ).toMatchObject({ covered: false });
  });
});

describe('seedsForCandidate', () => {
  it('returns only the rows of the candidate slot', () => {
    expect(
      seedsForCandidate({ seeds: [seed(), season] } as never, {
        libraryIds: ['LIB-069'],
      }).map((row) => row.libraryId),
    ).toEqual(['LIB-069']);
  });

  it('returns nothing for exploratory and legacy candidates', () => {
    expect(seedsForCandidate(undefined, null)).toEqual([]);
    expect(
      seedsForCandidate({ seeds: [] } as never, { libraryIds: [] }),
    ).toEqual([]);
  });
});

describe('withSeedBinding', () => {
  const covered = bindStructuredSeed({
    draft: ryoDraft('زعيم طائفة دينية'),
    seeds: [seed()],
    today: TODAY,
  });
  const base = (
    state: FactVerificationResult['state'],
  ): FactVerificationResult => ({
    state,
    claims: [{ claim: 'ادعاء', state, evidence: [], attempts: 1, reason: 'R' }],
    automaticAdvance: false,
  });

  it('supports the answer claim from the row', () => {
    const result = withSeedBinding(base('SUPPORTED'), covered);
    expect(result.state).toBe('SUPPORTED');
    expect(result.automaticAdvance).toBe(true);
    expect(result.claims[0]).toMatchObject({
      claim: 'زعيم طائفة دينية',
      state: 'SUPPORTED',
      reason: 'STRUCTURED_SEED_EXACT_MATCH',
    });
  });

  it.each(['UNRESOLVED', 'UNSUPPORTED', 'CONTRADICTED'] as const)(
    'cannot lift a candidate past a model claim that is %s',
    (state) => {
      const result = withSeedBinding(base(state), covered);
      expect(result.state).toBe(state);
      expect(result.automaticAdvance).toBe(false);
    },
  );

  it('leaves an uncovered candidate on normal verification, with the reason', () => {
    const notCovered = {
      covered: false as const,
      reason: 'ANSWER_CHANGED' as const,
      libraryId: null,
    };
    expect(withSeedBinding(base('UNSUPPORTED'), notCovered)).toEqual({
      ...base('UNSUPPORTED'),
      seedBinding: notCovered,
    });
  });
});

describe('factVerificationAfterEdit', () => {
  const edit = (label: string, claims: string[]) =>
    factVerificationAfterEdit({
      draft: ryoDraft(label),
      seeds: [seed()],
      claims,
      today: TODAY,
    });

  it('keeps coverage when the edit keeps the fact', () => {
    const result = edit('زعيم طائفة دينية', ['ادعاء']);
    expect(result.seedBinding?.covered).toBe(true);
    expect(result.state).toBe('UNRESOLVED');
  });

  it('drops coverage when the edit changes the answer', () => {
    const result = edit('طبيب', ['ادعاء']);
    expect(result.seedBinding).toMatchObject({
      covered: false,
      reason: 'ANSWER_CHANGED',
    });
    expect(result.claims.map((claim) => claim.state)).toEqual(['UNRESOLVED']);
    expect(result.automaticAdvance).toBe(false);
  });

  it('does not let emptied claims pass an uncovered candidate', () => {
    const result = edit('طبيب', []);
    expect(result.state).toBe('UNRESOLVED');
    expect(result.automaticAdvance).toBe(false);
  });
});
