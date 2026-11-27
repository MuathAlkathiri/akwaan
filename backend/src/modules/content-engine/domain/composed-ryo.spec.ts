import { COMPOSED_PUZZLE_VARIANTS, composePuzzle } from './composed-puzzles';
import { RYO_VARIANTS } from './composed-ryo';

const seeds = Array.from({ length: 40 }, (_, index) => `job:${index}`);
const all = [
  ...Object.entries(RYO_VARIANTS),
  ['count-changes', COMPOSED_PUZZLE_VARIANTS['count-changes']] as const,
].flatMap(([family, variants]) =>
  (variants as readonly string[]).map(
    (variant) => [family, variant] as [never, string],
  ),
);

describe('اقرأ خصمك, drawn by the engine', () => {
  it.each(all)(
    '%s / %s: four options, one right, each wrong one explained',
    (family, variant) => {
      for (const seed of seeds) {
        const item = composePuzzle(family, seed, variant);
        expect(item.options).toHaveLength(4);
        expect(new Set(item.options.map((option) => option.label)).size).toBe(
          4,
        );
        expect(item.options.map((option) => option.id)).toContain(
          item.correctOptionId,
        );
        expect(
          item.distractorRationale.map((entry) => entry.optionId).sort(),
        ).toEqual(
          item.options
            .map((option) => option.id)
            .filter((optionId) => optionId !== item.correctOptionId)
            .sort(),
        );
        expect(composePuzzle(family, seed, variant)).toEqual(item);
      }
    },
  );

  it('the beam leaves at the lettered target the answer names', () => {
    for (const seed of seeds) {
      const item = composePuzzle('mirror-beam', seed);
      const exit = /leaves at (-?\d+,-?\d+)/.exec(item.factualClaim)![1];
      const targets = [...item.svg.matchAll(/data-target="([^"]+)"/g)].map(
        (m) => m[1],
      );
      const index = ['a', 'b', 'c', 'd'].indexOf(item.correctOptionId);
      expect(targets[index]).toBe(exit);
    }
  });

  it('the right piece is the one the gap needs, and it is offered once', () => {
    for (const variant of RYO_VARIANTS['last-pipe-piece']) {
      for (const seed of seeds) {
        const item = composePuzzle('last-pipe-piece', seed, variant);
        const needed = /needs the (\w+) piece/.exec(item.factualClaim)![1];
        const choices = [
          ...item.svg.matchAll(
            /data-choice="[^"]+">[\s\S]*?data-piece="(\w+)"/g,
          ),
        ].map((m) => m[1]);
        expect(choices.filter((piece) => piece === needed)).toHaveLength(1);
        expect(
          choices[['a', 'b', 'c', 'd'].indexOf(item.correctOptionId)],
        ).toBe(needed);
      }
    }
  });

  it('the count of changes is the number of squares that differ', () => {
    for (const variant of COMPOSED_PUZZLE_VARIANTS['count-changes']) {
      for (const seed of seeds) {
        const item = composePuzzle('count-changes', seed, variant);
        const right = item.options.find(
          (option) => option.id === item.correctOptionId,
        )!;
        expect(Number(/^(\d)/.exec(item.factualClaim)![1])).toBe(
          Number(right.label),
        );
      }
    }
  });
});
