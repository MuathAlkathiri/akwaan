import {
  LETTERS_VARIANTS,
  LETTER_WORDS,
  composeLetters,
  letterThings,
} from './composed-letters';
import { COMPOSED_PUZZLE_VARIANTS, composePuzzle } from './composed-puzzles';
import { drawnThings } from './drawn-things';

const seeds = Array.from({ length: 150 }, (_, index) => `job:${index}`);
const answerOf = (item: ReturnType<typeof composeLetters>): string =>
  item.options.find((option) => option.id === item.correctOptionId)!.label;
const things = new Map(drawnThings().map((thing) => [thing.key, thing]));

/** The row as drawn, right to left: each thing and the letter taken from it. */
const row = (svg: string) =>
  [
    ...svg.matchAll(
      /data-slot="\d" data-thing="([^"]+)"(?: data-take="(\d)")?/g,
    ),
  ].map((match) => ({
    name: things.get(match[1])!.ar,
    take: match[2] ? Number(match[2]) : undefined,
  }));

describe('«أول حرف», drawn', () => {
  it('is drawn through the one composer', () => {
    expect(COMPOSED_PUZZLE_VARIANTS['picture-initials']).toEqual(
      LETTERS_VARIANTS['picture-initials'],
    );
    expect(composePuzzle('picture-initials', 'job:1').familyKey).toBe(
      'picture-initials',
    );
  });

  it('lends letters only from names spelled one way', () => {
    const lenders = letterThings();
    expect(lenders.length).toBeGreaterThanOrEqual(60);
    for (const thing of lenders) {
      // One word, no hamza, no ta marbuta, no doubled letter mark.
      expect(thing.ar).toMatch(/^[ابتثجحخدذرزسشصضطظعغفقكلمنهوي]+$/);
    }
    // Names the dialects disagree on, or borrowed words, lend nothing.
    for (const disputed of ['جوال', 'سيكل', 'تلفزيون', 'كاس']) {
      expect(lenders.map((thing) => thing.ar)).not.toContain(disputed);
    }
  });

  it('spells plain words of three or four letters, each once', () => {
    expect(new Set(LETTER_WORDS).size).toBe(LETTER_WORDS.length);
    for (const word of LETTER_WORDS) {
      expect(word).toMatch(/^[ابتثجحخدذرزسشصضطظعغفقكلمنهوي]{3,4}$/);
    }
  });

  it("scrambled: the first letters are the word's letters, out of order", () => {
    for (const seed of seeds) {
      const item = composeLetters('picture-initials', seed, 'scrambled');
      const word = answerOf(item);
      const letters = row(item.svg).map((entry) => entry.name[0]);
      expect(word).toHaveLength(4);
      expect([...letters].sort()).toEqual([...word].sort());
      expect(letters.join('')).not.toBe(word);
      expect(item.svg).not.toContain('data-order=');
    }
  });

  it('last-letter: the last letters, read right to left, are the word', () => {
    for (const seed of seeds) {
      const item = composeLetters('picture-initials', seed, 'last-letter');
      expect(
        row(item.svg)
          .map((entry) => entry.name[entry.name.length - 1])
          .join(''),
      ).toBe(answerOf(item));
      expect(item.svg).toContain('data-order="right-to-left"');
    }
  });

  it('cipher: the numbered letters, read right to left, are the word — never the first letter', () => {
    for (const seed of seeds) {
      const item = composeLetters('picture-initials', seed, 'cipher');
      const drawn = row(item.svg);
      for (const entry of drawn) {
        expect(entry.take).toBeGreaterThanOrEqual(2);
        expect(entry.take).toBeLessThanOrEqual(entry.name.length);
      }
      expect(drawn.map((entry) => entry.name[entry.take! - 1]).join('')).toBe(
        answerOf(item),
      );
    }
  });

  it('extra: without the extra picture the first letters spell one thing of the named kind, and with it no other', () => {
    const sorted = (word: string) => [...word].sort().join('');
    for (const seed of seeds) {
      const item = composeLetters('picture-initials', seed, 'extra');
      const target = item.variant.split(':')[1];
      const names = row(item.svg).map((entry) => entry.name);
      const extra = answerOf(item);
      expect(names).toContain(extra);
      expect(names).toHaveLength(target.length + 1);
      expect(target.length).toBeGreaterThanOrEqual(3);
      expect(
        sorted(
          names
            .filter((name) => name !== extra)
            .map((name) => name[0])
            .join(''),
        ),
      ).toBe(sorted(target));
      const kind = drawnThings().find((thing) => thing.ar === target)!.category;
      expect(item.prompt).toContain(kind === 'animal' ? 'حيوان' : 'أكل');
      // Dropping any other picture spells no thing of that kind.
      const sameKind = drawnThings()
        .filter((thing) => thing.category === kind)
        .map((thing) => sorted(thing.ar));
      for (const dropped of names.filter((name) => name !== extra)) {
        const rest = sorted(
          names
            .filter((name) => name !== dropped)
            .map((name) => name[0])
            .join(''),
        );
        expect(sameKind.includes(rest) && rest !== sorted(target)).toBe(false);
      }
    }
  });

  it('never uses one picture twice, nor the answer as a picture', () => {
    for (const variantKey of LETTERS_VARIANTS['picture-initials']) {
      for (const seed of seeds.slice(0, 60)) {
        const item = composeLetters('picture-initials', seed, variantKey);
        const names = row(item.svg).map((entry) => entry.name);
        expect(new Set(names).size).toBe(names.length);
        if (variantKey !== 'extra') expect(names).not.toContain(answerOf(item));
      }
    }
  });
});
