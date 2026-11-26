/** Cube nets, and folding one to see which faces end up where. */
export type Cell = readonly [number, number];
type Vector = readonly [number, number, number];

/**
 * Cube nets that are neither a cross nor a T (owner rule: a net must never
 * read as a cross). Each is six unit cells; `cubeNetNormals` proves each
 * folds into a cube.
 */
export const CUBE_NETS: ReadonlyArray<{ key: string; cells: readonly Cell[] }> =
  [
    {
      key: 'staircase',
      cells: [
        [0, 0],
        [1, 0],
        [1, 1],
        [2, 1],
        [2, 2],
        [3, 2],
      ],
    },
    {
      key: 'two-rows',
      cells: [
        [0, 0],
        [1, 0],
        [2, 0],
        [2, 1],
        [3, 1],
        [4, 1],
      ],
    },
    {
      key: 'step-and-tail',
      cells: [
        [0, 0],
        [1, 0],
        [1, 1],
        [2, 1],
        [3, 1],
        [3, 2],
      ],
    },
    {
      key: 'tail-and-step',
      cells: [
        [0, 0],
        [0, 1],
        [1, 1],
        [2, 1],
        [2, 2],
        [3, 2],
      ],
    },
    {
      key: 'long-z',
      cells: [
        [0, 0],
        [0, 1],
        [1, 1],
        [2, 1],
        [3, 1],
        [3, 2],
      ],
    },
  ];

const negate = (v: Vector): Vector => [-v[0], -v[1], -v[2]];

/**
 * Fold a net: the outward normal each cell ends up with on the cube. Two
 * cells are opposite faces exactly when their normals are opposite.
 */
export function cubeNetNormals(cells: readonly Cell[]): Vector[] {
  const key = (cell: Cell) => `${cell[0]},${cell[1]}`;
  const index = new Map(cells.map((cell, i) => [key(cell), i]));
  const frames = new Map<
    number,
    { normal: Vector; right: Vector; down: Vector }
  >();
  frames.set(0, { normal: [0, 0, -1], right: [1, 0, 0], down: [0, 1, 0] });
  const queue = [0];
  while (queue.length) {
    const current = queue.shift()!;
    const { normal, right, down } = frames.get(current)!;
    const [x, y] = cells[current];
    const steps: Array<
      [Cell, { normal: Vector; right: Vector; down: Vector }]
    > = [
      [[x + 1, y], { normal: right, right: negate(normal), down }],
      [[x - 1, y], { normal: negate(right), right: normal, down }],
      [[x, y + 1], { normal: down, right, down: negate(normal) }],
      [[x, y - 1], { normal: negate(down), right, down: normal }],
    ];
    for (const [cell, next] of steps) {
      const neighbour = index.get(key(cell));
      if (neighbour === undefined || frames.has(neighbour)) continue;
      frames.set(neighbour, next);
      queue.push(neighbour);
    }
  }
  return cells.map((_, i) => frames.get(i)!.normal);
}

/** `opposite[i]` — the cell that ends up facing cell `i`. */
export function cubeNetOpposites(cells: readonly Cell[]): number[] {
  const normals = cubeNetNormals(cells);
  return normals.map((normal) =>
    normals.findIndex((other) => other.join() === negate(normal).join()),
  );
}
