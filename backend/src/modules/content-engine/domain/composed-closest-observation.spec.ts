import {
  OBSERVATION_CLOSEST_VARIANTS,
  composeObservationClosest,
  gridSquares,
  isObservationClosestFamily,
} from './composed-closest-observation';
import { placeable } from './composed-closest-paths';
import { CLOSEST_VARIANTS, composeClosest } from './composed-closest';

const families = Object.keys(OBSERVATION_CLOSEST_VARIANTS) as Array<
  keyof typeof OBSERVATION_CLOSEST_VARIANTS
>;
const every = families.flatMap((familyKey) =>
  (OBSERVATION_CLOSEST_VARIANTS[familyKey] as readonly string[]).map(
    (variantKey) => [familyKey, variantKey] as const,
  ),
);
const SEEDS = ['o:0', 'o:1', 'o:2', 'o:3', 'o:4', 'p:7', 'p:11'];
const ANCHORED = ['odd-one-place', 'lines-meet'];

describe('مين أقرب in الملاحظة والخداع', () => {
  it('offers five families of six templates each', () => {
    expect(families).toHaveLength(5);
    for (const familyKey of families)
      expect(OBSERVATION_CLOSEST_VARIANTS[familyKey]).toHaveLength(6);
  });

  it('every one of them is reachable through composeClosest', () => {
    for (const [familyKey, variantKey] of every) {
      expect(isObservationClosestFamily(familyKey)).toBe(true);
      expect(CLOSEST_VARIANTS[familyKey]).toContain(variantKey);
      const reading = composeClosest(familyKey, 'o:1', variantKey);
      expect(reading.familyKey).toBe(familyKey);
      expect(reading.variantKey).toBe(variantKey);
    }
  });

  it.each(every)(
    '%s / %s draws a whole answer inside its slider',
    (familyKey, variantKey) => {
      for (const seed of SEEDS) {
        const reading = composeObservationClosest(familyKey, seed, variantKey);
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
        const reading = composeObservationClosest(familyKey, seed, variantKey);
        expect(reading.prompt).not.toContain(String(reading.value));
      }
    },
  );

  it.each(every)(
    '%s / %s gives one batch more than one picture',
    (familyKey, variantKey) => {
      const drawn = SEEDS.map(
        (seed) => composeObservationClosest(familyKey, seed, variantKey).svg,
      );
      expect(new Set(drawn).size).toBeGreaterThanOrEqual(4);
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
          const { slider } = composeObservationClosest(
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
          const { value, slider } = composeObservationClosest(
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
    it('counts the squares of a grid at every size', () => {
      expect(gridSquares(2, 2)).toBe(5);
      expect(gridSquares(3, 3)).toBe(14);
      expect(gridSquares(4, 4)).toBe(30);
      expect(gridSquares(4, 3)).toBe(20);
      expect(gridSquares(1, 6)).toBe(6);
    });

    it('draws the grid it counts', () => {
      for (const seed of SEEDS) {
        const reading = composeObservationClosest('grid-squares', seed, 'four');
        const [, size] = reading.variant.split(':');
        const [n, m] = size.split('x').map(Number);
        expect(reading.value).toBe(gridSquares(n, m));
        // One line per grid line, plus the sheet behind them.
        expect((reading.svg.match(/<line /g) ?? []).length).toBe(n + m + 2);
      }
    });

    it('draws as many shapes as it says, and others besides', () => {
      for (const variantKey of OBSERVATION_CLOSEST_VARIANTS['clutter-count']) {
        const reading = composeObservationClosest(
          'clutter-count',
          'o:2',
          variantKey,
        );
        const drawn =
          (reading.svg.match(/<polygon /g) ?? []).length +
          (reading.svg.match(/<circle /g) ?? []).length +
          (reading.svg.match(/<rect /g) ?? []).length;
        // The frame's own background rect is one of them.
        expect(drawn).toBeGreaterThan(reading.value);
      }
    });

    it('draws exactly the red dots it asks for', () => {
      for (const seed of SEEDS) {
        const reading = composeObservationClosest('dots-estimate', seed, 'few');
        const reds = (reading.svg.match(/fill="#D8493F"/g) ?? []).length;
        expect(reds).toBe(reading.value);
      }
    });

    it('leaves one place empty when the odd one is a gap', () => {
      for (const seed of SEEDS) {
        const reading = composeObservationClosest('odd-one-place', seed, 'gap');
        const shapes = (reading.svg.match(/<rect [^>]*transform=/g) ?? [])
          .length;
        expect(shapes).toBe(19);
      }
    });

    it('crosses the two lines where it says, on the side its template asks for', () => {
      for (const seed of SEEDS) {
        expect(
          composeObservationClosest('lines-meet', seed, 'left').value,
        ).toBeLessThan(10);
        expect(
          composeObservationClosest('lines-meet', seed, 'right').value,
        ).toBeGreaterThan(10);
      }
    });
  });

  it('draws no character the composer font has no glyph for', () => {
    const forbidden = /[←-⇿∀-⋿■-◿⬀-⯿×−]/;
    for (const [familyKey, variantKey] of every) {
      const { svg } = composeObservationClosest(familyKey, 'o:3', variantKey);
      for (const [, inner] of svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g))
        expect(inner).not.toMatch(forbidden);
    }
  });
});
