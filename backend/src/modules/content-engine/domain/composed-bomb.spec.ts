import { normalizeAnswer } from '../../../common/utils/answer-normalization.util';
import {
  BOMB_VARIANTS,
  bombNames,
  composeBomb,
  namedThings,
  numberAnswers,
} from './composed-bomb';
import { drawnThings } from './drawn-things';

const seeds = Array.from({ length: 40 }, (_, index) => `job:${index}`);
const all = Object.entries(BOMB_VARIANTS).flatMap(([family, variants]) =>
  (variants as readonly string[]).map(
    (variant) => [family, variant] as [never, string],
  ),
);

describe('القنبلة in عالم الألغاز, drawn by the engine', () => {
  it('asks by name only drawings with a reviewed list of names', () => {
    const keys = new Set(drawnThings().map((thing) => thing.key));
    expect(bombNames().size).toBeGreaterThan(120);
    for (const [key, forms] of bombNames()) {
      expect(keys.has(key)).toBe(true);
      expect(forms.length).toBeGreaterThan(0);
      expect(forms.length).toBeLessThanOrEqual(10);
    }
    expect(namedThings().length).toBe(bombNames().size);
  });

  it('takes a number in Western digits, Arabic digits and words', () => {
    expect(numberAnswers(7)).toEqual(['7', '٧', 'سبعة']);
    expect(numberAnswers(12)).toContain('اثنعش');
  });

  it.each(all)(
    '%s / %s: a short question with typed answers it does not give away',
    (family, variant) => {
      for (const seed of seeds) {
        const item = composeBomb(family, seed, variant);
        expect(item.variantKey).toBe(variant);
        expect([...item.prompt].length).toBeLessThan(70);
        expect(item.acceptedAnswers.length).toBeGreaterThan(0);
        // The game refuses two answers it folds into one (فأر, فار).
        const folded = item.acceptedAnswers.map((answer) =>
          normalizeAnswer(answer),
        );
        expect(new Set(folded).size).toBe(folded.length);
        for (const answer of item.acceptedAnswers) {
          expect(answer.trim()).toBe(answer);
          if (answer.length > 2) expect(item.prompt).not.toContain(answer);
        }
        expect(composeBomb(family, seed, variant)).toEqual(item);
      }
    },
  );

  it('the thread asked about ends at the thing whose name is the answer', () => {
    for (const seed of seeds) {
      const item = composeBomb('bomb-thread-end', seed);
      const [, named] = /«(.+)»/.exec(item.factualClaim)!;
      expect(item.acceptedAnswers).toContain(named);
    }
  });
});
