import { normalizeAnswer } from './answer-normalization.util';
import {
  C4_GUARDED_V1,
  EXACT_ANSWER_MATCH,
  fingerprintAnswers,
  editDistance,
  isAnswerGuardCurrent,
  matchAcceptedAnswer,
  metricEditDistance,
  type AnswerGuard,
  type AnswerMatchPolicy,
} from './answer-matching.util';

/** The comparison every `match` mechanic made inline before the shared matcher. */
const inlineVerdict = (submitted: string, accepted: readonly string[]) =>
  accepted.map(normalizeAnswer).includes(normalizeAnswer(submitted));

/**
 * Inputs spanning everything the normalizer distinguishes or folds: Arabic
 * orthography, articles, Latin, punctuation, numbers, invisible characters and
 * input that normalizes to nothing.
 */
const CORPUS = [
  'الصياد',
  'صياد',
  'الصباد',
  'الصيادد',
  'Hunter',
  'hunter',
  'Hnter',
  'هنتر',
  'أحمد',
  'احمد',
  'إبراهيم',
  'مصطفى',
  'مصطفي',
  'مدرسة',
  'مدرسه',
  'مـدريد',
  'مسؤول',
  'مسئول',
  'ٱلله',
  'الله',
  'له',
  'كأس العالم',
  'كاس عالم',
  'The Beatles',
  'Beatles',
  'Spider-Man',
  'Spiderman',
  'spider man',
  'Pelé',
  'pele',
  '2018',
  '٢٠١٨',
  '۲۰۱۸',
  '3.14',
  '3 14',
  'FIFA 23',
  'ريال مدريد',
  'ريال مدريد',
  'ريال‌مدريد',
  'مدريد ريال',
  'ميسي؟',
  '«ميسي»',
  'فيجيتا',
  'فيجيتو',
  'مايك',
  'مايكل',
  '',
  '   ',
  '؟!',
];

describe('matchAcceptedAnswer — exact policy', () => {
  it('accepts a submission equal to an accepted answer after normalization', () => {
    expect(matchAcceptedAnswer('الأماكن', ['الاماكن'])).toEqual({
      matched: true,
      kind: 'exact',
      acceptedIndex: 0,
    });
  });

  it('names the first accepted answer that matched', () => {
    expect(matchAcceptedAnswer('احمد', ['محمد', 'أحمد', 'احمد'])).toMatchObject(
      { matched: true, acceptedIndex: 1 },
    );
  });

  it('rejects anything that is not equal after normalization', () => {
    // Typos are still wrong in Phase A: tolerance is not enabled.
    for (const typo of ['الصباد', 'الصيادد', 'صيا']) {
      expect(matchAcceptedAnswer(typo, ['الصياد'])).toEqual({ matched: false });
    }
    expect(matchAcceptedAnswer('Hnter', ['Hunter'])).toEqual({
      matched: false,
    });
    // No translation or transliteration is implied: only listed answers count.
    expect(matchAcceptedAnswer('هنتر', ['Hunter'])).toEqual({ matched: false });
    expect(matchAcceptedAnswer('هنتر', ['Hunter', 'هنتر']).matched).toBe(true);
  });

  it('rejects against an empty list', () => {
    expect(matchAcceptedAnswer('ميسي', [])).toEqual({ matched: false });
  });

  it("keeps the inline comparison's empty-input edge, which authoring makes unreachable", () => {
    // An accepted answer that normalizes to nothing is refused at authoring
    // (EMPTY_ACCEPTED_ANSWER). Only then could an empty submission match.
    expect(matchAcceptedAnswer('', ['ميسي']).matched).toBe(false);
    expect(matchAcceptedAnswer('؟', ['!']).matched).toBe(true);
  });

  it('defaults to the exact policy', () => {
    expect(matchAcceptedAnswer('احمد', ['أحمد'])).toEqual(
      matchAcceptedAnswer('احمد', ['أحمد'], EXACT_ANSWER_MATCH),
    );
  });

  it('refuses a policy it does not know instead of guessing', () => {
    expect(() =>
      matchAcceptedAnswer('a', ['a'], {
        kind: 'fuzzy',
      } as unknown as AnswerMatchPolicy),
    ).toThrow('Unknown answer match policy');
  });

  describe('equivalence with the inline comparison it replaces', () => {
    it('gives the same verdict for every submission against every accepted list', () => {
      const lists: string[][] = [
        ...CORPUS.map((answer) => [answer]),
        ['الصياد', 'Hunter'],
        ['مسؤول', 'مسئول'],
        ['ريال مدريد', 'Real Madrid', 'الريال'],
        ['2018', '٢٠١٨'],
        CORPUS,
      ];
      let compared = 0;
      for (const submitted of CORPUS) {
        for (const accepted of lists) {
          expect(matchAcceptedAnswer(submitted, accepted).matched).toBe(
            inlineVerdict(submitted, accepted),
          );
          compared += 1;
        }
      }
      expect(compared).toBe(CORPUS.length * lists.length);
    });
  });
});

describe('matchAcceptedAnswer — C4_GUARDED_V1', () => {
  /** A current guard for these answers, blocking what the World says it must. */
  const guardFor = (
    acceptedAnswers: string[],
    blockedAnswers: string[] = [],
  ): AnswerGuard => ({
    policyId: C4_GUARDED_V1.id,
    answersFingerprint: fingerprintAnswers(acceptedAnswers),
    catalogFingerprint: 'catalog',
    blockedAnswers: blockedAnswers.map(normalizeAnswer),
  });
  const tolerant = (
    acceptedAnswers: string[],
    blockedAnswers: string[] = [],
  ): AnswerMatchPolicy => ({
    kind: 'guarded-tolerant',
    config: C4_GUARDED_V1,
    guard: guardFor(acceptedAnswers, blockedAnswers),
  });
  const judge = (typed: string, accepted: string[], blocked: string[] = []) =>
    matchAcceptedAnswer(typed, accepted, tolerant(accepted, blocked));

  describe('the required examples', () => {
    it('accepts الصباد and الصيادد for الصياد', () => {
      expect(judge('الصباد', ['الصياد'])).toMatchObject({
        matched: true,
        kind: 'tolerant',
      });
      expect(judge('الصيادد', ['الصياد'])).toMatchObject({
        matched: true,
        kind: 'tolerant',
      });
    });

    it('accepts Hnter for Hunter', () => {
      expect(judge('Hnter', ['Hunter'])).toMatchObject({
        matched: true,
        kind: 'tolerant',
      });
    });

    it('accepts هنتر and الصياد only when they are approved answers', () => {
      expect(judge('هنتر', ['Hunter']).matched).toBe(false);
      expect(judge('الصياد', ['Hunter']).matched).toBe(false);
      expect(judge('هنتر', ['Hunter', 'هنتر'])).toMatchObject({
        matched: true,
        kind: 'exact',
        acceptedIndex: 1,
      });
      expect(judge('الصياد', ['Hunter', 'الصياد'])).toMatchObject({
        matched: true,
        kind: 'exact',
      });
    });

    it('rejects Shadow for Hunter', () => {
      expect(judge('Shadow', ['Hunter'])).toEqual({
        matched: false,
        tolerance: 'no-candidate',
      });
    });
  });

  describe('valid typos', () => {
    it.each([
      ['Arabic substitution', 'طوكبو', 'طوكيو'],
      ['Arabic insertion', 'بيكاتشوو', 'بيكاتشو'],
      ['Arabic deletion', 'رونلدو', 'رونالدو'],
      ['Arabic adjacent swap', 'رونادلو', 'رونالدو'],
      ['English deletion', 'Barcelna', 'Barcelona'],
      ['English swap', 'Huntre', 'Hunter'],
      ['English substitution', 'Ronaldp', 'Ronaldo'],
      ['one word of a multi-word answer', 'ريال مدرد', 'ريال مدريد'],
      ['one word of an English name', 'Micheal Jordan', 'Michael Jordan'],
      ['a four-letter word', 'مسي', 'ميسي'],
    ])('%s: %s for %s', (_case, typed, accepted) => {
      expect(judge(typed, [accepted])).toMatchObject({
        matched: true,
        kind: 'tolerant',
        acceptedIndex: 0,
      });
    });

    it('accepts a typo that is one edit from this answer but two from the sibling', () => {
      expect(judge('يوحي', ['يوجي'], ['توجي'])).toMatchObject({
        matched: true,
        kind: 'tolerant',
      });
    });

    it('prefers an exact approved answer over a typo of another', () => {
      expect(judge('ميسي', ['ميسى', 'Messi'])).toMatchObject({
        kind: 'exact',
      });
    });
  });

  describe('invalid answers', () => {
    it.each([
      [
        'a different entity one edit away, guarded',
        'فيجيتو',
        ['فيجيتا'],
        ['فيجيتو'],
      ],
      // Two edits apart, so neither accepts the other — but this typo is one
      // edit from both, and could be either empire.
      [
        'a typo one edit from this answer and from a different entity two edits away',
        'الإمبراطورية الرثمانية',
        ['الإمبراطورية الرومانية'],
        ['الإمبراطورية العثمانية'],
      ],
      [
        'a dropped first letter that fits a sibling just as well',
        'وجي',
        ['يوجي'],
        ['توجي'],
      ],
      ['Iraq for Iran, guarded', 'Iraq', ['Iran'], ['Iraq']],
      ['Mike for Michael, guarded', 'مايك', ['مايكل'], ['مايك']],
    ])('%s', (_case, typed, accepted, blocked) => {
      expect(judge(typed, accepted, blocked)).toEqual({
        matched: false,
        tolerance: 'guard-blocked',
      });
    });

    it.each([
      ['a three-letter word', 'كيم', ['كين']],
      ['a three-letter Latin word', 'Zen', ['Zed']],
      ['a doubled letter on a three-letter word', 'نيوو', ['نيو']],
      ['a different year', '2019', ['2018']],
      ['the same year in other digits', '٢٠١٨', ['2018']],
      ['a different edition', 'FIFA 22', ['FIFA 23']],
      ['an acronym one letter off', 'NEON', ['NEOM']],
      ['two fuzzy words', 'ريل مدرد', ['ريال مدريد']],
      ['two edits in one word', 'رنلدو', ['رونالدو']],
      ['a missing word', 'مدريد', ['ريال مدريد']],
      ['a different entity several edits away', 'Ronaldinho', ['Ronaldo']],
      ['an unapproved translation', 'Hunter', ['الصياد']],
    ])('%s', (_case, typed, accepted) => {
      expect(judge(typed, accepted).matched).toBe(false);
    });

    it('rejects an empty submission even against an answer that normalizes to nothing', () => {
      expect(judge('؟', ['!'])).toEqual({
        matched: false,
        tolerance: 'empty-submission',
      });
      expect(judge('   ', ['ميسي']).matched).toBe(false);
    });

    it('refuses a malformed policy', () => {
      for (const config of [
        { ...C4_GUARDED_V1, maxEditsPerWord: 2 },
        { ...C4_GUARDED_V1, oneEditFromLength: 0 },
        { ...C4_GUARDED_V1, id: '' },
        { ...C4_GUARDED_V1, maxFuzzyWords: 1.5 },
      ]) {
        expect(() =>
          matchAcceptedAnswer('a', ['a'], {
            kind: 'guarded-tolerant',
            config,
          }),
        ).toThrow('Malformed answer match policy');
      }
    });
  });

  describe('a guard that cannot be trusted means exact only', () => {
    it('keeps exact answers accepted without any guard', () => {
      expect(
        matchAcceptedAnswer('الصياد', ['الصياد'], {
          kind: 'guarded-tolerant',
          config: C4_GUARDED_V1,
        }),
      ).toMatchObject({ matched: true, kind: 'exact' });
    });

    it('refuses a typo when the guard is missing', () => {
      expect(
        matchAcceptedAnswer('الصباد', ['الصياد'], {
          kind: 'guarded-tolerant',
          config: C4_GUARDED_V1,
        }),
      ).toEqual({ matched: false, tolerance: 'guard-missing' });
    });

    it('refuses a typo when the guard was built for another policy version', () => {
      expect(
        matchAcceptedAnswer('الصباد', ['الصياد'], {
          kind: 'guarded-tolerant',
          config: C4_GUARDED_V1,
          guard: { ...guardFor(['الصياد']), policyId: 'c4-guarded-v0' },
        }),
      ).toEqual({ matched: false, tolerance: 'guard-stale' });
    });

    it('refuses a typo when the answers changed after the guard was built', () => {
      expect(
        matchAcceptedAnswer('الصباد', ['الصياد', 'Hunter'], {
          kind: 'guarded-tolerant',
          config: C4_GUARDED_V1,
          guard: guardFor(['الصياد']),
        }),
      ).toEqual({ matched: false, tolerance: 'guard-stale' });
    });

    it('refuses a typo when the guard is malformed', () => {
      expect(
        matchAcceptedAnswer('الصباد', ['الصياد'], {
          kind: 'guarded-tolerant',
          config: C4_GUARDED_V1,
          guard: {
            ...guardFor(['الصياد']),
            blockedAnswers: 'nothing' as unknown as string[],
          },
        }),
      ).toEqual({ matched: false, tolerance: 'guard-stale' });
    });

    it('detects a guard built from a different catalog, when the caller knows the current one', () => {
      const guard = guardFor(['الصياد']);
      const input = { config: C4_GUARDED_V1, acceptedAnswers: ['الصياد'] };
      expect(isAnswerGuardCurrent(guard, input)).toBe(true);
      expect(
        isAnswerGuardCurrent(guard, {
          ...input,
          catalogFingerprint: 'catalog',
        }),
      ).toBe(true);
      expect(
        isAnswerGuardCurrent(guard, { ...input, catalogFingerprint: 'newer' }),
      ).toBe(false);
    });
  });

  it('keeps every approved answer exact, even where tolerance is refused', () => {
    // The guard and the protections only ever refuse *typos*. An approved
    // alias — a transliteration, a model code, a year — is still exact.
    const accepted = ['بورشه 911', 'Porsche 911', 'بورش'];
    const blocked = ['بورشه 912'];
    expect(judge('Porsche 911', accepted, blocked)).toMatchObject({
      matched: true,
      kind: 'exact',
      acceptedIndex: 1,
    });
    expect(judge('بورش', accepted, blocked)).toMatchObject({
      matched: true,
      kind: 'exact',
    });
    // While the typo of the protected answer is refused, as it should be.
    expect(judge('Porsche 912', accepted, blocked).matched).toBe(false);
  });

  it('leaves the exact policy exactly as it was', () => {
    expect(matchAcceptedAnswer('الصباد', ['الصياد'])).toEqual({
      matched: false,
    });
  });
});

describe('edit distances', () => {
  it.each([
    ['', '', 0],
    ['abc', 'abc', 0],
    ['ab', 'ba', 1],
    ['hunter', 'hnter', 1],
    ['صياد', 'صباد', 1],
    ['kitten', 'sitting', 3],
  ])('%s ↔ %s is %d under both', (left, right, distance) => {
    expect(editDistance(left, right, 9)).toBe(distance);
    expect(metricEditDistance(left, right)).toBe(distance);
  });

  it('differ only where restricted distance breaks the triangle inequality', () => {
    expect(editDistance('ca', 'abc', 9)).toBe(3);
    expect(metricEditDistance('ca', 'abc')).toBe(2);
    expect(editDistance('تليفون', 'تلفزيون', 9)).toBe(3);
    expect(metricEditDistance('تليفون', 'تلفزيون')).toBe(2);
  });
});
