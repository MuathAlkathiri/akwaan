import {
  PATHS_VARIANTS,
  PathsFamily,
  buildMaze,
  buildRoadMap,
  composePaths,
  dominoesFallen,
  gearTurnsLikeFirst,
  junctionsReached,
  lampLights,
  mazeDistances,
  ropeLength,
} from './composed-paths';
import { LETTERS, NAMED_COLOURS, seededRandom } from './composed-kit';
import { COMPOSED_PUZZLE_VARIANTS, composePuzzle } from './composed-puzzles';

const seeds = Array.from({ length: 120 }, (_, index) => `job:${index}`);
const answerOf = (item: ReturnType<typeof composePaths>): string =>
  item.options.find((option) => option.id === item.correctOptionId)!.label;

describe('المسارات والحركة, drawn', () => {
  it('is drawn through the one composer', () => {
    for (const [familyKey, variants] of Object.entries(PATHS_VARIANTS)) {
      expect(COMPOSED_PUZZLE_VARIANTS[familyKey as PathsFamily]).toEqual(
        variants,
      );
      expect(composePuzzle(familyKey as PathsFamily, 'job:1').familyKey).toBe(
        familyKey,
      );
    }
  });

  describe('التروس', () => {
    it('reverses the turn at every mesh', () => {
      expect([0, 1, 2, 3, 4].map(gearTurnsLikeFirst)).toEqual([
        true,
        false,
        true,
        false,
        true,
      ]);
    });

    it('last-direction: the last gear turns as the count of meshes says', () => {
      for (const seed of seeds) {
        const item = composePaths(
          'gear-train-direction',
          seed,
          'last-direction',
        );
        const gears = item.svg.match(/data-gear=/g)!.length;
        const clockwise = item.svg.includes('data-turn="clockwise"');
        const same = (gears - 1) % 2 === 0;
        expect(answerOf(item)).toBe(
          clockwise === same ? 'مع عقارب الساعة' : 'عكس عقارب الساعة',
        );
      }
    });

    it('same-as-first: exactly one option is an even number of meshes away', () => {
      for (const seed of seeds) {
        const item = composePaths(
          'gear-train-direction',
          seed,
          'same-as-first',
        );
        const order = [...item.svg.matchAll(/data-gear="([^"]+)"/g)].map(
          (match) => match[1],
        );
        const indexOf = (label: string) =>
          order.indexOf(
            NAMED_COLOURS.find((entry) => entry.name === label)!.key,
          );
        for (const option of item.options) {
          expect(indexOf(option.label)).toBeGreaterThan(0);
          expect(gearTurnsLikeFirst(indexOf(option.label))).toBe(
            option.id === item.correctOptionId,
          );
        }
      }
    });

    it('count-direction: every second gear turns with the first', () => {
      for (const seed of seeds.slice(0, 40)) {
        const item = composePaths(
          'gear-train-direction',
          seed,
          'count-direction',
        );
        const gears = item.svg.match(/data-gear=/g)!.length;
        expect(answerOf(item)).toBe(String(Math.ceil(gears / 2)));
      }
    });
  });

  describe('المتاهة', () => {
    it('falls into three sealed parts, none of them small', () => {
      for (const seed of seeds) {
        const maze = buildMaze(seededRandom(seed));
        expect(new Set(maze.part).size).toBe(3);
        for (const part of [0, 1, 2]) {
          const cells = maze.part
            .map((p, cell) => (p === part ? cell : -1))
            .filter((cell) => cell >= 0);
          expect(cells.length).toBeGreaterThanOrEqual(6);
          // Every cell of a part reaches every other, and no cell outside it.
          const distance = mazeDistances(maze.open, cells[0]);
          distance.forEach((steps, cell) => {
            expect(steps >= 0).toBe(maze.part[cell] === part);
          });
        }
      }
    });

    it.each(['to-which', 'from-which'])(
      '%s: only the right mark shares a part with the one on its own',
      (variantKey) => {
        for (const seed of seeds) {
          const item = composePaths('maze-exit-route', seed, variantKey);
          const [, , one, other] = item.variant.split(':').map(Number);
          const cells = [...item.svg.matchAll(/data-cell="(\d+)"/g)].map(
            (match) => Number(match[1]),
          );
          expect(new Set(cells).size).toBe(4);
          expect(cells).toContain(one);
          expect(cells).toContain(other);
          // Rebuild the walls from the picture's own seed and check reach.
          const maze = buildMaze(
            seededRandom(`maze-exit-route:${variantKey}:${seed}`),
          );
          const reach = mazeDistances(maze.open, one);
          expect(reach[other]).toBeGreaterThanOrEqual(4);
          for (const cell of cells) {
            if (cell !== one && cell !== other) expect(reach[cell]).toBe(-1);
          }
        }
      },
    );
  });

  describe('الحبال', () => {
    it('measures a rope by its drops and its sideways runs', () => {
      expect(ropeLength([0, 0, 0, 0, 0, 0])).toBe(5);
      expect(ropeLength([0, 3, 0, 3, 0, 3])).toBe(20);
    });

    it.each(['longest', 'shortest'])(
      '%s: answers by true length, with lengths plainly apart',
      (variantKey) => {
        for (const seed of seeds) {
          const item = composePaths('shortest-path-grid', seed, variantKey);
          const ropes = [
            ...item.svg.matchAll(/data-rope="([^"]+)" data-length="(\d+)"/g),
          ].map((match) => ({ key: match[1], length: Number(match[2]) }));
          const sorted = [...ropes].sort((a, b) => a.length - b.length);
          expect(sorted[1].length - sorted[0].length).toBeGreaterThanOrEqual(2);
          expect(sorted[2].length - sorted[1].length).toBeGreaterThanOrEqual(2);
          const wanted = variantKey === 'shortest' ? sorted[0] : sorted[2];
          expect(answerOf(item)).toBe(
            NAMED_COLOURS.find((entry) => entry.key === wanted.key)!.name,
          );
        }
      },
    );
  });

  describe('الدومينو', () => {
    it('stops the chain at the first gap a piece cannot reach', () => {
      expect(dominoesFallen({ heights: [120, 120, 120], gaps: [55, 55] })).toBe(
        3,
      );
      expect(
        dominoesFallen({ heights: [120, 120, 120], gaps: [165, 55] }),
      ).toBe(1);
      // A tall piece reaches a gap a short one cannot.
      expect(
        dominoesFallen({ heights: [200, 120, 120], gaps: [150, 150] }),
      ).toBe(2);
    });

    it("never leaves a gap close to a piece's own height, and always stops short", () => {
      for (const seed of seeds) {
        const item = composePaths('domino-cascade-chain', seed, 'last-to-fall');
        const [, count, fallen] = item.variant.split(':').map(Number);
        expect(fallen).toBeGreaterThanOrEqual(2);
        expect(fallen).toBeLessThan(count);
        expect(answerOf(item)).toBe(`القطعة ${fallen}`);
        const standing = composePaths(
          'domino-cascade-chain',
          seed,
          'count-standing',
        );
        const [, total, down] = standing.variant.split(':').map(Number);
        expect(answerOf(standing)).toBe(String(total - down));
      }
    });
  });

  describe('الطرق', () => {
    it.each([
      ['reachable', 1],
      ['unreachable', 2],
    ] as const)('%s: the car reaches exactly %i lot(s)', (variantKey, open) => {
      for (const seed of seeds) {
        const map = buildRoadMap(
          seededRandom(`one-way-traffic-flow:${variantKey}:${seed}`),
          open,
        );
        const reached = junctionsReached(map, 4);
        const rows = [0, 1, 2].filter((row) => reached.has(row * 4 + 3));
        expect(rows).toHaveLength(open);
        const item = composePaths('one-way-traffic-flow', seed, variantKey);
        const answer = LETTERS.findIndex(
          (letter) => answerOf(item) === `الموقف ${letter}`,
        );
        expect(rows.includes(answer)).toBe(variantKey === 'reachable');
        // Every road in the picture is one of the map's, and each once.
        expect(item.svg.match(/data-road=/g)).toHaveLength(map.roads.length);
      }
    });
  });

  describe('الدارة', () => {
    it('lights a lamp only when every switch on its wire is closed', () => {
      expect(lampLights([true, true])).toBe(true);
      expect(lampLights([true, false])).toBe(false);
    });

    it.each(['which-lights', 'which-stays-off'])(
      '%s: answers from the switches as drawn',
      (variantKey) => {
        for (const seed of seeds) {
          const item = composePaths(
            'electrical-switch-circuit',
            seed,
            variantKey,
          );
          const lit = [0, 1, 2].filter((branch) =>
            [
              ...item.svg.matchAll(
                new RegExp(
                  `data-switch="${branch}-\\d" data-closed="(\\w+)"`,
                  'g',
                ),
              ),
            ].every((match) => match[1] === 'true'),
          );
          expect(lit).toHaveLength(variantKey === 'which-lights' ? 1 : 2);
          const answer = LETTERS.findIndex(
            (letter) => answerOf(item) === `اللمبة ${letter}`,
          );
          expect(lit.includes(answer)).toBe(variantKey === 'which-lights');
        }
      },
    );
  });
});
