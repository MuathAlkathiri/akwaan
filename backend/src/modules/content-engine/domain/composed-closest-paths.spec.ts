import {
  PATH_CLOSEST_VARIANTS,
  bouncePath,
  composePathClosest,
  isPathClosestFamily,
  offCentre,
  placeable,
} from './composed-closest-paths';
import { CLOSEST_VARIANTS, composeClosest } from './composed-closest';

const families = Object.keys(PATH_CLOSEST_VARIANTS) as Array<
  keyof typeof PATH_CLOSEST_VARIANTS
>;
const every = families.flatMap((familyKey) =>
  (PATH_CLOSEST_VARIANTS[familyKey] as readonly string[]).map(
    (variantKey) => [familyKey, variantKey] as const,
  ),
);
const SEEDS = ['j:0', 'j:1', 'j:2', 'j:3', 'j:4', 'k:7', 'k:11'];
const ANCHORED = ['meeting-point', 'robot-stop', 'ball-drop-floor'];

describe('مين أقرب in المسارات والحركة', () => {
  it('offers eight families of six templates each', () => {
    expect(families).toHaveLength(8);
    for (const familyKey of families)
      expect(PATH_CLOSEST_VARIANTS[familyKey]).toHaveLength(6);
  });

  it('every one of them is reachable through composeClosest', () => {
    for (const [familyKey, variantKey] of every) {
      expect(isPathClosestFamily(familyKey)).toBe(true);
      expect(CLOSEST_VARIANTS[familyKey]).toContain(variantKey);
      const reading = composeClosest(familyKey, 'j:1', variantKey);
      expect(reading.familyKey).toBe(familyKey);
      expect(reading.variantKey).toBe(variantKey);
    }
  });

  it.each(every)(
    '%s / %s draws a whole answer inside its slider',
    (familyKey, variantKey) => {
      for (const seed of SEEDS) {
        const reading = composePathClosest(familyKey, seed, variantKey);
        expect(Number.isInteger(reading.value)).toBe(true);
        expect(reading.value).toBeGreaterThanOrEqual(reading.slider.min);
        expect(reading.value).toBeLessThanOrEqual(reading.slider.max);
        expect((reading.value - reading.slider.min) % reading.slider.step).toBe(
          0,
        );
        expect(reading.svg).toContain('</svg>');
        expect(reading.prompt.length).toBeGreaterThan(10);
      }
    },
  );

  it.each(every)(
    '%s / %s never writes its own answer in the question',
    (familyKey, variantKey) => {
      for (const seed of SEEDS) {
        const reading = composePathClosest(familyKey, seed, variantKey);
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
    '%s / %s keeps one seed to one picture and one answer',
    (familyKey, variantKey) => {
      const once = composePathClosest(familyKey, 'j:2', variantKey);
      const again = composePathClosest(familyKey, 'j:2', variantKey);
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
          const { slider } = composePathClosest(familyKey, seed, variantKey);
          expect(slider.mode).toBe('between-anchors');
          if (slider.mode !== 'between-anchors') return;
          expect(slider.leftAnchor.trim()).not.toBe('');
          expect(slider.rightAnchor.trim()).not.toBe('');
          expect(slider.leftAnchor).not.toBe(slider.rightAnchor);
          expect(slider).not.toHaveProperty('unit');
        }
      },
    );

    // A bare line tempts a team to leave the mark in the middle, and both ends
    // are won by dragging: the screen refuses the first, and we refuse both.
    it.each(anchored)(
      '%s / %s answers away from the middle and the ends',
      (familyKey, variantKey) => {
        for (const seed of SEEDS) {
          const { value, slider } = composePathClosest(
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

    it('calls the exact middle centred, and a fifth away off it', () => {
      expect(offCentre(10, 20)).toBe(false);
      expect(offCentre(12, 20)).toBe(false);
      expect(offCentre(13, 20)).toBe(true);
      expect(placeable(1, 20)).toBe(false);
      expect(placeable(19, 20)).toBe(false);
    });
  });

  describe('the answers are worked out, not written down', () => {
    it('counts bounces as the unfolded path says: cols/g + rows/g - 2', () => {
      const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
      for (const [cols, rows] of [
        [5, 3],
        [7, 4],
        [8, 5],
        [9, 7],
        [6, 4],
        [3, 8],
      ]) {
        const g = gcd(cols, rows);
        expect(bouncePath(cols, rows).hits).toBe(cols / g + rows / g - 2);
      }
    });

    it('ends a bounce path in a corner of the box', () => {
      const { points } = bouncePath(7, 4);
      const [x, y] = points[points.length - 1];
      expect([0, 7]).toContain(x);
      expect([0, 4]).toContain(y);
    });

    it('turns the track into seconds at the speed it shows', () => {
      for (const seed of SEEDS) {
        const reading = composePathClosest('travel-seconds', seed, 'bus');
        const squares = Number(reading.variant.split(':')[1]);
        expect(reading.prompt).toContain('الباص');
        expect(reading.svg).toContain('كل ثانية تتحرك 2 مربعات');
        expect(squares).toBe(reading.value * 2);
      }
    });

    it('turns the driver’s turns by the ratio of the two gears', () => {
      for (const seed of SEEDS) {
        const reading = composePathClosest('gear-turns', seed, 'third');
        const turns = Number(reading.variant.split(':')[1]);
        expect(reading.value).toBe(turns * 3);
        expect(reading.svg).toContain(`لف ${turns} لفات`);
      }
    });

    it('gives the bucket only the share of the branches left open', () => {
      for (const seed of SEEDS) {
        const reading = composePathClosest(
          'pipe-flow-litres',
          seed,
          'two-closed',
        );
        const litres = Number(reading.variant.split(':')[1]);
        expect(reading.value).toBe(litres / 2);
        expect(reading.svg).toContain(`${litres} لتر`);
      }
    });

    it('meets two movers where the ratio of their speeds puts them', () => {
      for (const variantKey of PATH_CLOSEST_VARIANTS['meeting-point']) {
        const reading = composePathClosest('meeting-point', 'j:0', variantKey);
        const [, cells, left, right] = reading.variant.split(':').map(Number);
        expect(reading.value).toBe((cells * left) / (left + right));
        expect(reading.slider.max).toBe(cells);
      }
    });

    it('walks the robot through its orders', () => {
      for (const seed of SEEDS) {
        const reading = composePathClosest('robot-stop', seed, 'four-moves');
        const [, start, moves] = reading.variant.split(':');
        const walked = moves
          .split(',')
          .map(Number)
          .reduce((at, move) => at + move, Number(start));
        expect(reading.value).toBe(walked);
        expect(moves.split(',')).toHaveLength(4);
      }
    });

    it('rolls the ball off the low end of the last board', () => {
      for (const seed of SEEDS) {
        const reading = composePathClosest(
          'ball-drop-floor',
          seed,
          'three-boards',
        );
        const boards = reading.variant.split(':')[2].split(',');
        expect(boards).toHaveLength(3);
        expect(reading.value).toBe(Number(boards[2].split('-')[1]));
        // Each board takes the ball where the one before it left off.
        boards.slice(1).forEach((board, index) => {
          expect(board.split('-')[0]).toBe(boards[index].split('-')[1]);
        });
      }
    });
  });

  it('draws a different picture for each item of one batch', () => {
    for (const [familyKey, variantKey] of every) {
      const drawn = SEEDS.map(
        (seed) => composePathClosest(familyKey, seed, variantKey).svg,
      );
      // Not every template has seven shapes to give, but a template that
      // draws one picture for a whole batch is a repeated question.
      expect(new Set(drawn).size).toBeGreaterThanOrEqual(3);
    }
  });

  it('draws no character the composer font has no glyph for', () => {
    // Arrows, ▲▼, ↻, − and × are not in Noto Kufi Arabic: they are shapes.
    const forbidden = /[←-⇿∀-⋿■-◿⬀-⯿×−]/;
    for (const [familyKey, variantKey] of every) {
      const { svg } = composePathClosest(familyKey, 'j:3', variantKey);
      for (const [, inner] of svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g))
        expect(inner).not.toMatch(forbidden);
    }
  });
});
