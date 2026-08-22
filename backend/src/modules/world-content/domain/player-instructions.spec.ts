import {
  hasCompletePlayerInstructions,
  normalizePlayerInstructions,
  normalizePresentation,
} from './world-content.types';

/**
 * The mechanic-canonical player instructions, as the persistence and read paths
 * treat them. These are the rules every other layer relies on: the board
 * projection, the readiness warning, and the Match preflight all sit downstream
 * of `normalizePresentation`, so the guarantees below are what they inherit.
 */
describe('player instructions normalization', () => {
  it('keeps a fully authored object and preserves step order', () => {
    const result = normalizePlayerInstructions({
      summary: 'اقرأ خصمك.',
      steps: ['اختر توقعك', 'اكشفوا معًا', 'قارنوا النتيجة'],
      highlights: ['لا تكشف مبكرًا'],
    });
    expect(result).toEqual({
      summary: 'اقرأ خصمك.',
      steps: ['اختر توقعك', 'اكشفوا معًا', 'قارنوا النتيجة'],
      highlights: ['لا تكشف مبكرًا'],
    });
    // Order is data the player reads top to bottom — it must survive verbatim.
    expect(result?.steps).toEqual([
      'اختر توقعك',
      'اكشفوا معًا',
      'قارنوا النتيجة',
    ]);
  });

  it('trims every field and drops whitespace-only rows', () => {
    const result = normalizePlayerInstructions({
      summary: '   اقرأ خصمك.   ',
      steps: ['  اختر توقعك  ', '   ', ''],
      highlights: ['  ', 'نصيحة'],
    });
    expect(result).toEqual({
      summary: 'اقرأ خصمك.',
      steps: ['اختر توقعك'],
      highlights: ['نصيحة'],
    });
  });

  it('omits highlights entirely when none survive rather than leaving an empty array', () => {
    const result = normalizePlayerInstructions({
      summary: 'ملخص',
      steps: ['خطوة'],
      highlights: ['   ', ''],
    });
    expect(result).toEqual({ summary: 'ملخص', steps: ['خطوة'] });
    expect(result && 'highlights' in result).toBe(false);
  });

  it('normalizes a blank or half-empty form to null so it reads as "not authored"', () => {
    expect(normalizePlayerInstructions(null)).toBeNull();
    expect(normalizePlayerInstructions(undefined)).toBeNull();
    expect(
      normalizePlayerInstructions({ summary: '   ', steps: ['  ', ''] }),
    ).toBeNull();
  });

  it('carries player instructions through the presentation normalizer', () => {
    const presentation = normalizePresentation({
      inputType: 'phone-multiple-choice',
      timerSeconds: 25,
      playerInstructions: {
        summary: '  ملخص  ',
        steps: ['  خطوة  '],
      },
    });
    expect(presentation.playerInstructions).toEqual({
      summary: 'ملخص',
      steps: ['خطوة'],
    });
  });

  it('reads a legacy presentation with no instructions without crashing', () => {
    // A ChallengeType authored before this field existed. It must normalize to a
    // readable record whose instructions are simply absent, not throw.
    const presentation = normalizePresentation({
      inputType: 'phone-multiple-choice',
      timerSeconds: 25,
    });
    expect(presentation.playerInstructions).toBeNull();
  });

  describe('readiness', () => {
    it('is complete only with a summary and at least one step', () => {
      expect(
        hasCompletePlayerInstructions({
          playerInstructions: { summary: 'ملخص', steps: ['خطوة'] },
        }),
      ).toBe(true);
    });

    it('is incomplete with a summary but no steps', () => {
      expect(
        hasCompletePlayerInstructions({
          playerInstructions: { summary: 'ملخص', steps: [] },
        }),
      ).toBe(false);
    });

    it('is incomplete when nothing is authored', () => {
      expect(hasCompletePlayerInstructions(undefined)).toBe(false);
      expect(hasCompletePlayerInstructions({})).toBe(false);
    });
  });
});
