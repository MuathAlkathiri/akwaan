import {
  SAFE_LETTERS,
  WORD_CLOSEST_VARIANTS,
  composeWordClosest,
  countLetter,
  hasDots,
  isWordClosestFamily,
  lettersOf,
  paragraphs,
  plainSentences,
} from './composed-closest-words';
import { placeable } from './composed-closest-paths';
import { CLOSEST_VARIANTS, composeClosest } from './composed-closest';
import { LETTER_WORDS } from './composed-letters';

const families = Object.keys(WORD_CLOSEST_VARIANTS) as Array<
  keyof typeof WORD_CLOSEST_VARIANTS
>;
const every = families.flatMap((familyKey) =>
  (WORD_CLOSEST_VARIANTS[familyKey] as readonly string[]).map(
    (variantKey) => [familyKey, variantKey] as const,
  ),
);
const SEEDS = ['w:0', 'w:1', 'w:2', 'w:3', 'w:4', 'x:7', 'x:11'];

describe('مين أقرب in الكلمات والحروف', () => {
  it('offers three families of six templates each', () => {
    expect(families).toHaveLength(3);
    for (const familyKey of families)
      expect(WORD_CLOSEST_VARIANTS[familyKey]).toHaveLength(6);
  });

  it('every one of them is reachable through composeClosest', () => {
    for (const [familyKey, variantKey] of every) {
      expect(isWordClosestFamily(familyKey)).toBe(true);
      expect(CLOSEST_VARIANTS[familyKey]).toContain(variantKey);
      const reading = composeClosest(familyKey, 'w:1', variantKey);
      expect(reading.familyKey).toBe(familyKey);
      expect(reading.variantKey).toBe(variantKey);
    }
  });

  it.each(every)(
    '%s / %s draws a whole answer inside its slider',
    (familyKey, variantKey) => {
      for (const seed of SEEDS) {
        const reading = composeWordClosest(familyKey, seed, variantKey);
        expect(Number.isInteger(reading.value)).toBe(true);
        expect(reading.value).toBeGreaterThan(0);
        expect(reading.value).toBeLessThanOrEqual(reading.slider.max);
        expect(reading.svg).toContain('</svg>');
      }
    },
  );

  it.each(every)(
    '%s / %s never writes its own answer in the question',
    (familyKey, variantKey) => {
      for (const seed of SEEDS) {
        const reading = composeWordClosest(familyKey, seed, variantKey);
        expect(reading.prompt).not.toContain(String(reading.value));
      }
    },
  );

  it.each(every)(
    '%s / %s gives one batch more than one picture',
    (familyKey, variantKey) => {
      const drawn = SEEDS.map(
        (seed) => composeWordClosest(familyKey, seed, variantKey).svg,
      );
      expect(new Set(drawn).size).toBeGreaterThanOrEqual(4);
    },
  );

  it('reads the owner\u2019s sentences without their brackets', () => {
    const lines = plainSentences();
    expect(lines.length).toBeGreaterThanOrEqual(30);
    for (const line of lines) {
      expect(line).not.toContain('[');
      expect(line).not.toContain(']');
    }
  });

  it('never asks about a letter a player could argue the shape of', () => {
    // The alef's hamzas, ة against ت, ى against ي: all left out on purpose.
    for (const { letter } of Object.values(SAFE_LETTERS))
      expect('اأإآةتىي').not.toContain(letter);
  });

  // The whole point of the two text families: a number a team could reach by
  // counting is a chore, so the block is always far past counting.
  it('writes a block nobody counts through in the time', () => {
    for (const seed of SEEDS) {
      for (const variantKey of WORD_CLOSEST_VARIANTS['letters-in-text'])
        expect(
          composeWordClosest('letters-in-text', seed, variantKey).value,
        ).toBeGreaterThan(100);
      for (const variantKey of WORD_CLOSEST_VARIANTS['letter-repeats'])
        expect(
          composeWordClosest('letter-repeats', seed, variantKey).value,
        ).toBeGreaterThanOrEqual(8);
    }
  });

  describe('the answers are worked out, not written down', () => {
    it('counts the letters of the block it shows, spaces aside', () => {
      for (const seed of SEEDS)
        for (const variantKey of WORD_CLOSEST_VARIANTS['letters-in-text']) {
          const reading = composeWordClosest(
            'letters-in-text',
            seed,
            variantKey,
          );
          const [, written] = reading.variant.split(':');
          expect(reading.value).toBe(Number(written));
          const shown = [
            ...reading.svg.matchAll(/fill="#2F6FE0">([^<]+)<\/text>/g),
          ].map((found) => found[1]);
          expect(lettersOf(shown.join(' ').split(' • '))).toBe(reading.value);
        }
    });

    it('counts one letter across the block it shows', () => {
      for (const seed of SEEDS)
        for (const variantKey of WORD_CLOSEST_VARIANTS['letter-repeats']) {
          const reading = composeWordClosest(
            'letter-repeats',
            seed,
            variantKey,
          );
          const [, letter] = reading.variant.split(':');
          const shown = [
            ...reading.svg.matchAll(/fill="#2F6FE0">([^<]+)<\/text>/g),
          ].map((found) => found[1]);
          expect(countLetter(shown, letter)).toBe(reading.value);
          if (variantKey !== 'mixed')
            expect(SAFE_LETTERS[variantKey].letter).toBe(letter);
        }
    });

    it('builds blocks of six to ten sentences', () => {
      for (const howMany of [6, 8, 10]) {
        const found = paragraphs(howMany);
        expect(found.length).toBeGreaterThan(20);
        for (const block of found) expect(block).toHaveLength(howMany);
      }
    });

    it('breaks the row rule at exactly one place, and keeps it everywhere else', () => {
      for (const seed of SEEDS)
        for (const variantKey of WORD_CLOSEST_VARIANTS['odd-word-place']) {
          const reading = composeWordClosest(
            'odd-word-place',
            seed,
            variantKey,
          );
          const [, mark, odd, word] = reading.variant.split(':');
          expect(reading.value).toBe(Number(odd));
          expect(placeable(reading.value, reading.slider.max)).toBe(true);
          const keeps = (one: string): boolean => {
            if (variantKey === 'same-last') return one.endsWith(mark);
            if (variantKey === 'same-first') return one.startsWith(mark);
            if (variantKey === 'same-length')
              return one.length === Number(mark);
            if (variantKey === 'has-letter') return one.includes(mark);
            if (variantKey === 'dotless') return !hasDots(one);
            return hasDots(one);
          };
          const row = [
            ...reading.svg.matchAll(
              /font-size="32" fill="#1B1F3B">([^<]+)<\/text>/g,
            ),
          ].map((found) => found[1]);
          expect(row).toHaveLength(reading.slider.max);
          expect(row[Number(odd)]).toBe(word);
          // The row is the rule: one word off it, every other word on it.
          row.forEach((one, index) => {
            expect(LETTER_WORDS).toContain(one);
            expect(keeps(one)).toBe(index !== Number(odd));
          });
        }
    });

    it('knows a dotted word from a dotless one', () => {
      expect(hasDots('ملح')).toBe(false);
      expect(hasDots('سلام')).toBe(false);
      expect(hasDots('بيت')).toBe(true);
      expect(hasDots('نجم')).toBe(true);
    });
  });
});
