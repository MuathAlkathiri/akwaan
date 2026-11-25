import { CLOSEST_ANCHOR_CENTRE_BAND } from '../application/deterministic-screen.service';
import {
  BATTERY_VARIANTS,
  COMPOSED_SCALE_MAX,
  COMPOSED_SCALE_MIN,
  COMPOSED_VALUES,
  COMPOSED_VISUAL_FAMILIES,
  MARK_LINE,
  MARK_VARIANTS,
  batteryColour,
  batterySvg,
  composeVisual,
  isComposedVisualFamily,
  markSvg,
  pickComposedValue,
} from './composed-visuals';

const attribute = (svg: string, role: string, name: string): number => {
  const element = svg.match(new RegExp(`<[^>]*data-role="${role}"[^>]*>`));
  if (!element) throw new Error(`no ${role} in the drawing`);
  const value = element[0].match(new RegExp(` ${name}="([^"]+)"`));
  if (!value) throw new Error(`${role} has no ${name}`);
  return Number(value[1]);
};

describe('composed visuals', () => {
  it('knows its families and nothing else', () => {
    expect(COMPOSED_VISUAL_FAMILIES).toEqual([
      'battery-level',
      'copy-the-mark',
    ]);
    expect(isComposedVisualFamily('battery-level')).toBe(true);
    expect(isComposedVisualFamily('occurrence-count')).toBe(false);
    expect(isComposedVisualFamily(undefined)).toBe(false);
  });

  it('never answers in the middle fifth or at either end', () => {
    const mid = (COMPOSED_SCALE_MIN + COMPOSED_SCALE_MAX) / 2;
    const band =
      (COMPOSED_SCALE_MAX - COMPOSED_SCALE_MIN) * CLOSEST_ANCHOR_CENTRE_BAND;
    for (const value of COMPOSED_VALUES) {
      expect(Math.abs(value - mid)).toBeGreaterThan(band);
      expect(value).toBeGreaterThanOrEqual(8);
      expect(value).toBeLessThanOrEqual(92);
    }
    expect(new Set(COMPOSED_VALUES).size).toBe(COMPOSED_VALUES.length);
  });

  it('draws the same item for the same seed, and spreads across seeds', () => {
    expect(composeVisual('battery-level', 'job:3')).toEqual(
      composeVisual('battery-level', 'job:3'),
    );
    const values = new Set(
      Array.from({ length: 60 }, (_, index) =>
        pickComposedValue(`job:${index}`),
      ),
    );
    expect(values.size).toBeGreaterThan(25);
    for (const value of values) expect(COMPOSED_VALUES).toContain(value);
  });

  it.each(BATTERY_VARIANTS)(
    'fills the %s battery in proportion to the answer',
    (variant) => {
      const dimension = variant === 'vertical' ? 'height' : 'width';
      const at25 = attribute(batterySvg(25, variant), 'charge', dimension);
      const at50 = attribute(batterySvg(50, variant), 'charge', dimension);
      const at100 = attribute(batterySvg(100, variant), 'charge', dimension);
      expect(at50 / at100).toBeCloseTo(0.5, 2);
      expect(at25 / at100).toBeCloseTo(0.25, 2);
    },
  );

  it('fills a vertical battery from the bottom', () => {
    const low = attribute(batterySvg(20, 'vertical'), 'charge', 'y');
    const high = attribute(batterySvg(80, 'vertical'), 'charge', 'y');
    expect(high).toBeLessThan(low);
  });

  it('colours the charge the way a phone does', () => {
    expect(batteryColour(10)).not.toBe(batteryColour(30));
    expect(batteryColour(30)).not.toBe(batteryColour(80));
  });

  it.each(MARK_VARIANTS)(
    'puts the %s mark where the answer says',
    (variant) => {
      for (const value of [8, 33, 62, 92]) {
        const x = attribute(markSvg(value, variant), 'mark', 'data-x');
        expect((x - MARK_LINE.x) / MARK_LINE.length).toBeCloseTo(
          value / 100,
          3,
        );
      }
    },
  );

  it('shows no number and no text in any drawing', () => {
    for (const svg of [
      batterySvg(37, 'horizontal'),
      batterySvg(37, 'vertical'),
      markSvg(37, 'pin'),
      markSvg(37, 'dot'),
    ]) {
      expect(svg).not.toMatch(/<text/);
      expect(svg).not.toMatch(/>\s*\d+\s*%?\s*</);
    }
  });

  it('ties the drawing, the claim and the answer to one value', () => {
    for (const familyKey of COMPOSED_VISUAL_FAMILIES) {
      const item = composeVisual(familyKey, 'job:7');
      expect(item.factualClaim).toContain(`${item.value}%`);
      expect(item.prompt).not.toMatch(/\d/);
      expect(item.leftAnchor).not.toBe(item.rightAnchor);
      expect(item.svg.startsWith('<svg')).toBe(true);
    }
  });
});
