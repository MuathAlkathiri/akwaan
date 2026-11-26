import { LETTERS } from './composed-kit';
import {
  OBSERVATION_VARIANTS,
  ObservationFamily,
  composeObservation,
  mirroredMinutes,
} from './composed-observation';
import { COMPOSED_PUZZLE_VARIANTS, composePuzzle } from './composed-puzzles';
import { drawnThings } from './drawn-things';

const seeds = Array.from({ length: 120 }, (_, index) => `job:${index}`);
const answerOf = (item: ReturnType<typeof composeObservation>): string =>
  item.options.find((option) => option.id === item.correctOptionId)!.label;
const things = new Map(drawnThings().map((thing) => [thing.key, thing]));

describe('قوة الملاحظة, more of it drawn', () => {
  it('is drawn through the one composer', () => {
    for (const [familyKey, variants] of Object.entries(OBSERVATION_VARIANTS)) {
      expect(COMPOSED_PUZZLE_VARIANTS[familyKey as ObservationFamily]).toEqual(
        variants,
      );
      expect(
        composePuzzle(familyKey as ObservationFamily, 'job:1').familyKey,
      ).toBe(familyKey);
    }
  });

  it.each(['intruder', 'missing'])(
    'asymmetry / %s: the halves mirror each other except in one place',
    (variantKey) => {
      for (const seed of seeds) {
        const item = composeObservation(
          'visual-asymmetry-detection',
          seed,
          variantKey,
        );
        const side = (name: string) =>
          new Map(
            [
              ...item.svg.matchAll(
                new RegExp(
                  `data-side="${name}" data-slot="(\\d)" data-thing="([^"]+)"`,
                  'g',
                ),
              ),
            ].map((match) => [match[1], match[2]]),
          );
        const left = side('left');
        const right = side('right');
        const broken = [...left].filter(
          ([slot, key]) => right.get(slot) !== key,
        );
        expect(left.size).toBe(6);
        expect(broken).toHaveLength(1);
        const [slot, key] = broken[0];
        expect(answerOf(item)).toBe(
          things.get(variantKey === 'missing' ? key : right.get(slot)!)!.ar,
        );
        expect(right.has(slot)).toBe(variantKey === 'intruder');
        // The right half is drawn flipped, as a mirror would show it.
        expect(item.svg.match(/scale\(-1 1\)/g)).toHaveLength(right.size);
      }
    },
  );

  it('mirror clock: twelve hours less the time shown, never a time that mirrors to itself', () => {
    expect(mirroredMinutes(180)).toBe(540);
    expect(mirroredMinutes(mirroredMinutes(250))).toBe(250);
    for (const seed of seeds) {
      const item = composeObservation(
        'reflection-fidelity',
        seed,
        'mirror-clock',
      );
      const shown = Number(/data-shown="(\d+)"/.exec(item.svg)![1]);
      const real = mirroredMinutes(shown);
      expect(real).not.toBe(shown);
      const hour = Math.floor(real / 60) % 12 || 12;
      expect(answerOf(item)).toBe(
        `${hour}:${String(real % 60).padStart(2, '0')}`,
      );
      // The time as it looks is offered as the trap.
      const looks = Math.floor(shown / 60) % 12 || 12;
      expect(item.options.map((option) => option.label)).toContain(
        `${looks}:${String(shown % 60).padStart(2, '0')}`,
      );
    }
  });

  it('true mirror: only the answer both reverses the row and flips each thing', () => {
    for (const seed of seeds) {
      const item = composeObservation(
        'reflection-fidelity',
        seed,
        'true-mirror',
      );
      const original = /data-original="([^"]+)"/.exec(item.svg)![1].split(',');
      expect(new Set(original).size).toBe(3);
      const mirror = [...original]
        .reverse()
        .map((key) => `${key}!`)
        .join(',');
      const rows = [
        ...item.svg.matchAll(/data-row="(.)" data-shown="([^"]+)"/g),
      ];
      expect(rows).toHaveLength(3);
      for (const [, letter, shown] of rows) {
        expect(shown === mirror).toBe(answerOf(item) === `الصف ${letter}`);
      }
      expect(LETTERS).toContain(rows[0][1]);
    }
  });

  it.each(['on-top', 'at-bottom'])(
    'pile / %s: answers by the order the four are drawn in',
    (variantKey) => {
      for (const seed of seeds) {
        const item = composeObservation(
          'overlapping-boundary-trace',
          seed,
          variantKey,
        );
        const layers = [
          ...item.svg.matchAll(/data-layer="(\d)" data-thing="([^"]+)"/g),
        ].map((match) => match[2]);
        expect(new Set(layers).size).toBe(4);
        expect(answerOf(item)).toBe(
          things.get(layers[variantKey === 'on-top' ? 3 : 0])!.ar,
        );
      }
    },
  );

  it.each(['arrow-lines', 'surrounded-circles', 'tall-or-wide'] as const)(
    'illusion / %s: answers by the sizes as measured, equal or a fifth apart',
    (variantKey) => {
      const answers = new Set<string>();
      for (const seed of seeds) {
        const item = composeObservation(
          'size-distortion-illusion',
          seed,
          variantKey,
        );
        const measured = new Map(
          [
            ...item.svg.matchAll(
              /data-measure="(\w+)" data-length="([\d.]+)"/g,
            ),
          ].map((match) => [match[1], Number(match[2])]),
        );
        const [first, second] =
          variantKey === 'surrounded-circles'
            ? [measured.get('left')!, measured.get('right')!]
            : [measured.get('red')!, measured.get('blue')!];
        const names =
          variantKey === 'surrounded-circles'
            ? ['اليسار', 'اليمين', 'متساويتين']
            : ['الأحمر', 'الأزرق', 'متساويين'];
        expect(answerOf(item)).toBe(
          first === second ? names[2] : first > second ? names[0] : names[1],
        );
        if (first !== second) {
          expect(Math.max(first, second) / Math.min(first, second)).toBeCloseTo(
            1.2,
            1,
          );
        }
        answers.add(answerOf(item));
      }
      // Sometimes equal, sometimes not: "equal" is not always the answer.
      expect(answers.size).toBe(2);
    },
  );
});
