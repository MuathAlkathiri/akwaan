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

export interface ComposedPuzzle {
  familyKey: ComposedPuzzleFamily;
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

// ---------------------------------------------------------------------------
// تتبّع الخيط
// ---------------------------------------------------------------------------

export const THREAD_STARTS = [
  { key: 'red', name: 'الحمراء', colour: '#D8493F' },
  { key: 'blue', name: 'الزرقاء', colour: '#2F6FE0' },
  { key: 'green', name: 'الخضراء', colour: '#2FA866' },
] as const;

export const THREAD_ENDS = [
  { key: 'star', name: 'النجمة', to: 'للنجمة' },
  { key: 'square', name: 'المربع', to: 'للمربع' },
  { key: 'triangle', name: 'المثلث', to: 'للمثلث' },
] as const;

const THREAD_LANES = [150, 338, 525];
const THREAD_COLUMNS = [150, 410, 640, 870, 1050];

export interface ThreadRouting {
  /** `lanes[thread][column]` — the lane a thread is in at each column. */
  lanes: number[][];
  /** `endOf[thread]` — the index of the end it reaches. */
  endOf: number[];
}

/**
 * Route three threads so that none ends where it started and every pair
 * crosses at least once: a thread that runs straight across is not traced,
 * it is read off.
 */
export function routeThreads(random: () => number): ThreadRouting {
  const orders = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ];
  /** Arrangements in which every thread sits in a different lane than in `from`. */
  const allMoved = (from: number[]) =>
    orders.filter((order) =>
      order.every((lane, thread) => lane !== from[thread]),
    );
  const identity = orders[0];
  // Every thread changes lane before the first middle column and again
  // before the second, so no thread has a straight stretch to be read along.
  const first = pick(allMoved(identity), random);
  const second = pick(allMoved(first), random);
  // No thread ends level with where it started.
  const endings = allMoved(identity).filter(
    (order) => order.join() !== second.join(),
  );
  const endOf = pick(endings.length ? endings : allMoved(identity), random);
  return {
    lanes: [0, 1, 2].map((thread) => [
      thread,
      first[thread],
      second[thread],
      endOf[thread],
      endOf[thread],
    ]),
    endOf,
  };
}

function endShape(key: string, cx: number, cy: number): string {
  const style = `fill="${GOLD}" stroke="${INK}" stroke-width="10" stroke-linejoin="round"`;
  if (key === 'square') {
    return `<rect x="${cx - 46}" y="${cy - 46}" width="92" height="92" rx="10" ${style}/>`;
  }
  if (key === 'triangle') {
    return `<polygon points="${cx},${cy - 54} ${cx + 54},${cy + 42} ${cx - 54},${cy + 42}" ${style}/>`;
  }
  let points = '';
  for (let k = 0; k < 10; k += 1) {
    const radius = k % 2 ? 25 : 56;
    const angle = -Math.PI / 2 + (k * Math.PI) / 5;
    points += `${round(cx + radius * Math.cos(angle))},${round(cy + radius * Math.sin(angle))} `;
  }
  return `<polygon points="${points.trim()}" ${style}/>`;
}

export function threadsSvg(
  routing: ThreadRouting,
  ends: ReadonlyArray<{ key: string }>,
): string {
  let body = '';
  routing.lanes.forEach((lanes, thread) => {
    const points = lanes.map((lane, column) => ({
      x: THREAD_COLUMNS[column],
      y: THREAD_LANES[lane],
    }));
    // Horizontal tangents at every column: smooth S-curves that cross
    // cleanly instead of kinking.
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
  THREAD_STARTS.forEach((start, index) => {
    body += `<circle data-start="${start.key}" cx="${THREAD_COLUMNS[0]}" cy="${THREAD_LANES[index]}" r="46" fill="${start.colour}" stroke="${INK}" stroke-width="10"/>`;
  });
  ends.forEach((end, index) => {
    body += `<g data-end="${end.key}">${endShape(end.key, THREAD_COLUMNS[4] + 20, THREAD_LANES[index])}</g>`;
  });
  return frame(body);
}

function composeThreads(seed: string): ComposedPuzzle {
  const random = seededRandom(`wire-trace-terminal:${seed}`);
  const routing = routeThreads(random);
  const ends = shuffled(THREAD_ENDS, random);
  const askedEnd = Math.floor(random() * 3);
  const answerThread = routing.endOf.indexOf(askedEnd);
  const { options, correctOptionId } = asOptions(
    THREAD_STARTS.map((start) => start.name),
    THREAD_STARTS[answerThread].name,
    random,
  );
  return {
    familyKey: 'wire-trace-terminal',
    variant: `three-threads:${ends[askedEnd].key}`,
    prompt: `أي دائرة خيطها يوصل ${ends[askedEnd].to}؟`,
    options,
    correctOptionId,
    distractorRationale: options
      .filter((option) => option.id !== correctOptionId)
      .map((option) => {
        const thread = THREAD_STARTS.findIndex(
          (start) => start.name === option.label,
        );
        return {
          optionId: option.id,
          why: `Its thread ends at ${ends[routing.endOf[thread]].key}; a tracer who loses the line at a crossing lands here.`,
        };
      }),
    altText: 'ثلاث دوائر ملوّنة تخرج منها خيوط متشابكة إلى ثلاثة أشكال',
    concept:
      'Follow one of three crossing threads from its coloured start to a named shape.',
    factualClaim: `The ${THREAD_STARTS[answerThread].key} thread was routed to the ${ends[askedEnd].key}.`,
    svg: threadsSvg(routing, ends),
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

/** Six everyday names per theme; never a brand. */
export const CUBE_THEMES: ReadonlyArray<{ key: string; labels: string[] }> = [
  { key: 'dishes', labels: ['كبسة', 'مندي', 'جريش', 'سليق', 'مطبق', 'معصوب'] },
  {
    key: 'cities',
    labels: ['الرياض', 'جدة', 'أبها', 'تبوك', 'حائل', 'الدمام'],
  },
  { key: 'fruits', labels: ['تفاح', 'موز', 'عنب', 'تمر', 'رمان', 'مانجو'] },
  { key: 'animals', labels: ['جمل', 'صقر', 'حصان', 'غزال', 'ذيب', 'نمر'] },
  { key: 'sports', labels: ['قدم', 'سلة', 'طائرة', 'تنس', 'سباحة', 'جري'] },
];

export function cubeNetSvg(cells: readonly Cell[], labels: string[]): string {
  const columns = Math.max(...cells.map((cell) => cell[0])) + 1;
  const rows = Math.max(...cells.map((cell) => cell[1])) + 1;
  const size = Math.min(
    180,
    Math.floor(1040 / columns),
    Math.floor(560 / rows),
  );
  const originX = (W - columns * size) / 2;
  const originY = (H - rows * size) / 2;
  const fontSize = Math.round(size * 0.27);
  return frame(
    cells
      .map(([cx, cy], index) => {
        const x = originX + cx * size;
        const y = originY + cy * size;
        return (
          `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="#FFFFFF" stroke="${INK}" stroke-width="10" stroke-linejoin="round"/>` +
          `<text data-face="${index}" x="${x + size / 2}" y="${round(y + size / 2 + fontSize * 0.36)}" text-anchor="middle" font-family="${PUZZLE_FONT_FAMILY}" font-weight="700" font-size="${fontSize}" fill="${INK}">${labels[index]}</text>`
        );
      })
      .join(''),
  );
}

function composeCubeNet(seed: string): ComposedPuzzle {
  const random = seededRandom(`opposite-cube-faces:${seed}`);
  const net = pick(CUBE_NETS, random);
  const theme = pick(CUBE_THEMES, random);
  const labels = shuffled(theme.labels, random);
  const opposites = cubeNetOpposites(net.cells);
  const asked = Math.floor(random() * 6);
  const answer = opposites[asked];
  // The two tempting wrong faces are the ones touching the asked face in the
  // flat net: neighbours on paper, never opposite on the cube.
  const touching = net.cells
    .map((cell, index) => ({
      index,
      distance:
        Math.abs(cell[0] - net.cells[asked][0]) +
        Math.abs(cell[1] - net.cells[asked][1]),
    }))
    .filter(({ index }) => index !== asked && index !== answer)
    .sort((a, b) => a.distance - b.distance || a.index - b.index)
    .slice(0, 2)
    .map(({ index }) => index);
  const { options, correctOptionId } = asOptions(
    [labels[answer], ...touching.map((index) => labels[index])],
    labels[answer],
    random,
  );
  return {
    familyKey: 'opposite-cube-faces',
    variant: `${net.key}:${theme.key}`,
    prompt: `لو انطوت هذي الشبكة وصارت مكعب، وش الوجه اللي يقابل «${labels[asked]}»؟`,
    options,
    correctOptionId,
    distractorRationale: options
      .filter((option) => option.id !== correctOptionId)
      .map((option) => ({
        optionId: option.id,
        why: 'It sits beside the asked face in the flat net, so it looks close — but a face beside another shares an edge with it and can never be opposite.',
      })),
    altText: 'شبكة من ستة مربعات عليها أسماء، تنطوي لتصير مكعبًا',
    concept:
      'Fold a six-square net in the mind and name the face opposite a given one.',
    factualClaim: `Folding net "${net.key}" puts face ${asked} («${labels[asked]}») opposite face ${answer} («${labels[answer]}»).`,
    svg: cubeNetSvg(net.cells, labels),
  };
}

// ---------------------------------------------------------------------------
// الورقة المطوية
// ---------------------------------------------------------------------------

export const FOLD_CASES = [
  { folds: 1, punches: 1 },
  { folds: 1, punches: 2 },
  { folds: 2, punches: 1 },
  { folds: 2, punches: 2 },
  { folds: 3, punches: 1 },
] as const;

/** Every fold halves the paper, so every punch goes through 2^folds layers. */
export const holesAfterUnfolding = (folds: number, punches: number): number =>
  punches * 2 ** folds;

const FOLD_WORDS = ['', 'مرة وحدة', 'مرتين', 'ثلاث مرات'];
const PUNCH_WORDS = ['', 'خرم واحد', 'خرمين'];

export function foldSvg(folds: number, punches: number): string {
  const base = 250;
  // Panel k shows the paper before fold k; the last shows it punched.
  const sizes: Array<{ w: number; h: number }> = [{ w: base, h: base }];
  for (let fold = 1; fold <= folds; fold += 1) {
    const previous = sizes[fold - 1];
    sizes.push(
      fold % 2 === 1
        ? { w: previous.w / 2, h: previous.h }
        : { w: previous.w, h: previous.h / 2 },
    );
  }
  // A sideways fold draws its arc beside the panel, so it needs more room
  // before the arrow to the next panel.
  const gapAfter = (panel: number): number =>
    panel >= folds ? 0 : (panel + 1) % 2 === 0 ? 190 : 110;
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
      if ((panel + 1) % 2 === 1) {
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
      // Punched, well inside the folded sheet: never on an edge or a crease.
      const radius = Math.min(size.w, size.h) * 0.13;
      const spots =
        punches === 1
          ? [[0.5, 0.5]]
          : [
              [0.5, 0.3],
              [0.5, 0.7],
            ];
      for (const [fx, fy] of spots) {
        body += `<circle data-hole="1" cx="${round(x + size.w * fx)}" cy="${round(y + size.h * fy)}" r="${round(radius)}" fill="${INK}"/>`;
      }
    }
    x += size.w + gapAfter(panel);
  });
  return frame(body);
}

function composeFold(seed: string): ComposedPuzzle {
  const random = seededRandom(`fold-and-punch:${seed}`);
  const { folds, punches } = pick(FOLD_CASES, random);
  const answer = holesAfterUnfolding(folds, punches);
  // What a player gets by a specific slip: seeing only the punches, or
  // forgetting one fold, or counting one fold too many.
  const slips = [
    {
      value: punches,
      why: 'Counts the holes as punched, without unfolding at all.',
    },
    { value: answer / 2, why: 'Forgets one of the folds: half the layers.' },
    { value: answer * 2, why: 'Counts one fold too many: twice the layers.' },
    {
      value: punches * (folds + 1),
      why: 'Adds a hole per fold instead of doubling.',
    },
  ].filter(
    (slip, index, all) =>
      slip.value !== answer &&
      slip.value >= 1 &&
      all.findIndex((other) => other.value === slip.value) === index,
  );
  const wrong = slips.slice(0, 2);
  const { options, correctOptionId } = asOptions(
    [answer, ...wrong.map((slip) => slip.value)].map(String),
    String(answer),
    random,
  );
  return {
    familyKey: 'fold-and-punch',
    variant: `folds-${folds}:punches-${punches}`,
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
    factualClaim: `${folds} fold(s) make ${2 ** folds} layers; ${punches} punch(es) through them leave ${answer} holes.`,
    svg: foldSvg(folds, punches),
  };
}

export const isComposedPuzzleFamily = (
  familyKey: string | null | undefined,
): familyKey is ComposedPuzzleFamily =>
  (COMPOSED_PUZZLE_FAMILIES as readonly string[]).includes(familyKey ?? '');

export function composePuzzle(
  familyKey: ComposedPuzzleFamily,
  seed: string,
): ComposedPuzzle {
  if (familyKey === 'wire-trace-terminal') return composeThreads(seed);
  if (familyKey === 'opposite-cube-faces') return composeCubeNet(seed);
  return composeFold(seed);
}
