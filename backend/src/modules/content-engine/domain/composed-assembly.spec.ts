import {
  ASSEMBLY_VARIANTS,
  AssemblyFamily,
  FALSE_NETS,
  HANDED_SHAPES,
  Shape,
  buildStack,
  composeAssembly,
  foldsIntoCube,
  mirrored,
  sameWhenTurned,
  stackCubes,
  stackFrontView,
  stackTopLayer,
  stackTopView,
  turned,
} from './composed-assembly';
import { LETTERS, seededRandom } from './composed-kit';
import { COMPOSED_PUZZLE_VARIANTS, composePuzzle } from './composed-puzzles';
import { CUBE_NETS } from './cube-nets';

const seeds = Array.from({ length: 120 }, (_, index) => `job:${index}`);
const answerOf = (item: ReturnType<typeof composeAssembly>): string =>
  item.options.find((option) => option.id === item.correctOptionId)!.label;

/** The three candidates as drawn: what each is, and its squares. */
const candidates = (svg: string) =>
  [...svg.matchAll(/data-kind="(\w+)" data-cells='([^']+)'/g)].map((match) => ({
    kind: match[1],
    cells: JSON.parse(match[2]) as Shape,
  }));

describe('التركيب والتدوير, drawn', () => {
  it('is drawn through the one composer', () => {
    for (const [familyKey, variants] of Object.entries(ASSEMBLY_VARIANTS)) {
      expect(COMPOSED_PUZZLE_VARIANTS[familyKey as AssemblyFamily]).toEqual(
        variants,
      );
      expect(
        composePuzzle(familyKey as AssemblyFamily, 'job:1').familyKey,
      ).toBe(familyKey);
    }
  });

  describe('shapes of squares', () => {
    it('every shape differs from its mirror image however it is turned', () => {
      for (const shape of HANDED_SHAPES) {
        expect(sameWhenTurned(shape.cells, mirrored(shape.cells))).toBe(false);
        for (const turns of [1, 2, 3]) {
          expect(sameWhenTurned(shape.cells, turned(shape.cells, turns))).toBe(
            true,
          );
        }
      }
    });

    it('no two shapes are one shape turned or flipped', () => {
      HANDED_SHAPES.forEach((shape, index) => {
        for (const other of HANDED_SHAPES.slice(index + 1)) {
          expect(sameWhenTurned(shape.cells, other.cells)).toBe(false);
          expect(sameWhenTurned(mirrored(shape.cells), other.cells)).toBe(
            false,
          );
        }
      });
    });
  });

  const original = (svg: string) =>
    HANDED_SHAPES.find(
      (shape) => shape.key === /data-original="(\w+)"/.exec(svg)![1],
    )!.cells;

  it.each([
    ['mental-rotation-2d', 'which-same', 'turned'],
    ['mental-rotation-2d', 'which-different', 'other'],
    ['mirror-vs-rotation-discrim', 'which-mirrored', 'flipped'],
    ['mirror-vs-rotation-discrim', 'which-turned-only', 'turned'],
  ] as const)(
    '%s / %s: each candidate is what it is said to be, and the answer is the one %s',
    (familyKey, variantKey, wanted) => {
      for (const seed of seeds) {
        const item = composeAssembly(familyKey, seed, variantKey);
        const base = original(item.svg);
        const drawn = candidates(item.svg);
        expect(drawn).toHaveLength(3);
        // No two candidates are the same drawing.
        expect(
          new Set(drawn.map((candidate) => JSON.stringify(candidate.cells)))
            .size,
        ).toBe(3);
        drawn.forEach((candidate, index) => {
          const isTurn = sameWhenTurned(base, candidate.cells);
          const isFlip = sameWhenTurned(mirrored(base), candidate.cells);
          expect(isTurn).toBe(candidate.kind === 'turned');
          expect(isFlip).toBe(candidate.kind === 'flipped');
          expect(candidate.kind === wanted).toBe(
            answerOf(item) === `الشكل ${LETTERS[index]}`,
          );
        });
        expect(
          drawn.filter((candidate) => candidate.kind === wanted),
        ).toHaveLength(1);
      }
    },
  );

  it.each(['fits', 'fits-turned'])(
    "missing piece / %s: only the answer has the gap's own shape",
    (variantKey) => {
      for (const seed of seeds) {
        const item = composeAssembly('missing-puzzle-piece', seed, variantKey);
        const gap = JSON.parse(
          /data-gap='([^']+)'/.exec(item.svg)![1],
        ) as Shape;
        expect(gap).toHaveLength(5);
        candidates(item.svg).forEach((candidate, index) => {
          const fits =
            variantKey === 'fits'
              ? JSON.stringify(candidate.cells) ===
                JSON.stringify(turned(gap, 0))
              : sameWhenTurned(gap, candidate.cells);
          expect(fits).toBe(answerOf(item) === `القطعة ${LETTERS[index]}`);
        });
        // The board is sixteen squares less the gap.
        expect(
          /<g data-gap=[^>]+>(.*?)<\/g>/.exec(item.svg)![1].match(/<rect/g),
        ).toHaveLength(11);
      }
    },
  );

  describe('nets', () => {
    it('knows a net from a false one', () => {
      for (const net of CUBE_NETS) expect(foldsIntoCube(net.cells)).toBe(true);
      expect(FALSE_NETS.length).toBeGreaterThanOrEqual(5);
      for (const net of FALSE_NETS) {
        expect(net.cells).toHaveLength(6);
        expect(foldsIntoCube(net.cells)).toBe(false);
        // Turned or flipped, it still does not fold.
        expect(foldsIntoCube(turned(mirrored(net.cells), 1))).toBe(false);
      }
    });

    it.each([
      ['folds', 1],
      ['does-not-fold', 2],
    ] as const)(
      '%s: %i of the three fold, and the answer is the odd one',
      (variantKey, folding) => {
        for (const seed of seeds) {
          const item = composeAssembly('cube-net-fold', seed, variantKey);
          const drawn = [
            ...item.svg.matchAll(/data-folds="(\w+)" data-cells='([^']+)'/g),
          ].map((match) => ({
            said: match[1] === 'true',
            cells: JSON.parse(match[2]) as Shape,
          }));
          expect(drawn).toHaveLength(3);
          drawn.forEach((net, index) => {
            expect(foldsIntoCube(net.cells)).toBe(net.said);
            expect(answerOf(item) === `الشكل ${LETTERS[index]}`).toBe(
              net.said === (variantKey === 'folds'),
            );
          });
          expect(drawn.filter((net) => net.said)).toHaveLength(folding);
        }
      },
    );
  });

  describe('stacks of cubes', () => {
    it('never rise toward the viewer, so every column top is seen', () => {
      for (const seed of seeds) {
        const stack = buildStack(seededRandom(seed));
        for (let x = 0; x < 3; x += 1) {
          for (let y = 0; y < 3; y += 1) {
            if (x > 0) expect(stack[x][y]).toBeLessThanOrEqual(stack[x - 1][y]);
            if (y > 0) expect(stack[x][y]).toBeLessThanOrEqual(stack[x][y - 1]);
          }
        }
        expect(stackTopView(stack)).toBeGreaterThanOrEqual(5);
      }
    });

    it('counts cubes, columns, the front and the top level', () => {
      const stack = [
        [3, 2, 0],
        [2, 1, 0],
        [1, 0, 0],
      ];
      expect(stackCubes(stack)).toBe(9);
      expect(stackTopView(stack)).toBe(5);
      expect(stackFrontView(stack)).toBe(6);
      expect(stackTopLayer(stack)).toBe(1);
    });

    it.each([
      ['spatial-cube-count', 'count-all', stackCubes],
      ['spatial-cube-count', 'count-top-layer', stackTopLayer],
      ['orthographic-projection', 'top-view', stackTopView],
      ['orthographic-projection', 'front-view', stackFrontView],
    ] as const)(
      '%s / %s: answers from the stack as drawn',
      (familyKey, variantKey, measure) => {
        for (const seed of seeds) {
          const item = composeAssembly(familyKey, seed, variantKey);
          const stack = item.variant
            .split(':')[1]
            .split('-')
            .map((column) => [...column].map(Number));
          expect(answerOf(item)).toBe(String(measure(stack)));
          expect(item.svg.match(/data-cube=/g)).toHaveLength(stackCubes(stack));
          expect(item.svg.includes('data-front=')).toBe(
            variantKey === 'front-view',
          );
        }
      },
    );
  });
});
