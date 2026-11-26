import { readFileSync } from 'fs';
import { join } from 'path';
import {
  COMPOSED_PUZZLE_FAMILIES,
  COMPOSED_PUZZLE_VARIANTS,
  CUBE_NETS,
  CUBE_THEMES,
  FOLD_CASES,
  THREAD_ENDS,
  THREAD_LAYOUTS,
  THREAD_STARTS,
  composePuzzle,
  cubeNetNormals,
  cubeNetOpposites,
  holesAfterUnfolding,
  routeThreads,
  seededRandom,
  threadCrossings,
  unfoldedHoles,
} from './composed-puzzles';
import { isComposedFamily } from './composed-visuals';

const seeds = Array.from({ length: 200 }, (_, index) => `job:${index}`);

/** Every template of every family, as [family, template] pairs. */
const templates = COMPOSED_PUZZLE_FAMILIES.flatMap((familyKey) =>
  COMPOSED_PUZZLE_VARIANTS[familyKey].map(
    (variantKey) => [familyKey, variantKey] as const,
  ),
);

const answerOf = (item: ReturnType<typeof composePuzzle>): string =>
  item.options.find((option) => option.id === item.correctOptionId)!.label;

describe('composed puzzles answered by choosing', () => {
  it('are part of what the engine draws', () => {
    for (const familyKey of COMPOSED_PUZZLE_FAMILIES) {
      expect(isComposedFamily(familyKey)).toBe(true);
    }
    expect(isComposedFamily('must-be-true')).toBe(false);
  });

  it.each(templates)(
    '%s / %s: three different options, one of them right, the same for the same seed',
    (familyKey, variantKey) => {
      for (const seed of seeds.slice(0, 60)) {
        const item = composePuzzle(familyKey, seed, variantKey);
        expect(item).toEqual(composePuzzle(familyKey, seed, variantKey));
        expect(item.variantKey).toBe(variantKey);
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

  it.each(templates)(
    '%s / %s: the right answer is not always in the same place',
    (familyKey, variantKey) => {
      const positions = new Set(
        seeds.map(
          (seed) => composePuzzle(familyKey, seed, variantKey).correctOptionId,
        ),
      );
      expect([...positions].sort()).toEqual(['a', 'b', 'c']);
    },
  );

  it.each(COMPOSED_PUZZLE_FAMILIES)(
    '%s: with no template asked for, the seed chooses among all of them',
    (familyKey) => {
      const chosen = new Set(
        seeds.map((seed) => composePuzzle(familyKey, seed).variantKey),
      );
      expect([...chosen].sort()).toEqual(
        [...COMPOSED_PUZZLE_VARIANTS[familyKey]].sort(),
      );
      // A template the family does not have is not an error: the seed chooses.
      expect(COMPOSED_PUZZLE_VARIANTS[familyKey]).toContain(
        composePuzzle(familyKey, 'job:1', 'no-such-template').variantKey,
      );
    },
  );

  it('offers the allocator exactly the templates the composer can draw', () => {
    const skills = join(
      __dirname,
      '../../../../../ai/.opencode/skills/worlds/puzzles/scopes',
    );
    const catalog = ['assembly-rotation', 'paths-motion'].flatMap((scope) => {
      const text = readFileSync(join(skills, scope, 'KNOWLEDGE.md'), 'utf8');
      const block = /```akwaan-families\n([\s\S]*?)\n```/.exec(text)![1];
      return (
        JSON.parse(block) as {
          families: Array<{
            familyKey: string;
            variants?: Array<{ key: string }>;
          }>;
        }
      ).families;
    });
    for (const familyKey of COMPOSED_PUZZLE_FAMILIES) {
      const family = catalog.find((entry) => entry.familyKey === familyKey)!;
      expect((family.variants ?? []).map((variant) => variant.key)).toEqual([
        ...COMPOSED_PUZZLE_VARIANTS[familyKey],
      ]);
    }
  });

  describe('تتبّع الخيط', () => {
    it.each([3, 4])(
      'never lets one of %i threads run straight or end level with its start',
      (count) => {
        const all = Array.from({ length: count }, (_, index) => index);
        for (const seed of seeds) {
          const { lanes, endOf } = routeThreads(seededRandom(seed), count);
          expect([...endOf].sort()).toEqual(all);
          lanes.forEach((thread, index) => {
            expect(thread[0]).toBe(index);
            expect(thread[1]).not.toBe(thread[0]);
            expect(thread[2]).not.toBe(thread[1]);
            expect(thread[3]).not.toBe(thread[2]);
            expect(endOf[index]).not.toBe(index);
            expect(thread[3]).toBe(endOf[index]);
          });
          // At every station the threads are all in different lanes.
          for (let column = 0; column < 5; column += 1) {
            expect(new Set(lanes.map((thread) => thread[column])).size).toBe(
              count,
            );
          }
        }
      },
    );

    it('never sends three threads through one point', () => {
      for (const seed of seeds) {
        const { lanes } = routeThreads(seededRandom(seed), 4);
        for (let column = 0; column < 3; column += 1) {
          const meetings: Array<[number, number]> = [];
          for (let a = 0; a < 4; a += 1) {
            for (let b = a + 1; b < 4; b += 1) {
              const before = lanes[a][column] - lanes[b][column];
              const after = lanes[a][column + 1] - lanes[b][column + 1];
              if (before * after >= 0) continue;
              const along = before / (before - after);
              meetings.push([
                along,
                lanes[a][column] +
                  (lanes[a][column + 1] - lanes[a][column]) * along,
              ]);
            }
          }
          meetings.forEach((one, index) => {
            for (const other of meetings.slice(index + 1)) {
              expect(
                Math.abs(one[0] - other[0]) > 0.12 ||
                  Math.abs(one[1] - other[1]) > 0.3,
              ).toBe(true);
            }
          });
        }
      }
    });

    it('draws three or four threads, from the left or from the right', () => {
      const layouts = new Set(
        seeds.map(
          (seed) =>
            composePuzzle(
              'wire-trace-terminal',
              seed,
              'which-start',
            ).variant.split(':')[1],
        ),
      );
      expect([...layouts].sort()).toEqual(
        THREAD_LAYOUTS.map((layout) => layout.key).sort(),
      );
    });

    it('answers with the start whose thread was routed to the asked end', () => {
      for (const seed of seeds.slice(0, 80)) {
        const item = composePuzzle('wire-trace-terminal', seed, 'which-start');
        const start = THREAD_STARTS.find(
          (entry) => entry.name === answerOf(item),
        )!;
        const end = THREAD_ENDS.find((entry) =>
          item.prompt.includes(entry.to),
        )!;
        expect(item.factualClaim).toBe(
          `The ${start.key} thread was routed to the ${end.key}.`,
        );
        // Only starts that are drawn are offered.
        for (const option of item.options) {
          const offered = THREAD_STARTS.find(
            (entry) => entry.name === option.label,
          )!;
          expect(item.svg).toContain(`data-start="${offered.key}"`);
        }
      }
    });

    it('answers with the shape a named thread was routed to', () => {
      for (const seed of seeds.slice(0, 80)) {
        const item = composePuzzle('wire-trace-terminal', seed, 'which-end');
        const start = THREAD_STARTS.find((entry) =>
          item.prompt.includes(entry.name),
        )!;
        const end = THREAD_ENDS.find((entry) => entry.name === answerOf(item))!;
        expect(item.factualClaim).toBe(
          `The ${start.key} thread was routed to the ${end.key}.`,
        );
        for (const option of item.options) {
          const offered = THREAD_ENDS.find(
            (entry) => entry.name === option.label,
          )!;
          expect(item.svg).toContain(`data-end="${offered.key}"`);
        }
      }
    });

    it('counts the crossings of one thread, on three threads only', () => {
      // Two threads that swap lanes cross once; a third that keeps clear of
      // both crosses neither.
      const routing = {
        lanes: [
          [0, 1, 1],
          [1, 0, 0],
          [2, 2, 2],
        ],
        endOf: [1, 0, 2],
      };
      expect(threadCrossings(routing, 0)).toBe(1);
      expect(threadCrossings(routing, 1)).toBe(1);
      expect(threadCrossings(routing, 2)).toBe(0);
      for (const seed of seeds.slice(0, 80)) {
        const item = composePuzzle(
          'wire-trace-terminal',
          seed,
          'count-crossings',
        );
        const [, layoutKey, , count] = item.variant.split(':');
        expect(layoutKey.startsWith('three-')).toBe(true);
        expect(Number(count)).toBeGreaterThanOrEqual(1);
        expect(item.factualClaim).toContain(`${count} time(s)`);
        expect(item.svg.match(/data-thread=/g)).toHaveLength(3);
      }
    });

    it('cuts exactly one thread, at a station, and answers with its start', () => {
      for (const seed of seeds.slice(0, 80)) {
        const item = composePuzzle(
          'wire-trace-terminal',
          seed,
          'broken-thread',
        );
        expect(item.svg.match(/data-cut=/g)).toHaveLength(1);
        const start = THREAD_STARTS.find(
          (entry) => entry.name === answerOf(item),
        )!;
        expect(item.factualClaim).toContain(`The ${start.key} thread was cut`);
      }
      expect(
        composePuzzle('wire-trace-terminal', 'job:1', 'which-end').svg,
      ).not.toContain('data-cut=');
    });

    it('draws every thread in one colour, so colour cannot do the tracing', () => {
      for (const seed of seeds.slice(0, 20)) {
        const svg = composePuzzle('wire-trace-terminal', seed).svg;
        const strokes = [
          ...svg.matchAll(
            /<path data-thread="\d"[^>]*stroke="(#[0-9A-Fa-f]{6})"/g,
          ),
        ].map((match) => match[1]);
        expect([3, 4]).toContain(strokes.length);
        expect(new Set(strokes).size).toBe(1);
      }
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

    /** The net and the faces as drawn, read back from the picture. */
    const drawn = (item: ReturnType<typeof composePuzzle>) => {
      const [netKey, themeKey] = item.variant.split(':');
      const net = CUBE_NETS.find((entry) => entry.key === netKey)!;
      const theme = CUBE_THEMES.find((entry) => entry.key === themeKey)!;
      const faces = [
        ...item.svg.matchAll(/data-face="(\d)" data-label="([^"]+)"/g),
      ].map((match) => match[2]);
      expect([...faces].sort()).toEqual([...theme.labels].sort());
      return { net, theme, faces, opposites: cubeNetOpposites(net.cells) };
    };

    it.each(['opposite', 'not-touching'])(
      '%s: answers with the face that folds opposite the asked one',
      (variantKey) => {
        for (const seed of seeds.slice(0, 80)) {
          const item = composePuzzle('opposite-cube-faces', seed, variantKey);
          const { faces, opposites } = drawn(item);
          const asked = faces.findIndex((label) =>
            item.prompt.includes(`«${label}»`),
          );
          expect(faces[opposites[asked]]).toBe(answerOf(item));
          expect(item.options.map((option) => option.label)).not.toContain(
            faces[asked],
          );
        }
      },
    );

    it('opposite-pair: one pair is opposite, the other two share an edge once folded', () => {
      for (const seed of seeds.slice(0, 80)) {
        const item = composePuzzle(
          'opposite-cube-faces',
          seed,
          'opposite-pair',
        );
        const { faces, opposites } = drawn(item);
        const isOpposite = (label: string) => {
          const pair = faces.filter((face) => label.split(' و').includes(face));
          expect(pair).toHaveLength(2);
          return faces[opposites[faces.indexOf(pair[0])]] === pair[1];
        };
        for (const option of item.options) {
          expect(isOpposite(option.label)).toBe(
            option.id === item.correctOptionId,
          );
        }
      }
    });

    it('writes names, paints colours or draws shapes on the faces', () => {
      const kinds = new Set<string>();
      for (const seed of seeds) {
        const item = composePuzzle('opposite-cube-faces', seed, 'opposite');
        const { theme } = drawn(item);
        const kind = theme.fills
          ? 'colours'
          : theme.shapes
            ? 'shapes'
            : 'names';
        kinds.add(kind);
        // Names are written; colours and shapes carry no text to read.
        expect(item.svg.includes('<text')).toBe(kind === 'names');
      }
      expect([...kinds].sort()).toEqual(['colours', 'names', 'shapes']);
    });
  });

  describe('الورقة المطوية', () => {
    it('doubles the holes with every fold', () => {
      expect(holesAfterUnfolding(1, 1)).toBe(2);
      expect(holesAfterUnfolding(2, 1)).toBe(4);
      expect(holesAfterUnfolding(2, 2)).toBe(8);
      expect(holesAfterUnfolding(3, 1)).toBe(8);
    });

    it('opens the sheet by mirroring every hole across every crease', () => {
      for (const { folds, punches } of FOLD_CASES) {
        for (const sidewaysFirst of [false, true]) {
          const { holes, radius } = unfoldedHoles(
            folds,
            punches,
            sidewaysFirst,
          );
          expect(holes).toHaveLength(holesAfterUnfolding(folds, punches));
          holes.forEach((hole, index) => {
            // Inside the sheet, clear of its edge.
            for (const value of [hole.x, hole.y]) {
              expect(value - radius).toBeGreaterThan(0);
              expect(value + radius).toBeLessThan(1);
            }
            // No two holes overlap.
            for (const other of holes.slice(index + 1)) {
              expect(
                Math.hypot(hole.x - other.x, hole.y - other.y),
              ).toBeGreaterThan(2 * radius);
            }
          });
        }
      }
      // One fold down the middle: the hole and its mirror image.
      expect(unfoldedHoles(1, 1).holes).toEqual([
        { x: 0.25, y: 0.5 },
        { x: 0.75, y: 0.5 },
      ]);
    });

    it('count-folds: shows the opened sheet and answers with the folds that made it', () => {
      const words = ['', 'مرة وحدة', 'مرتين', 'ثلاث مرات'];
      for (const seed of seeds.slice(0, 80)) {
        const item = composePuzzle('fold-and-punch', seed, 'count-folds');
        const [folds, punches] = item.variant
          .split(':')
          .slice(0, 2)
          .map((part) => Number(part.split('-')[1]));
        expect(answerOf(item)).toBe(words[folds]);
        expect(item.svg.match(/data-panel=/g)).toHaveLength(1);
        expect(item.svg.match(/data-hole=/g)).toHaveLength(
          holesAfterUnfolding(folds, punches),
        );
      }
    });

    it('answers with that count and draws what the question says', () => {
      for (const seed of seeds.slice(0, 80)) {
        const item = composePuzzle('fold-and-punch', seed, 'count-holes');
        const [folds, punches] = item.variant
          .split(':')
          .slice(0, 2)
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
