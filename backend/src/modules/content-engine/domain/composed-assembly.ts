import {
  ComposedPuzzleDrawing,
  H,
  INK,
  LETTERS,
  PUZZLE_FONT_FAMILY,
  RED,
  W,
  asOptions,
  countOptions,
  frame,
  letterBadge,
  pick,
  round,
  sameReason,
  seededRandom,
  shuffled,
} from './composed-kit';
import { CUBE_NETS, Cell, cubeNetNormals } from './cube-nets';

/**
 * التركيب والتدوير — puzzles of turning, flipping, fitting and stacking a
 * shape in the mind. Shapes are built from unit squares or unit cubes, so
 * "the same shape turned" and "its mirror image" are facts that are computed,
 * not judged.
 */
export const ASSEMBLY_VARIANTS = {
  'mental-rotation-2d': ['which-same', 'which-different'],
  'mirror-vs-rotation-discrim': ['which-mirrored', 'which-turned-only'],
  'missing-puzzle-piece': ['fits', 'fits-turned'],
  'cube-net-fold': ['folds', 'does-not-fold'],
  'spatial-cube-count': ['count-all', 'count-top-layer'],
  'orthographic-projection': ['top-view', 'front-view'],
} as const;

export type AssemblyFamily = keyof typeof ASSEMBLY_VARIANTS;

// ---------------------------------------------------------------------------
// Shapes of unit squares
// ---------------------------------------------------------------------------

export type Shape = readonly Cell[];

/** Moved to the corner and put in one order, so equal shapes compare equal. */
export function normalised(shape: Shape): Cell[] {
  const left = Math.min(...shape.map((cell) => cell[0]));
  const top = Math.min(...shape.map((cell) => cell[1]));
  return shape
    .map((cell): Cell => [cell[0] - left, cell[1] - top])
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

/** A quarter turn clockwise, `turns` times. */
export function turned(shape: Shape, turns: number): Cell[] {
  let result: Cell[] = [...shape];
  for (let turn = 0; turn < ((turns % 4) + 4) % 4; turn += 1) {
    result = result.map((cell): Cell => [-cell[1], cell[0]]);
  }
  return normalised(result);
}

export const mirrored = (shape: Shape): Cell[] =>
  normalised(shape.map((cell): Cell => [-cell[0], cell[1]]));

const written = (shape: Shape) => JSON.stringify(normalised(shape));

/** Whether one shape can be turned — never flipped — into the other. */
export const sameWhenTurned = (a: Shape, b: Shape): boolean =>
  [0, 1, 2, 3].some((turns) => written(turned(a, turns)) === written(b));

/**
 * Shapes that differ from their own mirror image however they are turned:
 * only such a shape can ask "turned, or flipped?".
 */
export const HANDED_SHAPES: ReadonlyArray<{ key: string; cells: Shape }> = [
  {
    key: 'l4',
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 2],
    ],
  },
  {
    key: 's4',
    cells: [
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
    ],
  },
  {
    key: 'f5',
    cells: [
      [1, 0],
      [2, 0],
      [0, 1],
      [1, 1],
      [1, 2],
    ],
  },
  {
    key: 'l5',
    cells: [
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
      [1, 3],
    ],
  },
  {
    key: 'n5',
    cells: [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 2],
      [1, 3],
    ],
  },
  {
    key: 'p5',
    cells: [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
      [0, 2],
    ],
  },
  {
    key: 'y5',
    cells: [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, 2],
      [1, 3],
    ],
  },
  {
    key: 'z5',
    cells: [
      [0, 0],
      [1, 0],
      [1, 1],
      [1, 2],
      [2, 2],
    ],
  },
];

const SHAPE_COLOURS = ['#2F6FE0', '#2FA866', '#F08A24', '#8A4FD0', '#D8493F'];

function shapeSvg(
  shape: Shape,
  cx: number,
  cy: number,
  unit: number,
  fill: string,
): string {
  const cells = normalised(shape);
  const width = (Math.max(...cells.map((cell) => cell[0])) + 1) * unit;
  const height = (Math.max(...cells.map((cell) => cell[1])) + 1) * unit;
  return cells
    .map(
      (cell) =>
        `<rect x="${round(cx - width / 2 + cell[0] * unit)}" y="${round(cy - height / 2 + cell[1] * unit)}" width="${unit}" height="${unit}" fill="${fill}" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>`,
    )
    .join('');
}

const CARDS = { y: 190, width: 244, height: 330, xs: [392, 660, 928] };

/** Three lettered cards, each holding one candidate, right of a wider panel. */
function candidateCards(
  inside: (index: number, cx: number, cy: number) => string,
): string {
  return CARDS.xs
    .map(
      (x, index) =>
        `<g data-candidate="${LETTERS[index]}">` +
        `<rect x="${x}" y="${CARDS.y}" width="${CARDS.width}" height="${CARDS.height}" rx="28" fill="#FFFFFF" stroke="${INK}" stroke-width="10"/>` +
        inside(index, x + CARDS.width / 2, CARDS.y + CARDS.height / 2) +
        `${letterBadge(LETTERS[index], x + CARDS.width / 2, CARDS.y - 52, 36)}</g>`,
    )
    .join('');
}

const panel = (title: string, inside: string): string =>
  `<rect x="40" y="${CARDS.y - 30}" width="310" height="${CARDS.height + 60}" rx="28" fill="#FFFFFF" stroke="${INK}" stroke-width="10"/>` +
  `<text x="195" y="${CARDS.y - 62}" text-anchor="middle" font-family="${PUZZLE_FONT_FAMILY}" font-weight="700" font-size="44" fill="${INK}">${title}</text>` +
  inside;

const shapeLabel = (index: number) => `الشكل ${LETTERS[index]}`;

/** What a candidate is, relative to the original. */
type Kind = 'turned' | 'flipped' | 'other';

interface Candidate {
  kind: Kind;
  cells: Cell[];
}

function candidateOf(
  kind: Kind,
  base: { key: string; cells: Shape },
  random: () => number,
  turns = 1 + Math.floor(random() * 3),
): Candidate {
  if (kind === 'turned') return { kind, cells: turned(base.cells, turns) };
  if (kind === 'flipped') {
    return { kind, cells: turned(mirrored(base.cells), turns) };
  }
  const other = pick(
    HANDED_SHAPES.filter(
      (shape) =>
        shape.key !== base.key && shape.cells.length === base.cells.length,
    ),
    random,
  );
  return {
    kind,
    cells: turned(random() < 0.5 ? other.cells : mirrored(other.cells), turns),
  };
}

function composeTurning(
  familyKey: 'mental-rotation-2d' | 'mirror-vs-rotation-discrim',
  seed: string,
  variantKey: string,
): ComposedPuzzleDrawing {
  const random = seededRandom(`${familyKey}:${variantKey}:${seed}`);
  const base = pick(
    HANDED_SHAPES.filter((shape) => shape.cells.length === 5),
    random,
  );
  const colour = pick(SHAPE_COLOURS, random);
  // Two candidates of one kind never show the same turn: they would be one
  // drawing twice.
  const plans: Record<
    string,
    {
      kinds: Kind[];
      answer: Kind;
      prompt: string;
      why: string;
      concept: string;
    }
  > = {
    'which-same': {
      kinds: ['turned', 'flipped', 'other'],
      answer: 'turned',
      prompt: 'أي شكل هو نفس الأصل بعد ما ندوّره؟',
      why: 'It is the mirror image of the original, or another shape of the same size: no turn makes it the original.',
      concept:
        'Turn a shape in the mind and find it among a mirror image and a look-alike.',
    },
    'which-different': {
      kinds: ['turned', 'turned', 'other'],
      answer: 'other',
      prompt: 'شكل واحد مو نفس الأصل مهما دوّرته. أي واحد؟',
      why: 'It is the original, only turned.',
      concept:
        'Turn a shape in the mind and find the one candidate that is a different shape.',
    },
    'which-mirrored': {
      kinds: ['turned', 'turned', 'flipped'],
      answer: 'flipped',
      prompt: 'شكل واحد معكوس مثل ما يبان في المراية. أي واحد؟',
      why: 'It is the original, only turned; nothing in it is flipped.',
      concept:
        'Tell a turned shape from a mirrored one: find the one mirror image.',
    },
    'which-turned-only': {
      kinds: ['turned', 'flipped', 'flipped'],
      answer: 'turned',
      prompt: 'شكل واحد بس توصله بتدوير الأصل من غير ما تقلبه. أي واحد؟',
      why: 'It is the mirror image of the original, turned: reaching it needs a flip.',
      concept:
        'Tell a turned shape from a mirrored one: find the one that needs no flip.',
    },
  };
  const plan = plans[variantKey];
  const drawn = new Set<string>();
  const candidates = shuffled(
    plan.kinds.map((kind) => {
      // The first turn that gives a drawing not already among the three: a
      // shape that looks the same upside down has fewer to offer.
      const fresh = [...shuffled([1, 2, 3], random), 0]
        .map((turns) => candidateOf(kind, base, random, turns))
        .find((candidate) => !drawn.has(JSON.stringify(candidate.cells)))!;
      drawn.add(JSON.stringify(fresh.cells));
      return fresh;
    }),
    random,
  );
  const answer = candidates.findIndex(
    (candidate) => candidate.kind === plan.answer,
  );
  const { options, correctOptionId } = asOptions(
    [0, 1, 2].map(shapeLabel),
    shapeLabel(answer),
    random,
  );
  return {
    familyKey,
    variantKey,
    variant: `${variantKey}:${base.key}:${candidates.map((candidate) => candidate.kind).join(',')}`,
    prompt: plan.prompt,
    options,
    correctOptionId,
    distractorRationale: sameReason(options, correctOptionId, plan.why),
    altText: 'شكل من مربعات اسمه «الأصل»، وجنبه ثلاثة أشكال بحروف',
    concept: plan.concept,
    factualClaim: `Candidates ${candidates.map((candidate, index) => `${LETTERS[index]}=${candidate.kind}`).join(', ')} relative to shape "${base.key}".`,
    svg: frame(
      panel(
        'الأصل',
        `<g data-original="${base.key}">${shapeSvg(base.cells, 195, CARDS.y + CARDS.height / 2, 62, colour)}</g>`,
      ) +
        candidateCards(
          (index, cx, cy) =>
            `<g data-kind="${candidates[index].kind}" data-cells='${JSON.stringify(candidates[index].cells)}'>${shapeSvg(candidates[index].cells, cx, cy, 52, colour)}</g>`,
        ),
    ),
  };
}

// ---------------------------------------------------------------------------
// القطعة الناقصة
// ---------------------------------------------------------------------------

function composeMissingPiece(
  seed: string,
  variantKey: string,
): ComposedPuzzleDrawing {
  const random = seededRandom(`missing-puzzle-piece:${variantKey}:${seed}`);
  const base = pick(
    HANDED_SHAPES.filter((shape) => shape.cells.length === 5),
    random,
  );
  const colour = pick(SHAPE_COLOURS, random);
  // The hole: the shape in a turn that fits a 4×4 board, somewhere on it.
  const board = 4;
  const hole = pick(
    [0, 1, 2, 3]
      .map((turns) => turned(base.cells, turns))
      .filter((cells) =>
        cells.every((cell) => cell[0] < board && cell[1] < board),
      ),
    random,
  );
  const spanX = Math.max(...hole.map((cell) => cell[0])) + 1;
  const spanY = Math.max(...hole.map((cell) => cell[1])) + 1;
  const offsetX = Math.floor(random() * (board - spanX + 1));
  const offsetY = Math.floor(random() * (board - spanY + 1));
  const missing = new Set(
    hole.map((cell) => `${cell[0] + offsetX},${cell[1] + offsetY}`),
  );
  const unit = 68;
  const left = 195 - (board * unit) / 2;
  const top = CARDS.y + CARDS.height / 2 - (board * unit) / 2;
  let boardSvg = '';
  for (let y = 0; y < board; y += 1) {
    for (let x = 0; x < board; x += 1) {
      if (missing.has(`${x},${y}`)) continue;
      boardSvg += `<rect x="${left + x * unit}" y="${top + y * unit}" width="${unit}" height="${unit}" fill="${colour}" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>`;
    }
  }
  const spin = variantKey === 'fits-turned';
  const turns = () => (spin ? 1 + Math.floor(random() * 3) : 0);
  const others = HANDED_SHAPES.filter(
    (shape) => shape.key !== base.key && shape.cells.length === 5,
  );
  const candidates = shuffled<Candidate>(
    [
      { kind: 'turned', cells: turned(hole, turns()) },
      { kind: 'flipped', cells: turned(mirrored(hole), turns()) },
      { kind: 'other', cells: turned(pick(others, random).cells, turns()) },
    ],
    random,
  );
  const answer = candidates.findIndex(
    (candidate) => candidate.kind === 'turned',
  );
  const { options, correctOptionId } = asOptions(
    [0, 1, 2].map((index) => `القطعة ${LETTERS[index]}`),
    `القطعة ${LETTERS[answer]}`,
    random,
  );
  return {
    familyKey: 'missing-puzzle-piece',
    variantKey,
    variant: `${variantKey}:${base.key}:${candidates.map((candidate) => candidate.kind).join(',')}`,
    prompt: spin
      ? 'أي قطعة تسدّ الفراغ؟ تقدر تدوّرها، بس ما تقلبها.'
      : 'أي قطعة تسدّ الفراغ زي ما هي، من غير تدوير؟',
    options,
    correctOptionId,
    distractorRationale: sameReason(
      options,
      correctOptionId,
      'It has the right number of squares, but it is the mirror image of the gap or another shape: no turn makes it fit.',
    ),
    altText: 'لوحة مربعات فيها فراغ، وجنبها ثلاث قطع بحروف',
    concept:
      'Match the gap in a board to the one piece with its exact shape, not its mirror image.',
    factualClaim: `The gap is shape "${base.key}"; candidates ${candidates.map((candidate, index) => `${LETTERS[index]}=${candidate.kind}`).join(', ')}.`,
    svg: frame(
      panel('اللوحة', `<g data-gap='${JSON.stringify(hole)}'>${boardSvg}</g>`) +
        candidateCards(
          (index, cx, cy) =>
            `<g data-kind="${candidates[index].kind}" data-cells='${JSON.stringify(candidates[index].cells)}'>${shapeSvg(candidates[index].cells, cx, cy, 52, colour)}</g>`,
        ),
    ),
  };
}

// ---------------------------------------------------------------------------
// أي شبكة تنطوي مكعب
// ---------------------------------------------------------------------------

/** Whether six squares fold into a cube: every face must land on its own side. */
export const foldsIntoCube = (cells: Shape): boolean =>
  cells.length === 6 &&
  new Set(cubeNetNormals(cells).map((normal) => normal.join())).size === 6;

/** Six squares that look like nets and are not. */
export const FALSE_NETS: ReadonlyArray<{ key: string; cells: Shape }> = (
  [
    {
      key: 'row-of-six',
      cells: [
        [0, 0],
        [1, 0],
        [2, 0],
        [3, 0],
        [4, 0],
        [5, 0],
      ],
    },
    {
      key: 'five-and-one',
      cells: [
        [0, 0],
        [1, 0],
        [2, 0],
        [3, 0],
        [4, 0],
        [4, 1],
      ],
    },
    {
      key: 'two-by-three',
      cells: [
        [0, 0],
        [1, 0],
        [2, 0],
        [0, 1],
        [1, 1],
        [2, 1],
      ],
    },
    {
      key: 'long-u',
      cells: [
        [0, 0],
        [3, 0],
        [0, 1],
        [1, 1],
        [2, 1],
        [3, 1],
      ],
    },
    {
      key: 'hook',
      cells: [
        [0, 0],
        [1, 0],
        [2, 0],
        [2, 1],
        [2, 2],
        [1, 2],
      ],
    },
    {
      key: 'one-and-five',
      cells: [
        [0, 0],
        [0, 1],
        [1, 1],
        [2, 1],
        [3, 1],
        [4, 1],
      ],
    },
    {
      key: 'square-and-tail',
      cells: [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
        [2, 1],
        [3, 1],
      ],
    },
  ] as Array<{ key: string; cells: Shape }>
).filter((net) => !foldsIntoCube(net.cells));

function netSvg(cells: Shape, cx: number, cy: number): string {
  const net = normalised(cells);
  const columns = Math.max(...net.map((cell) => cell[0])) + 1;
  const rows = Math.max(...net.map((cell) => cell[1])) + 1;
  const unit = Math.min(64, Math.floor(264 / columns), Math.floor(300 / rows));
  return shapeSvg(net, cx, cy, unit, '#FFFFFF');
}

function composeNetFold(
  seed: string,
  variantKey: string,
): ComposedPuzzleDrawing {
  const random = seededRandom(`cube-net-fold:${variantKey}:${seed}`);
  const wantFalse = variantKey === 'does-not-fold';
  const real = shuffled(CUBE_NETS, random).slice(0, wantFalse ? 2 : 1);
  const fake = shuffled(FALSE_NETS, random).slice(0, wantFalse ? 1 : 2);
  // Any net may be shown turned or flipped: it folds, or fails to, all the same.
  const show = (cells: Shape) =>
    turned(random() < 0.5 ? cells : mirrored(cells), Math.floor(random() * 4));
  const candidates = shuffled(
    [
      ...real.map((net) => ({
        key: net.key,
        folds: true,
        cells: show(net.cells),
      })),
      ...fake.map((net) => ({
        key: net.key,
        folds: false,
        cells: show(net.cells),
      })),
    ],
    random,
  );
  const answer = candidates.findIndex(
    (candidate) => candidate.folds !== wantFalse,
  );
  const { options, correctOptionId } = asOptions(
    [0, 1, 2].map(shapeLabel),
    shapeLabel(answer),
    random,
  );
  const xs = [70, 440, 810];
  return {
    familyKey: 'cube-net-fold',
    variantKey,
    variant: `${variantKey}:${candidates.map((candidate) => candidate.key).join(',')}`,
    prompt: wantFalse
      ? 'شكل واحد من هذي ما ينطوي ويصير مكعب. أي واحد؟'
      : 'أي شكل لو طويناه يصير مكعب مقفّل؟',
    options,
    correctOptionId,
    distractorRationale: sameReason(
      options,
      correctOptionId,
      wantFalse
        ? 'Folded, each of its six squares lands on a side of its own: it closes into a cube.'
        : 'Folded, two of its squares land on the same side and one side stays open.',
    ),
    altText: 'ثلاثة أشكال بحروف، كل واحد من ستة مربعات',
    concept:
      'Fold six joined squares in the mind: tell the shapes that close into a cube from the ones that cannot.',
    factualClaim: `Candidates ${candidates.map((candidate, index) => `${LETTERS[index]}=${candidate.key} (${candidate.folds ? 'folds' : 'does not fold'})`).join(', ')}.`,
    svg: frame(
      candidates
        .map(
          (candidate, index) =>
            `<g data-candidate="${LETTERS[index]}" data-folds="${candidate.folds}" data-cells='${JSON.stringify(candidate.cells)}'>` +
            `<rect x="${xs[index]}" y="150" width="320" height="400" rx="28" fill="${'#F2E3BD'}" stroke="${INK}" stroke-width="10"/>` +
            netSvg(candidate.cells, xs[index] + 160, 350) +
            `${letterBadge(LETTERS[index], xs[index] + 160, 98, 36)}</g>`,
        )
        .join(''),
    ),
  };
}

// ---------------------------------------------------------------------------
// المكعبات
// ---------------------------------------------------------------------------

/**
 * A stack as the height of each column, `heights[x][y]`, on a 3×3 floor. It
 * never rises toward the viewer, so the top of every column can be seen and
 * the whole stack is known from the picture.
 */
export type Stack = number[][];

export function buildStack(random: () => number): Stack {
  for (;;) {
    const heights: Stack = [];
    for (let x = 0; x < 3; x += 1) {
      heights.push([]);
      for (let y = 0; y < 3; y += 1) {
        const ceiling = Math.min(
          x > 0 ? heights[x - 1][y] : 3,
          y > 0 ? heights[x][y - 1] : 3,
        );
        // Mostly a step down or level with what is behind it, so the stack
        // reads as steps rather than as one wall.
        const drop = pick([0, 0, 1, 1, 2], random);
        heights[x].push(
          x === 0 && y === 0
            ? pick([2, 3, 3], random)
            : Math.max(0, ceiling - drop),
        );
      }
    }
    const total = stackCubes(heights);
    if (total >= 7 && total <= 16 && stackTopView(heights) >= 5) {
      return heights;
    }
  }
}

export const stackCubes = (stack: Stack): number =>
  stack.flat().reduce((sum, height) => sum + height, 0);

/** Squares seen from straight above: one for every column that has a cube. */
export const stackTopView = (stack: Stack): number =>
  stack.flat().filter((height) => height > 0).length;

/** Squares seen from the front: each row across shows its tallest column. */
export const stackFrontView = (stack: Stack): number =>
  stack.reduce((sum, column) => sum + Math.max(...column), 0);

export const stackTopLayer = (stack: Stack): number => {
  const tallest = Math.max(...stack.flat());
  return stack.flat().filter((height) => height === tallest).length;
};

export function stackSvg(stack: Stack, frontArrow = false): string {
  const size = 92;
  const cx = W / 2 + (frontArrow ? 60 : 0);
  const cy = 300;
  const at = (x: number, y: number, z: number) => ({
    x: cx + (x - y) * size * 0.866,
    y: cy + (x + y) * size * 0.5 - z * size,
  });
  const face = (points: Array<{ x: number; y: number }>, fill: string) =>
    `<polygon points="${points.map((point) => `${round(point.x)},${round(point.y)}`).join(' ')}" fill="${fill}" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>`;
  let body = '';
  // Back to front, bottom to top: nearer cubes are drawn over farther ones.
  for (let depth = 0; depth <= 4; depth += 1) {
    for (let x = 0; x < 3; x += 1) {
      const y = depth - x;
      if (y < 0 || y > 2) continue;
      for (let z = 0; z < stack[x][y]; z += 1) {
        body +=
          `<g data-cube="${x},${y},${z}">` +
          face(
            [
              at(x, y + 1, z),
              at(x + 1, y + 1, z),
              at(x + 1, y + 1, z + 1),
              at(x, y + 1, z + 1),
            ],
            '#E0A21C',
          ) +
          face(
            [
              at(x + 1, y, z),
              at(x + 1, y + 1, z),
              at(x + 1, y + 1, z + 1),
              at(x + 1, y, z + 1),
            ],
            '#C4830F',
          ) +
          face(
            [
              at(x, y, z + 1),
              at(x + 1, y, z + 1),
              at(x + 1, y + 1, z + 1),
              at(x, y + 1, z + 1),
            ],
            '#F6CF4A',
          ) +
          `</g>`;
      }
    }
  }
  if (frontArrow) {
    // "From the front" is from the left-hand side of the picture.
    const tip = at(0.6, 4.1, 0.4);
    const tail = at(0.6, 5.6, 0.4);
    body +=
      `<g data-front="1"><line x1="${round(tail.x)}" y1="${round(tail.y)}" x2="${round(tip.x)}" y2="${round(tip.y)}" stroke="${RED}" stroke-width="14" stroke-linecap="round"/>` +
      `<polygon points="${round(tip.x + 26)},${round(tip.y - 15)} ${round(tip.x - 2)},${round(tip.y + 30)} ${round(tip.x - 24)},${round(tip.y - 8)}" fill="${RED}"/>` +
      `<text x="${round(tail.x - 10)}" y="${round(tail.y + 58)}" text-anchor="middle" font-family="${PUZZLE_FONT_FAMILY}" font-weight="700" font-size="46" fill="${INK}">قدّام</text></g>`;
  }
  return frame(body);
}

function composeStack(
  familyKey: 'spatial-cube-count' | 'orthographic-projection',
  seed: string,
  variantKey: string,
): ComposedPuzzleDrawing {
  const random = seededRandom(`${familyKey}:${variantKey}:${seed}`);
  const stack = buildStack(random);
  const plans: Record<
    string,
    { answer: number; prompt: string; why: string; concept: string }
  > = {
    'count-all': {
      answer: stackCubes(stack),
      prompt: 'كم مكعب في الشكل كله، مع اللي ما تشوفها؟ (ما في مكعب طاير)',
      why: 'Counts only the cubes with a face showing, or counts a hidden one twice: every cube rests on one below it.',
      concept:
        'Count every cube in a stack, the hidden ones under and behind included.',
    },
    'count-top-layer': {
      answer: stackTopLayer(stack),
      prompt: 'كم مكعب واصل لأعلى ارتفاع في الشكل؟',
      why: 'Takes a column one cube shorter for the tallest, or misses one at the back.',
      concept: 'Find the highest level of a stack and count the cubes on it.',
    },
    'top-view': {
      answer: stackTopView(stack),
      prompt: 'لو تشوف الشكل من فوق بالضبط، كم مربع تشوف؟',
      why: 'From above a column shows one square whatever its height; this counts cubes, or misses a low column.',
      concept:
        'Picture a stack from straight above: one square for every column.',
    },
    'front-view': {
      answer: stackFrontView(stack),
      prompt: 'لو تشوف الشكل من قدّام (من جهة السهم)، كم مربع تشوف؟',
      why: 'From the front a low column hides behind a taller one in its row; this counts it as well, or misses a row.',
      concept:
        'Picture a stack from the front: each row shows only its tallest column.',
    },
  };
  const plan = plans[variantKey];
  const { options, correctOptionId } = countOptions(plan.answer, random);
  return {
    familyKey,
    variantKey,
    variant: `${variantKey}:${stack.map((column) => column.join('')).join('-')}:${plan.answer}`,
    prompt: plan.prompt,
    options,
    correctOptionId,
    distractorRationale: sameReason(options, correctOptionId, plan.why),
    altText: 'مكعبات مرصوصة فوق بعض على أرضية ثلاثة في ثلاثة',
    concept: plan.concept,
    factualClaim: `Column heights ${JSON.stringify(stack)} give ${plan.answer}.`,
    svg: stackSvg(stack, variantKey === 'front-view'),
  };
}

export function composeAssembly(
  familyKey: AssemblyFamily,
  seed: string,
  variantKey: string,
): ComposedPuzzleDrawing {
  if (
    familyKey === 'mental-rotation-2d' ||
    familyKey === 'mirror-vs-rotation-discrim'
  ) {
    return composeTurning(familyKey, seed, variantKey);
  }
  if (familyKey === 'missing-puzzle-piece') {
    return composeMissingPiece(seed, variantKey);
  }
  if (familyKey === 'cube-net-fold') return composeNetFold(seed, variantKey);
  return composeStack(familyKey, seed, variantKey);
}
