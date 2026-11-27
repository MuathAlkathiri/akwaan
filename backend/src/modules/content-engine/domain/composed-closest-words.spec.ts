import {
  COLUMN_SHAPES,
  PATH_SHAPES,
  WORD_CLOSEST_VARIANTS,
  composeWordClosest,
  hasDots,
  isWordClosestFamily,
  wordPaths,
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
  it('offers four families of six templates', () => {
    expect(families).toHaveLength(4);
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

  describe('«كم كلمة نجت؟» deals the wall to its own answer', () => {
    const rebuild = (variantKey: string, code: string) => {
      const parts = code.split('|');
      if (variantKey === 'has-either')
        return (word: string) =>
          word.includes(parts[0]) || word.includes(parts[1]);
      if (variantKey === 'length-has')
        return (word: string) =>
          word.length === Number(parts[0]) && word.includes(parts[1]);
      if (variantKey === 'length-not')
        return (word: string) =>
          word.length === Number(parts[0]) && !word.includes(parts[1]);
      if (variantKey === 'starts-group')
        return (word: string) => parts.includes(word[0]);
      if (variantKey === 'ends-group')
        return (word: string) => parts.includes(word[word.length - 1]);
      return (word: string) =>
        word.includes(parts[0]) && !word.includes(parts[1]);
    };

    it.each(WORD_CLOSEST_VARIANTS['survivor-words'])(
      '%s puts exactly its answer many passing cards on the wall',
      (variantKey) => {
        for (const seed of SEEDS) {
          const reading = composeWordClosest(
            'survivor-words',
            seed,
            variantKey,
          );
          const [, code, written] = reading.variant.split(':');
          expect(Number(written)).toBe(reading.value);
          const cards = [
            ...reading.svg.matchAll(
              /font-size="26" fill="#1B1F3B">([^<]+)<\/text>/g,
            ),
          ].map((found) => found[1]);
          expect(cards).toHaveLength(45);
          for (const card of cards) expect(LETTER_WORDS).toContain(card);
          expect(new Set(cards).size).toBe(cards.length);
          expect(cards.filter(rebuild(variantKey, code))).toHaveLength(
            reading.value,
          );
        }
      },
    );
  });

  describe('«كم طريق للكلمة؟» counts the walks it drew', () => {
    it.each(WORD_CLOSEST_VARIANTS['word-paths'])(
      '%s draws a board whose walks come to the answer',
      (variantKey) => {
        const shape = PATH_SHAPES[variantKey];
        for (const seed of SEEDS) {
          const reading = composeWordClosest('word-paths', seed, variantKey);
          const [, word] = reading.variant.split(':');
          expect(LETTER_WORDS).toContain(word);
          const letters = [
            ...reading.svg.matchAll(
              /font-size="\d+" fill="#1B1F3B">(.)<\/text>/g,
            ),
          ].map((found) => found[1]);
          expect(letters).toHaveLength(shape.rows * shape.cols);
          const grid: string[][] = [];
          for (let row = 0; row < shape.rows; row += 1)
            grid.push(letters.slice(row * shape.cols, (row + 1) * shape.cols));
          expect(wordPaths(grid, word)).toBe(reading.value);
          expect(reading.value).toBeLessThanOrEqual(shape.max);
        }
      },
    );
  });

  describe('«الأعمدة المتحركة» deals the list to its own answer', () => {
    it.each(WORD_CLOSEST_VARIANTS['column-words'])(
      '%s lists exactly its answer many words the columns build',
      (variantKey) => {
        const shape = COLUMN_SHAPES[variantKey];
        for (const seed of SEEDS) {
          const reading = composeWordClosest('column-words', seed, variantKey);
          const [, written, value] = reading.variant.split(':');
          expect(Number(value)).toBe(reading.value);
          const columns = written.split('|').map((one) => one.split(''));
          expect(columns).toHaveLength(shape.length);
          for (const column of columns)
            expect(column).toHaveLength(shape.letters);
          const list = [
            ...reading.svg.matchAll(
              /font-size="27" fill="#1B1F3B">([^<]+)<\/text>/g,
            ),
          ].map((found) => found[1]);
          expect(list).toHaveLength(shape.list);
          for (const word of list) {
            expect(LETTER_WORDS).toContain(word);
            expect(word).toHaveLength(shape.length);
          }
          const fits = list.filter((word) =>
            word
              .split('')
              .every((letter, place) => columns[place].includes(letter)),
          );
          expect(fits).toHaveLength(reading.value);
        }
      },
    );
  });
});
