import { createHash } from 'crypto';

/**
 * Drawn puzzles answered by choosing — the second kind of composed item.
 *
 * Like every composed family, each is produced whole from one seed: the
 * drawing, the question, the three options and which of them is right. The
 * answer is not looked up or reasoned out afterwards; it is the same fact the
 * drawing was made from (which thread was routed to which end, which faces a
 * fold brings opposite, how many layers a punch went through).
 *
 * Pure, like `composed-visuals.ts`: strings in, a description out.
 */
export const COMPOSED_PUZZLE_FAMILIES = [
  'wire-trace-terminal',
  'opposite-cube-faces',
  'fold-and-punch',
] as const;

export type ComposedPuzzleFamily = (typeof COMPOSED_PUZZLE_FAMILIES)[number];

export const PUZZLE_FONT_FAMILY = 'Noto Kufi Arabic';

const W = 1200;
const H = 675;
const INK = '#1B1F3B';
const PAPER = '#F6F1E7';
const GOLD = '#E8B33A';
const RED = '#D8493F';

/**
 * The kinds of question each family can ask of its drawing. These are the
 * family's templates: the catalog lists the same keys, the allocator rotates
 * them, and a batch never repeats the previous batch's while another is left.
 */
export const COMPOSED_PUZZLE_VARIANTS = {
  'wire-trace-terminal': [
    'which-start',
    'which-end',
    'count-crossings',
    'broken-thread',
  ],
  'opposite-cube-faces': ['opposite', 'opposite-pair', 'not-touching'],
  'fold-and-punch': ['count-holes', 'count-folds'],
} as const satisfies Record<ComposedPuzzleFamily, readonly string[]>;

export interface ComposedPuzzle {
  familyKey: ComposedPuzzleFamily;
  /** The question asked of the drawing: one of the family's templates. */
  variantKey: string;
  /** The template plus what was drawn, for the reviewer and the tests. */
  variant: string;
  prompt: string;
  options: Array<{ id: string; label: string }>;
  correctOptionId: string;
  /** Why each wrong option is wrong, for the reviewer. */
  distractorRationale: Array<{ optionId: string; why: string }>;
  altText: string;
  concept: string;
  factualClaim: string;
  svg: string;
}

const frame = (body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${PAPER}"/>${body}</svg>`;

const round = (value: number): number => Math.round(value * 10) / 10;

/** A small deterministic generator: the same seed, the same puzzle. */
export function seededRandom(seed: string): () => number {
  let counter = 0;
  let pool = Buffer.alloc(0);
  let offset = 0;
  return () => {
    if (offset + 4 > pool.length) {
      pool = createHash('sha256').update(`${seed}:${counter++}`).digest();
      offset = 0;
    }
    const value = pool.readUInt32BE(offset) / 0x100000000;
    offset += 4;
    return value;
  };
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

const pick = <T>(items: readonly T[], random: () => number): T =>
  items[Math.floor(random() * items.length) % items.length];

/** Three options in a seeded order, ids a/b/c by position. */
function asOptions(
  labels: readonly string[],
  correctLabel: string,
  random: () => number,
): { options: Array<{ id: string; label: string }>; correctOptionId: string } {
  const order = shuffled(labels, random);
  const options = order.map((label, index) => ({
    id: ['a', 'b', 'c', 'd'][index],
    label,
  }));
  return {
    options,
    correctOptionId: options.find((option) => option.label === correctLabel)!
      .id,
  };
}

/** The template asked for, or one chosen by the seed when none was. */
function chooseVariant(
  familyKey: ComposedPuzzleFamily,
  seed: string,
  variantKey?: string,
): string {
  const variants: readonly string[] = COMPOSED_PUZZLE_VARIANTS[familyKey];
  return variantKey && variants.includes(variantKey)
    ? variantKey
    : pick(variants, seededRandom(`${familyKey}:variant:${seed}`));
}

/** A drawn shape centred on a point; `scale` 1 is about 110px across. */
function shapeAt(key: string, cx: number, cy: number, scale = 1): string {
  const style = `fill="${GOLD}" stroke="${INK}" stroke-width="10" stroke-linejoin="round"`;
  let shape: string;
  if (key === 'square') {
    shape = `<rect x="-46" y="-46" width="92" height="92" rx="10" ${style}/>`;
  } else if (key === 'triangle') {
    shape = `<polygon points="0,-54 54,42 -54,42" ${style}/>`;
  } else if (key === 'circle') {
    shape = `<circle cx="0" cy="0" r="50" ${style}/>`;
  } else if (key === 'heart') {
    shape = `<path d="M0 50 C -78 -2, -50 -66, 0 -26 C 50 -66, 78 -2, 0 50 Z" ${style}/>`;
  } else if (key === 'plus') {
    shape = `<polygon points="-18,-52 18,-52 18,-18 52,-18 52,18 18,18 18,52 -18,52 -18,18 -52,18 -52,-18 -18,-18" ${style}/>`;
  } else {
    let points = '';
    for (let k = 0; k < 10; k += 1) {
      const radius = k % 2 ? 25 : 56;
      const angle = -Math.PI / 2 + (k * Math.PI) / 5;
      points += `${round(radius * Math.cos(angle))},${round(radius * Math.sin(angle))} `;
    }
    shape = `<polygon points="${points.trim()}" ${style}/>`;
  }
  return `<g transform="translate(${round(cx)} ${round(cy)}) scale(${scale})">${shape}</g>`;
}

// ---------------------------------------------------------------------------
// تتبّع الخيط
// ---------------------------------------------------------------------------

export const THREAD_STARTS = [
  { key: 'red', name: 'الحمراء', colour: '#D8493F' },
  { key: 'blue', name: 'الزرقاء', colour: '#2F6FE0' },
  { key: 'green', name: 'الخضراء', colour: '#2FA866' },
  { key: 'purple', name: 'البنفسجية', colour: '#8A4FD0' },
] as const;

export const THREAD_ENDS = [
  { key: 'star', name: 'النجمة', to: 'للنجمة' },
  { key: 'square', name: 'المربع', to: 'للمربع' },
  { key: 'triangle', name: 'المثلث', to: 'للمثلث' },
  { key: 'heart', name: 'القلب', to: 'للقلب' },
] as const;

type ThreadStart = (typeof THREAD_STARTS)[number];
type ThreadEnd = (typeof THREAD_ENDS)[number];

/**
 * How the threads are laid on the page: three or four of them, running from
 * the left or — mirrored — from the right. `lanes` are the positions across
 * the threads and `columns` the five stations along them.
 */
export const THREAD_LAYOUTS = [
  {
    key: 'three-from-left',
    threads: 3,
    lanes: [150, 338, 525],
    columns: [150, 410, 640, 870, 1050],
    scale: 1,
  },
  {
    key: 'three-from-right',
    threads: 3,
    lanes: [150, 338, 525],
    columns: [1050, 790, 560, 330, 150],
    scale: 1,
  },
  {
    key: 'four-from-left',
    threads: 4,
    lanes: [92, 256, 419, 583],
    columns: [150, 410, 640, 870, 1050],
    scale: 0.8,
  },
  {
    key: 'four-from-right',
    threads: 4,
    lanes: [92, 256, 419, 583],
    columns: [1050, 790, 560, 330, 150],
    scale: 0.8,
  },
] as const;

export type ThreadLayout = (typeof THREAD_LAYOUTS)[number];

export interface ThreadRouting {
  /** `lanes[thread][column]` — the lane a thread is in at each column. */
  lanes: number[][];
  /** `endOf[thread]` — the index of the end it reaches. */
  endOf: number[];
}

function permutations(count: number): number[][] {
  const result: number[][] = [];
  const walk = (prefix: number[], rest: number[]) => {
    if (rest.length === 0) {
      result.push(prefix);
      return;
    }
    rest.forEach((value, index) =>
      walk(
        [...prefix, value],
        [...rest.slice(0, index), ...rest.slice(index + 1)],
      ),
    );
  };
  walk(
    [],
    Array.from({ length: count }, (_, index) => index),
  );
  return result;
}

/**
 * Whether the move from one arrangement to the next keeps its crossings
 * apart. Between two stations a thread's lane changes along one shared curve,
 * so two threads meet where their lanes are equal; three threads through one
 * point (or two crossings almost on top of each other) cannot be traced.
 */
function crossesCleanly(from: number[], to: number[]): boolean {
  const meetings: Array<{ along: number; lane: number }> = [];
  for (let a = 0; a < from.length; a += 1) {
    for (let b = a + 1; b < from.length; b += 1) {
      const before = from[a] - from[b];
      const after = to[a] - to[b];
      if (before * after >= 0) continue;
      const along = before / (before - after);
      meetings.push({ along, lane: from[a] + (to[a] - from[a]) * along });
    }
  }
  return meetings.every((one, index) =>
    meetings
      .slice(index + 1)
      .every(
        (other) =>
          Math.abs(one.along - other.along) > 0.12 ||
          Math.abs(one.lane - other.lane) > 0.3,
      ),
  );
}

/**
 * Route the threads so that none ends where it started, every thread changes
 * lane at every station, and no two crossings land on top of each other: a
 * thread that runs straight across is not traced, it is read off.
 */
export function routeThreads(random: () => number, count = 3): ThreadRouting {
  const orders = permutations(count);
  /** Arrangements in which every thread sits in a different lane than in `from`. */
  const allMoved = (from: number[]) =>
    orders.filter((order) =>
      order.every((lane, thread) => lane !== from[thread]),
    );
  /** Prefer the moves whose crossings stay apart, while there are any. */
  const next = (from: number[], candidates: number[][]) => {
    const clean = candidates.filter((order) => crossesCleanly(from, order));
    return pick(clean.length ? clean : candidates, random);
  };
  const identity = orders[0];
  const first = next(identity, allMoved(identity));
  const second = next(first, allMoved(first));
  // No thread ends level with where it started, and none coasts into its end.
  const settled = allMoved(identity).filter((order) =>
    order.every((lane, thread) => lane !== second[thread]),
  );
  const endOf = next(
    second,
    settled.length
      ? settled
      : allMoved(identity).filter((order) => order.join() !== second.join()),
  );
  return {
    lanes: identity.map((thread) => [
      thread,
      first[thread],
      second[thread],
      endOf[thread],
      endOf[thread],
    ]),
    endOf,
  };
}

/**
 * How many times one thread crosses the others. Between two stations every
 * thread follows the same curve scaled to its own lanes, so two threads cross
 * there exactly once when their order flips and never otherwise.
 */
export function threadCrossings(
  routing: ThreadRouting,
  thread: number,
): number {
  let crossings = 0;
  routing.lanes.forEach((other, index) => {
    if (index === thread) return;
    for (let column = 0; column + 1 < other.length; column += 1) {
      const before = routing.lanes[thread][column] - other[column];
      const after = routing.lanes[thread][column + 1] - other[column + 1];
      if (before * after < 0) crossings += 1;
    }
  });
  return crossings;
}

export function threadsSvg(
  routing: ThreadRouting,
  ends: ReadonlyArray<{ key: string }>,
  drawing: {
    layout?: ThreadLayout;
    starts?: ReadonlyArray<{ key: string; colour: string }>;
    /** A thread cut at one of its middle stations. */
    cut?: { thread: number; column: number };
  } = {},
): string {
  const layout = drawing.layout ?? THREAD_LAYOUTS[0];
  const starts = drawing.starts ?? THREAD_STARTS;
  // Mirrored, the run goes right to left and the ends sit on the left.
  const direction = layout.columns[4] > layout.columns[0] ? 1 : -1;
  const at = (lane: number, column: number, along = 0) => ({
    x: layout.columns[column] + along * direction,
    y: layout.lanes[lane],
  });
  let body = '';
  routing.lanes.forEach((lanes, thread) => {
    const points = lanes.map((lane, column) => at(lane, column));
    // Level tangents at every station: smooth S-curves that cross cleanly
    // instead of kinking.
    let path = `M${points[0].x} ${points[0].y}`;
    for (let index = 1; index < points.length; index += 1) {
      const from = points[index - 1];
      const to = points[index];
      const middle = (from.x + to.x) / 2;
      path += ` C ${middle} ${from.y}, ${middle} ${to.y}, ${to.x} ${to.y}`;
    }
    // Every thread is the same ink: colour must not do the tracing.
    body += `<path data-thread="${thread}" d="${path}" fill="none" stroke="${INK}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>`;
  });
  if (drawing.cut) {
    // At a station no other thread is near, so the gap removes only this one.
    const { x, y } = at(
      routing.lanes[drawing.cut.thread][drawing.cut.column],
      drawing.cut.column,
    );
    body += `<circle data-cut="${drawing.cut.thread}" cx="${x}" cy="${y}" r="${round(36 * layout.scale)}" fill="${PAPER}"/>`;
  }
  routing.lanes.forEach((_, thread) => {
    const start = at(thread, 0);
    body += `<circle data-start="${starts[thread].key}" cx="${start.x}" cy="${start.y}" r="${round(46 * layout.scale)}" fill="${starts[thread].colour}" stroke="${INK}" stroke-width="10"/>`;
    const end = at(thread, 4, 20);
    body += `<g data-end="${ends[thread].key}">${shapeAt(ends[thread].key, end.x, end.y, layout.scale)}</g>`;
  });
  return frame(body);
}

const COUNT_WORDS = [
  'ولا مرة',
  'مرة وحدة',
  'مرتين',
  '3 مرات',
  '4 مرات',
  '5 مرات',
  '6 مرات',
  '7 مرات',
  '8 مرات',
  '9 مرات',
  '10 مرات',
  '11 مرة',
];

function composeThreads(seed: string, variantKey: string): ComposedPuzzle {
  const random = seededRandom(`wire-trace-terminal:${variantKey}:${seed}`);
  // Counting crossings is asked of three threads only: with four there are
  // too many to count against the clock.
  const layout = pick(
    variantKey === 'count-crossings'
      ? THREAD_LAYOUTS.filter((entry) => entry.threads === 3)
      : THREAD_LAYOUTS,
    random,
  );
  const routing = routeThreads(random, layout.threads);
  const starts: ThreadStart[] = shuffled(THREAD_STARTS, random).slice(
    0,
    layout.threads,
  );
  const ends: ThreadEnd[] = shuffled(THREAD_ENDS, random).slice(
    0,
    layout.threads,
  );
  const threads = starts.map((_, index) => index);
  /** The right label against two of the others, in a seeded order. */
  const among = (labels: string[], correct: string) =>
    asOptions(
      [
        correct,
        ...shuffled(
          labels.filter((label) => label !== correct),
          random,
        ).slice(0, 2),
      ],
      correct,
      random,
    );
  const shared = {
    familyKey: 'wire-trace-terminal' as const,
    variantKey,
    altText: `${layout.threads === 4 ? 'أربع' : 'ثلاث'} دوائر ملوّنة تخرج منها خيوط متشابكة إلى أشكال`,
  };
  const reaches = (thread: number) => ends[routing.endOf[thread]];

  if (variantKey === 'which-end') {
    const asked = pick(threads, random);
    const { options, correctOptionId } = among(
      ends.map((end) => end.name),
      reaches(asked).name,
    );
    return {
      ...shared,
      variant: `${variantKey}:${layout.key}:${starts[asked].key}`,
      prompt: `خيط الدائرة ${starts[asked].name} يوصل لوين؟`,
      options,
      correctOptionId,
      distractorRationale: options
        .filter((option) => option.id !== correctOptionId)
        .map((option) => ({
          optionId: option.id,
          why: 'Another thread ends there; a tracer who switches threads at a crossing lands on it.',
        })),
      concept:
        'Follow one named thread through the crossings and say which shape it reaches.',
      factualClaim: `The ${starts[asked].key} thread was routed to the ${reaches(asked).key}.`,
      svg: threadsSvg(routing, ends, { layout, starts }),
    };
  }

  if (variantKey === 'count-crossings') {
    const asked = pick(threads, random);
    const answer = threadCrossings(routing, asked);
    const wrong = [answer - 1, answer + 1, answer + 2, answer - 2]
      .filter((value) => value >= 1)
      .slice(0, 2);
    const { options, correctOptionId } = asOptions(
      [answer, ...wrong].map((value) => COUNT_WORDS[value]),
      COUNT_WORDS[answer],
      random,
    );
    return {
      ...shared,
      variant: `${variantKey}:${layout.key}:${starts[asked].key}:${answer}`,
      prompt: `خيط الدائرة ${starts[asked].name} كم مرة يتقاطع مع الخيوط الثانية؟`,
      options,
      correctOptionId,
      distractorRationale: options
        .filter((option) => option.id !== correctOptionId)
        .map((option) => ({
          optionId: option.id,
          why:
            COUNT_WORDS.indexOf(option.label) < answer
              ? 'Misses a crossing where two other threads meet close by.'
              : 'Counts a crossing between two other threads as one of its own.',
        })),
      concept:
        'Follow one named thread and count how many times it crosses the others.',
      factualClaim: `The ${starts[asked].key} thread crosses the other threads ${answer} time(s).`,
      svg: threadsSvg(routing, ends, { layout, starts }),
    };
  }

  if (variantKey === 'broken-thread') {
    const cut = { thread: pick(threads, random), column: pick([1, 2], random) };
    const { options, correctOptionId } = among(
      starts.map((start) => start.name),
      starts[cut.thread].name,
    );
    return {
      ...shared,
      variant: `${variantKey}:${layout.key}:${starts[cut.thread].key}`,
      prompt: 'فيه خيط واحد مقطوع. خيط أي دائرة؟',
      options,
      correctOptionId,
      distractorRationale: options
        .filter((option) => option.id !== correctOptionId)
        .map((option) => ({
          optionId: option.id,
          why: 'Its thread passes near the gap and runs unbroken to its shape.',
        })),
      altText: `${shared.altText}، وواحد منها مقطوع`,
      concept:
        'Find which start owns the one thread that is cut before it arrives.',
      factualClaim: `The ${starts[cut.thread].key} thread was cut at station ${cut.column}.`,
      svg: threadsSvg(routing, ends, { layout, starts, cut }),
    };
  }

  const askedEnd = pick(threads, random);
  const answerThread = routing.endOf.indexOf(askedEnd);
  const { options, correctOptionId } = among(
    starts.map((start) => start.name),
    starts[answerThread].name,
  );
  return {
    ...shared,
    variant: `${variantKey}:${layout.key}:${ends[askedEnd].key}`,
    prompt: `أي دائرة خيطها يوصل ${ends[askedEnd].to}؟`,
    options,
    correctOptionId,
    distractorRationale: options
      .filter((option) => option.id !== correctOptionId)
      .map((option) => {
        const thread = starts.findIndex((start) => start.name === option.label);
        return {
          optionId: option.id,
          why: `Its thread ends at ${reaches(thread).key}; a tracer who loses the line at a crossing lands here.`,
        };
      }),
    concept:
      'Follow crossing threads back from a named shape to the coloured start that owns it.',
    factualClaim: `The ${starts[answerThread].key} thread was routed to the ${ends[askedEnd].key}.`,
    svg: threadsSvg(routing, ends, { layout, starts }),
  };
}
// ---------------------------------------------------------------------------
// المكعب المطوي
// ---------------------------------------------------------------------------

type Cell = readonly [number, number];
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

/**
 * What is written or drawn on the six faces: everyday names (never a brand),
 * plain colours, or simple shapes.
 */
export const CUBE_THEMES: ReadonlyArray<{
  key: string;
  labels: string[];
  fills?: string[];
  shapes?: string[];
}> = [
  { key: 'dishes', labels: ['كبسة', 'مندي', 'جريش', 'سليق', 'مطبق', 'معصوب'] },
  {
    key: 'cities',
    labels: ['الرياض', 'جدة', 'أبها', 'تبوك', 'حائل', 'الدمام'],
  },
  { key: 'fruits', labels: ['تفاح', 'موز', 'عنب', 'تمر', 'رمان', 'مانجو'] },
  { key: 'animals', labels: ['جمل', 'صقر', 'حصان', 'غزال', 'ذيب', 'نمر'] },
  { key: 'sports', labels: ['قدم', 'سلة', 'طائرة', 'تنس', 'سباحة', 'جري'] },
  {
    key: 'colours',
    labels: ['الأحمر', 'الأزرق', 'الأخضر', 'الأصفر', 'البرتقالي', 'البنفسجي'],
    fills: ['#D8493F', '#2F6FE0', '#2FA866', '#F2C230', '#F08A24', '#8A4FD0'],
  },
  {
    key: 'shapes',
    labels: ['النجمة', 'المربع', 'المثلث', 'الدائرة', 'القلب', 'علامة الزائد'],
    shapes: ['star', 'square', 'triangle', 'circle', 'heart', 'plus'],
  },
];

export interface CubeFace {
  label: string;
  fill?: string;
  shape?: string;
}

export function cubeNetSvg(
  cells: readonly Cell[],
  faces: ReadonlyArray<CubeFace>,
): string {
  const columns = Math.max(...cells.map((cell) => cell[0])) + 1;
  const rows = Math.max(...cells.map((cell) => cell[1])) + 1;
  const size = Math.min(
    180,
    Math.floor(1040 / columns),
    Math.floor(560 / rows),
  );
  const originX = (W - columns * size) / 2;
  const originY = (H - rows * size) / 2;
  const fontSize = Math.round(size * 0.23);
  return frame(
    cells
      .map(([cx, cy], index) => {
        const x = originX + cx * size;
        const y = originY + cy * size;
        const face = faces[index];
        const inside = face.shape
          ? shapeAt(face.shape, x + size / 2, y + size / 2, round(size / 200))
          : face.fill
            ? ''
            : `<text x="${x + size / 2}" y="${round(y + size / 2 + fontSize * 0.36)}" text-anchor="middle" font-family="${PUZZLE_FONT_FAMILY}" font-weight="700" font-size="${fontSize}" fill="${INK}">${face.label}</text>`;
        return (
          `<g data-face="${index}" data-label="${face.label}">` +
          `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${face.fill ?? '#FFFFFF'}" stroke="${INK}" stroke-width="10" stroke-linejoin="round"/>` +
          `${inside}</g>`
        );
      })
      .join(''),
  );
}

function composeCubeNet(seed: string, variantKey: string): ComposedPuzzle {
  const random = seededRandom(`opposite-cube-faces:${variantKey}:${seed}`);
  const net = pick(CUBE_NETS, random);
  const theme = pick(CUBE_THEMES, random);
  const faces: CubeFace[] = shuffled(
    theme.labels.map((label, index) => ({
      label,
      ...(theme.fills ? { fill: theme.fills[index] } : {}),
      ...(theme.shapes ? { shape: theme.shapes[index] } : {}),
    })),
    random,
  );
  const labels = faces.map((face) => face.label);
  const opposites = cubeNetOpposites(net.cells);
  /** How far apart two faces lie on the flat net, in steps. */
  const apart = (a: number, b: number) =>
    Math.abs(net.cells[a][0] - net.cells[b][0]) +
    Math.abs(net.cells[a][1] - net.cells[b][1]);
  const shared = {
    familyKey: 'opposite-cube-faces' as const,
    variantKey,
    variant: `${net.key}:${theme.key}:${variantKey}`,
    altText: theme.fills
      ? 'شبكة من ستة مربعات ملوّنة، تنطوي لتصير مكعبًا'
      : theme.shapes
        ? 'شبكة من ستة مربعات على كل واحد شكل، تنطوي لتصير مكعبًا'
        : 'شبكة من ستة مربعات عليها أسماء، تنطوي لتصير مكعبًا',
    svg: cubeNetSvg(net.cells, faces),
  };

  if (variantKey === 'opposite-pair') {
    const pairs: Array<[number, number]> = [];
    for (let a = 0; a < 6; a += 1) {
      for (let b = a + 1; b < 6; b += 1) pairs.push([a, b]);
    }
    const name = ([a, b]: [number, number]) => `${labels[a]} و${labels[b]}`;
    const answer = pick(
      pairs.filter(([a, b]) => opposites[a] === b),
      random,
    );
    // The tempting wrong pairs lie far apart on paper — they look as if they
    // must end up on opposite sides — yet folding brings them edge to edge.
    const far = shuffled(
      pairs.filter(([a, b]) => opposites[a] !== b),
      random,
    ).sort((p, q) => apart(q[0], q[1]) - apart(p[0], p[1]));
    // Three pairs built on one face would only ask what is opposite it.
    const second = far
      .slice(1)
      .find(
        (pair) =>
          !pair.some((face) => far[0].includes(face) && answer.includes(face)),
      );
    const wrong = [far[0], second ?? far[1]];
    const { options, correctOptionId } = asOptions(
      [answer, ...wrong].map(name),
      name(answer),
      random,
    );
    return {
      ...shared,
      prompt: 'لو انطوت هذي الشبكة وصارت مكعب، أي وجهين يصيرون متقابلين؟',
      options,
      correctOptionId,
      distractorRationale: options
        .filter((option) => option.id !== correctOptionId)
        .map((option) => ({
          optionId: option.id,
          why: 'Far apart on the flat net, so they look opposite — but folding brings these two to share an edge.',
        })),
      concept:
        'Fold a six-square net in the mind and pick the pair of faces that end up opposite.',
      factualClaim: `Folding net "${net.key}" puts face ${answer[0]} («${labels[answer[0]]}») opposite face ${answer[1]} («${labels[answer[1]]}»).`,
    };
  }

  const asked = Math.floor(random() * 6);
  const answer = opposites[asked];
  const others = net.cells
    .map((_, index) => index)
    .filter((index) => index !== asked && index !== answer);
  const notTouching = variantKey === 'not-touching';
  // Asked for the opposite face, the tempting wrong ones touch the asked
  // face on paper. Asked which face never touches it, they are the ones
  // farthest from it on paper — far, yet edge to edge once folded.
  const wrong = [...others]
    .sort(
      (a, b) =>
        (notTouching
          ? apart(b, asked) - apart(a, asked)
          : apart(a, asked) - apart(b, asked)) || a - b,
    )
    .slice(0, 2);
  const { options, correctOptionId } = asOptions(
    [labels[answer], ...wrong.map((index) => labels[index])],
    labels[answer],
    random,
  );
  return {
    ...shared,
    prompt: notTouching
      ? `لو انطوت هذي الشبكة وصارت مكعب، أي وجه ما يلمس «${labels[asked]}» أبدًا؟`
      : `لو انطوت هذي الشبكة وصارت مكعب، وش الوجه اللي يقابل «${labels[asked]}»؟`,
    options,
    correctOptionId,
    distractorRationale: options
      .filter((option) => option.id !== correctOptionId)
      .map((option) => ({
        optionId: option.id,
        why: notTouching
          ? 'It lies far from the asked face on the flat net, so it looks out of reach — but folding brings it to share an edge with it.'
          : 'It sits beside the asked face in the flat net, so it looks close — but a face beside another shares an edge with it and can never be opposite.',
      })),
    concept: notTouching
      ? 'Fold a six-square net in the mind and name the one face that never touches a given one.'
      : 'Fold a six-square net in the mind and name the face opposite a given one.',
    factualClaim: `Folding net "${net.key}" puts face ${asked} («${labels[asked]}») opposite face ${answer} («${labels[answer]}»).`,
  };
}

// ---------------------------------------------------------------------------
// الورقة المطوية
// ---------------------------------------------------------------------------

export const FOLD_CASES = [
  { folds: 1, punches: 1 },
  { folds: 1, punches: 2 },
  { folds: 1, punches: 3 },
  { folds: 2, punches: 1 },
  { folds: 2, punches: 2 },
  { folds: 2, punches: 3 },
  { folds: 3, punches: 1 },
] as const;

/** Every fold halves the paper, so every punch goes through 2^folds layers. */
export const holesAfterUnfolding = (folds: number, punches: number): number =>
  punches * 2 ** folds;

const FOLD_WORDS = ['', 'مرة وحدة', 'مرتين', 'ثلاث مرات'];
const PUNCH_WORDS = ['', 'خرم واحد', 'خرمين', 'ثلاثة خروم'];

/**
 * Fold `fold` (1-based) creases the sheet top to bottom — halving its width —
 * or side to side. The two alternate; `sidewaysFirst` starts with the other.
 */
const creaseIsUpright = (fold: number, sidewaysFirst: boolean): boolean =>
  (fold % 2 === 1) !== sidewaysFirst;

/** The sheet's size before any fold (index 0) and after each one. */
function foldedSizes(
  folds: number,
  sidewaysFirst: boolean,
  base: number,
): Array<{ w: number; h: number }> {
  const sizes = [{ w: base, h: base }];
  for (let fold = 1; fold <= folds; fold += 1) {
    const previous = sizes[fold - 1];
    sizes.push(
      creaseIsUpright(fold, sidewaysFirst)
        ? { w: previous.w / 2, h: previous.h }
        : { w: previous.w, h: previous.h / 2 },
    );
  }
  return sizes;
}

/** Where the punches go on the folded sheet, and how big: never on an edge. */
function punchSpots(
  size: { w: number; h: number },
  punches: number,
): { spots: Array<{ x: number; y: number }>; radius: number } {
  const along =
    punches === 1 ? [0.5] : punches === 2 ? [0.3, 0.7] : [0.2, 0.5, 0.8];
  const wide = size.w > size.h;
  return {
    spots: along.map((share) =>
      wide
        ? { x: size.w * share, y: size.h / 2 }
        : { x: size.w / 2, y: size.h * share },
    ),
    radius: Math.min(size.w, size.h) * (punches === 3 ? 0.1 : 0.13),
  };
}

/**
 * Open the sheet again: every fold undone mirrors each hole across that
 * fold's crease. Positions are on a sheet `base` wide.
 */
export function unfoldedHoles(
  folds: number,
  punches: number,
  sidewaysFirst = false,
  base = 1,
): { holes: Array<{ x: number; y: number }>; radius: number } {
  const sizes = foldedSizes(folds, sidewaysFirst, base);
  const { spots, radius } = punchSpots(sizes[folds], punches);
  let holes = spots;
  for (let fold = folds; fold >= 1; fold -= 1) {
    const folded = sizes[fold];
    holes = holes.flatMap((hole) =>
      creaseIsUpright(fold, sidewaysFirst)
        ? [hole, { x: 2 * folded.w - hole.x, y: hole.y }]
        : [hole, { x: hole.x, y: 2 * folded.h - hole.y }],
    );
  }
  return { holes, radius };
}

export function foldSvg(
  folds: number,
  punches: number,
  sidewaysFirst = false,
): string {
  // Panel k shows the paper before fold k; the last shows it punched.
  const sizes = foldedSizes(folds, sidewaysFirst, 250);
  // A sideways fold draws its arc beside the panel, so it needs more room
  // before the arrow to the next panel.
  const gapAfter = (panel: number): number =>
    panel >= folds ? 0 : creaseIsUpright(panel + 1, sidewaysFirst) ? 110 : 190;
  const total = sizes.reduce(
    (sum, size, panel) => sum + size.w + gapAfter(panel),
    0,
  );
  let x = (W - total) / 2;
  const middle = H / 2;
  let body = '';
  sizes.forEach((size, panel) => {
    const y = middle - size.h / 2;
    body += `<rect data-panel="${panel}" x="${round(x)}" y="${round(y)}" width="${size.w}" height="${size.h}" fill="#FFFFFF" stroke="${INK}" stroke-width="10" stroke-linejoin="round"/>`;
    if (panel < folds) {
      // The fold about to happen: a dashed crease and an arrow over it.
      if (creaseIsUpright(panel + 1, sidewaysFirst)) {
        const crease = x + size.w / 2;
        body +=
          `<line x1="${round(crease)}" y1="${round(y)}" x2="${round(crease)}" y2="${round(y + size.h)}" stroke="${INK}" stroke-width="6" stroke-dasharray="16 14"/>` +
          `<path d="M${round(x + size.w - 30)} ${round(y - 22)} Q ${round(crease)} ${round(y - 92)} ${round(x + 30)} ${round(y - 22)}" fill="none" stroke="${RED}" stroke-width="9" stroke-linecap="round"/>` +
          `<polygon points="${round(x + 30)},${round(y - 22)} ${round(x + 58)},${round(y - 30)} ${round(x + 38)},${round(y - 50)}" fill="${RED}"/>`;
      } else {
        const crease = y + size.h / 2;
        body +=
          `<line x1="${round(x)}" y1="${round(crease)}" x2="${round(x + size.w)}" y2="${round(crease)}" stroke="${INK}" stroke-width="6" stroke-dasharray="16 14"/>` +
          `<path d="M${round(x + size.w + 22)} ${round(y + size.h - 30)} Q ${round(x + size.w + 86)} ${round(crease)} ${round(x + size.w + 22)} ${round(y + 30)}" fill="none" stroke="${RED}" stroke-width="9" stroke-linecap="round"/>` +
          `<polygon points="${round(x + size.w + 22)},${round(y + 30)} ${round(x + size.w + 30)},${round(y + 58)} ${round(x + size.w + 50)},${round(y + 38)}" fill="${RED}"/>`;
      }
      const arrowX = x + size.w + gapAfter(panel) - 52;
      body += `<path d="M${round(arrowX - 22)} ${middle} h44 m-18 -18 l18 18 l-18 18" fill="none" stroke="${INK}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`;
    } else {
      const { spots, radius } = punchSpots(size, punches);
      for (const spot of spots) {
        body += `<circle data-hole="1" cx="${round(x + spot.x)}" cy="${round(y + spot.y)}" r="${round(radius)}" fill="${INK}"/>`;
      }
    }
    x += size.w + gapAfter(panel);
  });
  return frame(body);
}

/** The sheet opened flat again, with every hole the punches left in it. */
export function unfoldedSvg(
  folds: number,
  punches: number,
  sidewaysFirst = false,
): string {
  const base = 500;
  const x = (W - base) / 2;
  const y = (H - base) / 2;
  const { holes, radius } = unfoldedHoles(folds, punches, sidewaysFirst, base);
  return frame(
    `<rect data-panel="open" x="${x}" y="${y}" width="${base}" height="${base}" fill="#FFFFFF" stroke="${INK}" stroke-width="10" stroke-linejoin="round"/>` +
      holes
        .map(
          (hole) =>
            `<circle data-hole="1" cx="${round(x + hole.x)}" cy="${round(y + hole.y)}" r="${round(radius)}" fill="${INK}"/>`,
        )
        .join(''),
  );
}

function composeFold(seed: string, variantKey: string): ComposedPuzzle {
  const random = seededRandom(`fold-and-punch:${variantKey}:${seed}`);
  const { folds, punches } = pick(FOLD_CASES, random);
  const sidewaysFirst = random() < 0.5;
  const holes = holesAfterUnfolding(folds, punches);
  const shared = {
    familyKey: 'fold-and-punch' as const,
    variantKey,
    variant: `folds-${folds}:punches-${punches}:${variantKey}:${sidewaysFirst ? 'sideways-first' : 'upright-first'}`,
  };

  if (variantKey === 'count-folds') {
    const { options, correctOptionId } = asOptions(
      FOLD_WORDS.slice(1),
      FOLD_WORDS[folds],
      random,
    );
    return {
      ...shared,
      prompt: `ورقة انطوت وانخرمت ${PUNCH_WORDS[punches]}، وبعدها انفتحت وصارت زي الصورة. كم مرة انطوت؟`,
      options,
      correctOptionId,
      distractorRationale: options
        .filter((option) => option.id !== correctOptionId)
        .map((option) => {
          const guessed = FOLD_WORDS.indexOf(option.label);
          return {
            optionId: option.id,
            why: `${guessed} fold(s) would leave ${holesAfterUnfolding(guessed, punches)} holes, not the ${holes} drawn.`,
          };
        }),
      altText: 'ورقة مربعة مفتوحة فيها خروم',
      concept:
        'Read how many times a sheet was folded from the holes it shows once opened.',
      factualClaim: `${punches} punch(es) left ${holes} holes, so the sheet had ${2 ** folds} layers: ${folds} fold(s).`,
      svg: unfoldedSvg(folds, punches, sidewaysFirst),
    };
  }

  // What a player gets by a specific slip: seeing only the punches, or
  // forgetting one fold, or counting one fold too many.
  const slips = [
    {
      value: punches,
      why: 'Counts the holes as punched, without unfolding at all.',
    },
    { value: holes / 2, why: 'Forgets one of the folds: half the layers.' },
    { value: holes * 2, why: 'Counts one fold too many: twice the layers.' },
    {
      value: punches * (folds + 1),
      why: 'Adds a hole per fold instead of doubling.',
    },
  ].filter(
    (slip, index, all) =>
      slip.value !== holes &&
      slip.value >= 1 &&
      all.findIndex((other) => other.value === slip.value) === index,
  );
  const wrong = slips.slice(0, 2);
  const { options, correctOptionId } = asOptions(
    [holes, ...wrong.map((slip) => slip.value)].map(String),
    String(holes),
    random,
  );
  return {
    ...shared,
    prompt: `ورقة انطوت ${FOLD_WORDS[folds]} وانخرمت ${PUNCH_WORDS[punches]} زي الصورة. كم خرم فيها لما تنفتح؟`,
    options,
    correctOptionId,
    distractorRationale: options
      .filter((option) => option.id !== correctOptionId)
      .map((option) => ({
        optionId: option.id,
        why:
          wrong.find((slip) => String(slip.value) === option.label)?.why ?? '',
      })),
    altText: 'ورقة مربعة تُطوى ثم تُخرم، خطوة بخطوة',
    concept:
      'Count the holes a folded-and-punched sheet has once it is opened.',
    factualClaim: `${folds} fold(s) make ${2 ** folds} layers; ${punches} punch(es) through them leave ${holes} holes.`,
    svg: foldSvg(folds, punches, sidewaysFirst),
  };
}

export const isComposedPuzzleFamily = (
  familyKey: string | null | undefined,
): familyKey is ComposedPuzzleFamily =>
  (COMPOSED_PUZZLE_FAMILIES as readonly string[]).includes(familyKey ?? '');

/**
 * Compose one puzzle. `variantKey` is the template the slot was given; left
 * out (or unknown), the seed chooses one.
 */
export function composePuzzle(
  familyKey: ComposedPuzzleFamily,
  seed: string,
  variantKey?: string,
): ComposedPuzzle {
  const variant = chooseVariant(familyKey, seed, variantKey);
  if (familyKey === 'wire-trace-terminal') return composeThreads(seed, variant);
  if (familyKey === 'opposite-cube-faces') return composeCubeNet(seed, variant);
  return composeFold(seed, variant);
}
