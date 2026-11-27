import {
  CLOSEST_VARIANTS,
  ILLUSION_VALUES,
  composeClosest,
  isComposedClosestFamily,
} from './composed-closest';
import { isComposedFamily } from './composed-visuals';

const seeds = Array.from({ length: 60 }, (_, index) => `job:${index}`);
const all = Object.entries(CLOSEST_VARIANTS).flatMap(([family, variants]) =>
  (variants as readonly string[]).map(
    (variant) => [family, variant] as [keyof typeof CLOSEST_VARIANTS, string],
  ),
);

describe('مين أقرب, drawn by the engine', () => {
  it('is known to the engine as drawn', () => {
    for (const family of Object.keys(CLOSEST_VARIANTS)) {
      expect(isComposedClosestFamily(family)).toBe(true);
      expect(isComposedFamily(family)).toBe(true);
    }
  });

  it.each(all)(
    '%s / %s: the answer sits on the slider grid',
    (family, variant) => {
      for (const seed of seeds) {
        const item = composeClosest(family, seed, variant);
        expect(item.variantKey).toBe(variant);
        const { min, max, step } = item.slider;
        expect(item.value).toBeGreaterThanOrEqual(min);
        expect(item.value).toBeLessThanOrEqual(max);
        expect((item.value - min) % step).toBe(0);
        expect(composeClosest(family, seed, variant)).toEqual(item);
      }
    },
  );

  it('the shortest walk is the one the rule forces, and the rule costs steps', () => {
    for (const variant of CLOSEST_VARIANTS['key-door-route']) {
      for (const seed of seeds) {
        const item = composeClosest('key-door-route', seed, variant);
        const [, plain] = /without the rule: (\d+)/.exec(item.factualClaim)!;
        expect(item.value - Number(plain)).toBeGreaterThanOrEqual(4);
        expect(item.value).toBeGreaterThanOrEqual(12);
        expect(item.value).toBeLessThanOrEqual(26);
      }
    }
  });

  it('every cube drawn is counted', () => {
    for (const variant of CLOSEST_VARIANTS['cube-pile-count']) {
      for (const seed of seeds) {
        const item = composeClosest('cube-pile-count', seed, variant);
        expect(item.svg.match(/data-cube=/g)!.length).toBe(item.value);
      }
    }
  });

  it('the blue length is drawn at the answer, and the eye is pulled the other way', () => {
    for (const variant of CLOSEST_VARIANTS['length-illusion-ratio']) {
      for (const seed of seeds) {
        const item = composeClosest('length-illusion-ratio', seed, variant);
        expect(ILLUSION_VALUES).toContain(item.value);
        const reference = Number(
          /data-line="reference" data-length="([\d.]+)"/.exec(item.svg)![1],
        );
        const asked = Number(
          /data-line="asked" data-length="([\d.]+)"/.exec(item.svg)![1],
        );
        expect(Math.round((asked / reference) * 100)).toBe(item.value);
      }
    }
  });

  it('the wrong clock is off by the answer', () => {
    for (const variant of CLOSEST_VARIANTS['wrong-clock-minutes']) {
      for (const seed of seeds) {
        const item = composeClosest('wrong-clock-minutes', seed, variant);
        const [right, wrong] = [
          ...item.svg.matchAll(/data-clock="(\d+)"/g),
        ].map((match) => Number(match[1]));
        const off =
          (variant === 'behind' ? right - wrong : wrong - right) + 720;
        expect(off % 720).toBe(item.value);
      }
    }
  });
});
