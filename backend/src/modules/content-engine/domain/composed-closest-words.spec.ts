import {
  WORD_CLOSEST_VARIANTS,
  composeWordClosest,
  hasDots,
  isWordClosestFamily,
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
  it('offers one family of six templates', () => {
    expect(families).toHaveLength(1);
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

  describe('the answers are worked out, not written down', () => {
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
