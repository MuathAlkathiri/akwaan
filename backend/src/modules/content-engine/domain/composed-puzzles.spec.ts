import {
  COMPOSED_PUZZLE_FAMILIES,
  CUBE_NETS,
  CUBE_THEMES,
  FOLD_CASES,
  THREAD_ENDS,
  THREAD_STARTS,
  composePuzzle,
  cubeNetNormals,
  cubeNetOpposites,
  holesAfterUnfolding,
  routeThreads,
  seededRandom,
} from './composed-puzzles';
import { isComposedFamily } from './composed-visuals';

const seeds = Array.from({ length: 200 }, (_, index) => `job:${index}`);

describe('composed puzzles answered by choosing', () => {
  it('are part of what the engine draws', () => {
    for (const familyKey of COMPOSED_PUZZLE_FAMILIES) {
      expect(isComposedFamily(familyKey)).toBe(true);
    }
    expect(isComposedFamily('must-be-true')).toBe(false);
  });

  it.each(COMPOSED_PUZZLE_FAMILIES)(
    '%s: three different options, one of them right, the same for the same seed',
    (familyKey) => {
      for (const seed of seeds.slice(0, 60)) {
        const item = composePuzzle(familyKey, seed);
        expect(item).toEqual(composePuzzle(familyKey, seed));
        expect(item.options).toHaveLength(3);
        expect(new Set(item.options.map((option) => option.label)).size).toBe(
          3,
        );
        expect(item.options.map((option) => option.id)).toEqual([
          'a',
          'b',
          'c',
        ]);
        expect(
          item.options.some((option) => option.id === item.correctOptionId),
        ).toBe(true);
        // One reason per wrong option, never for the right one.
        expect(
          item.distractorRationale.map((entry) => entry.optionId).sort(),
        ).toEqual(
          item.options
            .map((option) => option.id)
            .filter((id) => id !== item.correctOptionId)
            .sort(),
        );
        for (const entry of item.distractorRationale) {
          expect(entry.why.length).toBeGreaterThan(10);
        }
        expect(item.svg.startsWith('<svg')).toBe(true);
      }
    },
  );

  it.each(COMPOSED_PUZZLE_FAMILIES)(
    '%s: the right answer is not always in the same place',
    (familyKey) => {
      const positions = new Set(
        seeds.map((seed) => composePuzzle(familyKey, seed).correctOptionId),
      );
      expect([...positions].sort()).toEqual(['a', 'b', 'c']);
    },
  );

  describe('تتبّع الخيط', () => {
    it('never lets a thread run straight or end level with its start', () => {
      for (const seed of seeds) {
        const { lanes, endOf } = routeThreads(seededRandom(seed));
        expect([...endOf].sort()).toEqual([0, 1, 2]);
        lanes.forEach((thread, index) => {
          expect(thread[0]).toBe(index);
          expect(thread[1]).not.toBe(thread[0]);
          expect(thread[2]).not.toBe(thread[1]);
          expect(endOf[index]).not.toBe(index);
          expect(thread[3]).toBe(endOf[index]);
        });
        // At every column the three threads are in three different lanes.
        for (let column = 0; column < 5; column += 1) {
          expect(new Set(lanes.map((thread) => thread[column])).size).toBe(3);
        }
      }
    });

    it('answers with the start whose thread was routed to the asked end', () => {
      for (const seed of seeds.slice(0, 80)) {
        const item = composePuzzle('wire-trace-terminal', seed);
        const answer = item.options.find(
          (option) => option.id === item.correctOptionId,
        )!.label;
        const start = THREAD_STARTS.find((entry) => entry.name === answer)!;
        const end = THREAD_ENDS.find((entry) =>
          item.prompt.includes(entry.to),
        )!;
        expect(item.factualClaim).toBe(
          `The ${start.key} thread was routed to the ${end.key}.`,
        );
      }
    });

    it('draws every thread in one colour, so colour cannot do the tracing', () => {
      const svg = composePuzzle('wire-trace-terminal', 'job:1').svg;
      const strokes = [
        ...svg.matchAll(
          /<path data-thread="\d"[^>]*stroke="(#[0-9A-Fa-f]{6})"/g,
        ),
      ].map((match) => match[1]);
      expect(strokes).toHaveLength(3);
      expect(new Set(strokes).size).toBe(1);
    });
  });

  describe('المكعب المطوي', () => {
    it.each(CUBE_NETS.map((net) => [net.key, net] as const))(
      'net %s folds into a cube: six faces, three opposite pairs',
      (_key, net) => {
        expect(net.cells).toHaveLength(6);
        const normals = cubeNetNormals(net.cells).map((normal) =>
          normal.join(),
        );
        expect(new Set(normals).size).toBe(6);
        const opposites = cubeNetOpposites(net.cells);
        opposites.forEach((other, index) => {
          expect(other).not.toBe(-1);
          expect(other).not.toBe(index);
          expect(opposites[other]).toBe(index);
          // Opposite faces never touch in the flat net.
          const [ax, ay] = net.cells[index];
          const [bx, by] = net.cells[other];
          expect(Math.abs(ax - bx) + Math.abs(ay - by)).toBeGreaterThan(1);
        });
      },
    );

    it('never draws a cross or a T (owner rule)', () => {
      for (const net of CUBE_NETS) {
        const has = (x: number, y: number) =>
          net.cells.some((cell) => cell[0] === x && cell[1] === y);
        for (const [x, y] of net.cells) {
          const arms = [
            has(x + 1, y),
            has(x - 1, y),
            has(x, y + 1),
            has(x, y - 1),
          ].filter(Boolean).length;
          // A cell with three or four neighbours is the centre of a T or a cross.
          expect(arms).toBeLessThanOrEqual(2);
        }
      }
    });

    it('offers the true opposite against two faces that only sit beside the asked one', () => {
      for (const seed of seeds.slice(0, 80)) {
        const item = composePuzzle('opposite-cube-faces', seed);
        const [netKey, themeKey] = item.variant.split(':');
        const net = CUBE_NETS.find((entry) => entry.key === netKey)!;
        const theme = CUBE_THEMES.find((entry) => entry.key === themeKey)!;
        const faces = [
          ...item.svg.matchAll(/data-face="(\d)"[^>]*>([^<]+)</g),
        ].map((match) => match[2]);
        expect([...faces].sort()).toEqual([...theme.labels].sort());
        const asked = faces.findIndex((label) =>
          item.prompt.includes(`«${label}»`),
        );
        const answer = item.options.find(
          (option) => option.id === item.correctOptionId,
        )!.label;
        expect(faces[cubeNetOpposites(net.cells)[asked]]).toBe(answer);
        expect(item.options.map((option) => option.label)).not.toContain(
          faces[asked],
        );
      }
    });
  });

  describe('الورقة المطوية', () => {
    it('doubles the holes with every fold', () => {
      expect(holesAfterUnfolding(1, 1)).toBe(2);
      expect(holesAfterUnfolding(2, 1)).toBe(4);
      expect(holesAfterUnfolding(2, 2)).toBe(8);
      expect(holesAfterUnfolding(3, 1)).toBe(8);
    });

    it('answers with that count and draws what the question says', () => {
      for (const seed of seeds.slice(0, 80)) {
        const item = composePuzzle('fold-and-punch', seed);
        const [folds, punches] = item.variant
          .split(':')
          .map((part) => Number(part.split('-')[1]));
        expect(FOLD_CASES).toContainEqual({ folds, punches });
        const answer = item.options.find(
          (option) => option.id === item.correctOptionId,
        )!.label;
        expect(answer).toBe(String(holesAfterUnfolding(folds, punches)));
        // One panel per fold and one punched, with exactly the punches drawn.
        expect(item.svg.match(/data-panel=/g)).toHaveLength(folds + 1);
        expect(item.svg.match(/data-hole=/g)).toHaveLength(punches);
      }
    });
  });
});
