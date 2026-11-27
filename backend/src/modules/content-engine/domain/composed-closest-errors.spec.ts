import {
  ERROR_CLOSEST_VARIANTS,
  composeErrorClosest,
  isErrorClosestFamily,
} from './composed-closest-errors';
import { placeable } from './composed-closest-paths';
import { CLOSEST_VARIANTS, composeClosest } from './composed-closest';

const families = Object.keys(ERROR_CLOSEST_VARIANTS) as Array<
  keyof typeof ERROR_CLOSEST_VARIANTS
>;
const every = families.flatMap((familyKey) =>
  (ERROR_CLOSEST_VARIANTS[familyKey] as readonly string[]).map(
    (variantKey) => [familyKey, variantKey] as const,
  ),
);
const SEEDS = ['e:0', 'e:1', 'e:2', 'e:3', 'e:4', 'f:7', 'f:11'];
const ANCHORED = ['pattern-break', 'shadow-break'];

describe('مين أقرب in اكتشف الخطأ', () => {
  it('offers five families of six templates each', () => {
    expect(families).toHaveLength(5);
    for (const familyKey of families)
      expect(ERROR_CLOSEST_VARIANTS[familyKey]).toHaveLength(6);
  });

  it('every one of them is reachable through composeClosest', () => {
    for (const [familyKey, variantKey] of every) {
      expect(isErrorClosestFamily(familyKey)).toBe(true);
      expect(CLOSEST_VARIANTS[familyKey]).toContain(variantKey);
      const reading = composeClosest(familyKey, 'e:1', variantKey);
      expect(reading.familyKey).toBe(familyKey);
      expect(reading.variantKey).toBe(variantKey);
    }
  });

  it.each(every)(
    '%s / %s draws a whole answer inside its slider',
    (familyKey, variantKey) => {
      for (const seed of SEEDS) {
        const reading = composeErrorClosest(familyKey, seed, variantKey);
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
        const reading = composeErrorClosest(familyKey, seed, variantKey);
        expect(reading.prompt).not.toContain(String(reading.value));
      }
    },
  );

  it.each(every)(
    '%s / %s gives one batch more than one picture',
    (familyKey, variantKey) => {
      const drawn = SEEDS.map(
        (seed) => composeErrorClosest(familyKey, seed, variantKey).svg,
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
          const { slider } = composeErrorClosest(familyKey, seed, variantKey);
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
          const { value, slider } = composeErrorClosest(
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
    it('mirrors exactly as many shapes as it answers with', () => {
      for (const [, variantKey] of every.filter(
        ([family]) => family === 'mirrored-count',
      ))
        for (const seed of SEEDS) {
          const reading = composeErrorClosest(
            'mirrored-count',
            seed,
            variantKey,
          );
          const mirrored = (reading.svg.match(/scale\(-1,1\)/g) ?? []).length;
          expect(mirrored).toBe(reading.value);
        }
    });

    it('writes a total that misses the real one by the answer', () => {
      for (const seed of SEEDS)
        for (const variantKey of ERROR_CLOSEST_VARIANTS['total-off-by']) {
          const reading = composeErrorClosest('total-off-by', seed, variantKey);
          const [, prices, shown] = reading.variant.split(':');
          const real = prices
            .split('-')
            .map(Number)
            .reduce((sum, one) => sum + one, 0);
          expect(Math.abs(Number(shown) - real)).toBe(reading.value);
          expect(reading.svg).toContain(`>${shown}</text>`);
        }
    });

    it('overstates the total in one template and understates it in the other', () => {
      for (const seed of SEEDS) {
        const over = composeErrorClosest('total-off-by', seed, 'over');
        const under = composeErrorClosest('total-off-by', seed, 'under');
        const slip = (reading: typeof over) => {
          const [, prices, shown] = reading.variant.split(':');
          return (
            Number(shown) -
            prices
              .split('-')
              .map(Number)
              .reduce((sum, one) => sum + one, 0)
          );
        };
        expect(slip(over)).toBeGreaterThan(0);
        expect(slip(under)).toBeLessThan(0);
      }
    });

    it('answers a balance with the difference between its pans', () => {
      for (const seed of SEEDS)
        for (const variantKey of ERROR_CLOSEST_VARIANTS['balance-missing']) {
          const reading = composeErrorClosest(
            'balance-missing',
            seed,
            variantKey,
          );
          const [, left, right] = reading.variant.split(':');
          const add = (part: string) =>
            part
              .split('-')
              .map(Number)
              .reduce((sum, one) => sum + one, 0);
          expect(reading.value).toBe(Math.abs(add(left) - add(right)));
          expect(reading.value).toBeGreaterThan(0);
        }
    });

    it('breaks the run at the place it answers with, and nowhere else', () => {
      for (const seed of SEEDS)
        for (const variantKey of ERROR_CLOSEST_VARIANTS['pattern-break']) {
          const reading = composeErrorClosest(
            'pattern-break',
            seed,
            variantKey,
          );
          const [, first, step, broken] = reading.variant
            .split(':')
            .map(Number);
          const shown = [
            ...reading.svg.matchAll(/font-size="30"[^>]*>(-?\d+)<\/text>/g),
          ].map((found) => Number(found[1]));
          expect(shown).toHaveLength(14);
          shown.forEach((one, index) => {
            const right = first + index * step;
            if (index === broken) expect(one).not.toBe(right);
            else expect(one).toBe(right);
          });
          expect(reading.value).toBe(broken);
        }
    });

    it('turns one shadow against the sun and leaves the rest with it', () => {
      for (const seed of SEEDS)
        for (const variantKey of ERROR_CLOSEST_VARIANTS['shadow-break']) {
          const reading = composeErrorClosest('shadow-break', seed, variantKey);
          const cells = reading.slider.max;
          const shadows = (reading.svg.match(/fill="#9C9486"/g) ?? []).length;
          expect(shadows).toBe(cells);
          expect(reading.svg).toContain('الشمس');
        }
    });
  });

  it('draws no character the composer font has no glyph for', () => {
    const forbidden = /[←-⇿∀-⋿■-◿⬀-⯿×−]/;
    for (const [familyKey, variantKey] of every) {
      const { svg } = composeErrorClosest(familyKey, 'e:3', variantKey);
      for (const [, inner] of svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g))
        expect(inner).not.toMatch(forbidden);
    }
  });
});
