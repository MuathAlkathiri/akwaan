import {
  ASSEMBLY_CLOSEST_VARIANTS,
  TILE_SHAPES,
  balanced,
  composeAssemblyClosest,
  crossings,
  foldMarks,
  isAssemblyClosestFamily,
  layout,
  turned,
} from './composed-closest-assembly';
import { placeable } from './composed-closest-paths';
import { CLOSEST_VARIANTS, composeClosest } from './composed-closest';
import { seededRandom } from './composed-kit';

const families = Object.keys(ASSEMBLY_CLOSEST_VARIANTS) as Array<
  keyof typeof ASSEMBLY_CLOSEST_VARIANTS
>;
const every = families.flatMap((familyKey) =>
  (ASSEMBLY_CLOSEST_VARIANTS[familyKey] as readonly string[]).map(
    (variantKey) => [familyKey, variantKey] as const,
  ),
);
const SEEDS = ['a:0', 'a:1', 'a:2', 'a:3', 'a:4', 'b:7', 'b:11'];
const ANCHORED = ['fold-line', 'balance-point'];

describe('مين أقرب in التدوير والتركيب', () => {
  it('offers five families of six templates each', () => {
    expect(families).toHaveLength(5);
    for (const familyKey of families)
      expect(ASSEMBLY_CLOSEST_VARIANTS[familyKey]).toHaveLength(6);
  });

  it('every one of them is reachable through composeClosest', () => {
    for (const [familyKey, variantKey] of every) {
      expect(isAssemblyClosestFamily(familyKey)).toBe(true);
      expect(CLOSEST_VARIANTS[familyKey]).toContain(variantKey);
      const reading = composeClosest(familyKey, 'a:1', variantKey);
      expect(reading.familyKey).toBe(familyKey);
      expect(reading.variantKey).toBe(variantKey);
    }
  });

  it.each(every)(
    '%s / %s draws a whole answer inside its slider',
    (familyKey, variantKey) => {
      for (const seed of SEEDS) {
        const reading = composeAssemblyClosest(familyKey, seed, variantKey);
        expect(Number.isInteger(reading.value)).toBe(true);
        expect(reading.value).toBeGreaterThanOrEqual(reading.slider.min);
        expect(reading.value).toBeLessThanOrEqual(reading.slider.max);
        expect((reading.value - reading.slider.min) % reading.slider.step).toBe(
          0,
        );
        expect(reading.svg).toContain('</svg>');
      }
    },
  );

  it.each(every)(
    '%s / %s never writes its own answer in the question',
    (familyKey, variantKey) => {
      for (const seed of SEEDS) {
        const reading = composeAssemblyClosest(familyKey, seed, variantKey);
        const arabicIndic = String(reading.value).replace(
          /[0-9]/g,
          (digit) => '٠١٢٣٤٥٦٧٨٩'[Number(digit)],
        );
        expect(reading.prompt).not.toContain(String(reading.value));
        expect(reading.prompt).not.toContain(arabicIndic);
      }
    },
  );

  it.each(every)(
    '%s / %s gives one batch more than one picture',
    (familyKey, variantKey) => {
      const drawn = SEEDS.map(
        (seed) => composeAssemblyClosest(familyKey, seed, variantKey).svg,
      );
      expect(new Set(drawn).size).toBeGreaterThanOrEqual(4);
    },
  );

  it.each(every)(
    '%s / %s keeps one seed to one picture',
    (familyKey, variantKey) => {
      const once = composeAssemblyClosest(familyKey, 'a:2', variantKey);
      const again = composeAssemblyClosest(familyKey, 'a:2', variantKey);
      expect(again.svg).toBe(once.svg);
      expect(again.value).toBe(once.value);
    },
  );

  describe('a place on a line, not a number', () => {
    const anchored = every.filter(([familyKey]) =>
      ANCHORED.includes(familyKey),
    );

    it.each(anchored)(
      '%s / %s names both ends and shows no unit',
      (familyKey, variantKey) => {
        for (const seed of SEEDS) {
          const { slider } = composeAssemblyClosest(
            familyKey,
            seed,
            variantKey,
          );
          expect(slider.mode).toBe('between-anchors');
          if (slider.mode !== 'between-anchors') return;
          expect(slider.leftAnchor).not.toBe(slider.rightAnchor);
          expect(slider).not.toHaveProperty('unit');
        }
      },
    );

    it.each(anchored)(
      '%s / %s answers away from the middle and the ends',
      (familyKey, variantKey) => {
        for (const seed of SEEDS) {
          const { value, slider } = composeAssemblyClosest(
            familyKey,
            seed,
            variantKey,
          );
          expect(placeable(value - slider.min, slider.max - slider.min)).toBe(
            true,
          );
        }
      },
    );
  });

  describe('the answers are worked out, not written down', () => {
    it('lays the shape out of exactly the pieces it asks for', () => {
      for (const [familyKey, variantKey] of every.filter(
        ([family]) => family === 'tiles-to-cover',
      )) {
        void familyKey;
        for (const seed of SEEDS) {
          const reading = composeAssemblyClosest(
            'tiles-to-cover',
            seed,
            variantKey,
          );
          const cells = layout(
            variantKey,
            reading.value,
            seededRandom(`tiles-to-cover:${variantKey}:${seed}`),
          );
          void cells;
          const squares = (reading.svg.match(/fill="#DDF1FB"/g) ?? []).length;
          expect(squares).toBe(reading.value * TILE_SHAPES[variantKey].length);
        }
      }
    });

    it('turns a piece by a quarter at a time and back to where it started', () => {
      const piece = TILE_SHAPES['tee-four'];
      expect(turned(piece, 4)).toEqual(piece.map(([x, y]) => [x, y]));
      expect(turned(piece, 1)).not.toEqual(piece.map(([x, y]) => [x, y]));
      for (const times of [1, 2, 3])
        expect(turned(piece, times)).toHaveLength(piece.length);
    });

    it('draws the piece at the degrees it answers with', () => {
      for (const seed of SEEDS) {
        const reading = composeAssemblyClosest(
          'rotation-degrees',
          seed,
          'quarter',
        );
        expect(reading.svg).toContain(`rotate(${reading.value})`);
        expect(reading.svg).toContain('rotate(0)');
      }
    });

    it('counts the pieces of a sheet as one plus the cuts plus their crossings', () => {
      for (const seed of SEEDS) {
        const reading = composeAssemblyClosest('cut-pieces', seed, 'four-cuts');
        const [, pieces, lines] = reading.variant.split(':').map(Number);
        const drawn = (reading.svg.match(/stroke-dasharray/g) ?? []).length;
        expect(drawn).toBe(lines);
        expect(reading.value).toBe(pieces);
        expect(pieces).toBeGreaterThanOrEqual(1 + lines);
      }
    });

    it('finds no crossing between cuts that never meet inside the sheet', () => {
      expect(
        crossings([
          [0, 0.2, 1, 0.2],
          [0, 0.6, 1, 0.6],
        ]),
      ).toHaveLength(0);
      expect(
        crossings([
          [0, 0.2, 1, 0.8],
          [0.5, 0, 0.5, 1],
        ]),
      ).toHaveLength(1);
    });

    it('folds halfway between the two marks', () => {
      for (const seed of SEEDS) {
        const reading = composeAssemblyClosest('fold-line', seed, 'wide');
        const [, a, b] = reading.variant.split(':').map(Number);
        expect(reading.value).toBe((a + b) / 2);
        expect(b - a).toBeGreaterThanOrEqual(8);
      }
      const { a, b, fold } = foldMarks(
        { gap: [4, 6], side: 'left' },
        seededRandom('f'),
      );
      expect(fold).toBe((a + b) / 2);
      expect(fold).toBeLessThanOrEqual(10);
    });

    it('balances a plank on its moments', () => {
      for (const seed of SEEDS) {
        const reading = composeAssemblyClosest(
          'balance-point',
          seed,
          'three-weights',
        );
        const [, spots, loads] = reading.variant.split(':');
        const at = spots.split('-').map(Number);
        const weight = loads.split('-').map(Number);
        const total = weight.reduce((sum, one) => sum + one, 0);
        const moment = at.reduce((sum, spot, i) => sum + spot * weight[i], 0);
        expect(reading.value).toBe(moment / total);
        expect(at).toHaveLength(3);
      }
      const { spots, loads, point } = balanced(
        { howMany: 2, weights: [[3, 1]] },
        false,
        seededRandom('b'),
      );
      expect(point).toBe((spots[0] * loads[0] + spots[1] * loads[1]) / 4);
    });
  });

  it('draws no character the composer font has no glyph for', () => {
    const forbidden = /[←-⇿∀-⋿■-◿⬀-⯿×−]/;
    for (const [familyKey, variantKey] of every) {
      const { svg } = composeAssemblyClosest(familyKey, 'a:3', variantKey);
      for (const [, inner] of svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g))
        expect(inner).not.toMatch(forbidden);
    }
  });
});
