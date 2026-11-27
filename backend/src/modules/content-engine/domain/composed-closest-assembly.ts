import {
  INK,
  PUZZLE_FONT_FAMILY,
  W,
  frame,
  round,
  seededRandom,
  shuffled,
} from './composed-kit';
import { ClosestSlider, dealt, placeable } from './composed-closest-paths';

/**
 * مين أقرب in «التدوير والتركيب»: five families the engine draws and solves
 * from the drawing — pieces counted by building the shape out of them, a
 * turn measured in the degrees it was drawn at, cuts counted from where the
 * lines cross, a fold found at the midpoint, a plank balanced on its moments.
 *
 * Two of them answer with a place on a bare line (`between-anchors`), kept
 * out of the middle fifth the screen refuses and off both ends a team wins
 * by dragging.
 */
export const ASSEMBLY_CLOSEST_VARIANTS = {
  'tiles-to-cover': [
    'domino',
    'straight-three',
    'corner-three',
    'square-four',
    'bend-four',
    'tee-four',
  ],
  'rotation-degrees': [
    'small',
    'quarter',
    'half',
    'past-half',
    'large',
    'fine',
  ],
  'cut-pieces': [
    'two-cuts',
    'three-cuts',
    'four-cuts',
    'five-cuts',
    'parallel',
    'fan',
  ],
  'fold-line': ['narrow', 'wide', 'near', 'far', 'left-heavy', 'right-heavy'],
  'balance-point': [
    'two-equal',
    'heavy-left',
    'heavy-right',
    'three-weights',
    'big-and-small',
    'far-apart',
  ],
} as const;

export type AssemblyClosestFamily = keyof typeof ASSEMBLY_CLOSEST_VARIANTS;

export const isAssemblyClosestFamily = (
  familyKey: string | null | undefined,
): familyKey is AssemblyClosestFamily =>
  Object.prototype.hasOwnProperty.call(
    ASSEMBLY_CLOSEST_VARIANTS,
    familyKey ?? '',
  );

export interface AssemblyReading {
  familyKey: AssemblyClosestFamily;
  variantKey: string;
  variant: string;
  value: number;
  prompt: string;
  slider: ClosestSlider;
  altText: string;
  concept: string;
  strategy: string;
  domainDescription: string;
  factualClaim: string;
  svg: string;
}

const BLUE = '#2F6FE0';
const RED = '#D8493F';
const GOLD = '#E8B33A';
const GREY = '#6B6558';
const RULE = '#D8D2C4';
const PALE = '#DDF1FB';

const text = (
  value: string,
  x: number,
  y: number,
  size: number,
  fill = INK,
): string =>
  `<text x="${round(x)}" y="${round(y)}" text-anchor="middle" font-family="${PUZZLE_FONT_FAMILY}" font-weight="700" font-size="${size}" fill="${fill}">${value}</text>`;

const LANE = { x0: 110, x1: 1090 };
const laneStrip = (cells: number, y: number) => {
  const cw = (LANE.x1 - LANE.x0) / cells;
  let body = `<rect x="${LANE.x0}" y="${round(y - 36)}" width="${round(LANE.x1 - LANE.x0)}" height="72" rx="10" fill="#FFFFFF" stroke="${INK}" stroke-width="6"/>`;
  for (let i = 1; i < cells; i += 1)
    body += `<line x1="${round(LANE.x0 + i * cw)}" y1="${round(y - 36)}" x2="${round(LANE.x0 + i * cw)}" y2="${round(y + 36)}" stroke="${RULE}" stroke-width="3"/>`;
  return { body, at: (i: number) => LANE.x0 + i * cw };
};

// ---------------------------------------------------------------------------
// «كم قطعة تغطي الشكل؟» — the shape is built out of the piece, so it fits
// ---------------------------------------------------------------------------

type Cell = [number, number];

export const TILE_SHAPES: Record<string, Cell[]> = {
  domino: [
    [0, 0],
    [1, 0],
  ],
  'straight-three': [
    [0, 0],
    [1, 0],
    [2, 0],
  ],
  'corner-three': [
    [0, 0],
    [1, 0],
    [0, 1],
  ],
  'square-four': [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ],
  'bend-four': [
    [0, 0],
    [0, 1],
    [0, 2],
    [1, 2],
  ],
  'tee-four': [
    [0, 0],
    [1, 0],
    [2, 0],
    [1, 1],
  ],
};

const TILE_COUNTS: Record<string, number[]> = {
  domino: [6, 7, 8, 9, 10, 11],
  'straight-three': [5, 6, 7, 8, 9],
  'corner-three': [5, 6, 7, 8, 9],
  'square-four': [4, 5, 6, 7, 8],
  'bend-four': [4, 5, 6, 7, 8],
  'tee-four': [4, 5, 6, 7, 8],
};

/** The piece turned a quarter at a time, pulled back to the origin. */
export const turned = (cells: readonly Cell[], times: number): Cell[] => {
  let out: Cell[] = cells.map(([x, y]) => [x, y]);
  for (let i = 0; i < times; i += 1) out = out.map(([x, y]) => [-y, x] as Cell);
  const mx = Math.min(...out.map((cell) => cell[0]));
  const my = Math.min(...out.map((cell) => cell[1]));
  return out.map(([x, y]) => [x - mx, y - my] as Cell);
};

/**
 * A shape laid out of `want` copies of one piece. Built by laying the pieces
 * themselves, so the answer is the number laid and the shape is always one
 * the piece really covers.
 */
export function layout(
  shapeKey: string,
  want: number,
  random: () => number,
): Set<string> {
  const cols = 9;
  const rows = 7;
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const taken = new Set<string>();
    const frontier: Cell[] = [[4, 3]];
    let placed = 0;
    while (placed < want && frontier.length) {
      const [fx, fy] = frontier.splice(
        Math.floor(random() * frontier.length),
        1,
      )[0];
      if (taken.has(`${fx},${fy}`)) continue;
      let laid = false;
      for (const form of shuffled([0, 1, 2, 3], random).map((t) =>
        turned(TILE_SHAPES[shapeKey], t),
      )) {
        for (const [ax, ay] of shuffled(form, random)) {
          const cells = form.map(
            ([x, y]) => [fx + x - ax, fy + y - ay] as Cell,
          );
          if (
            cells.some(
              ([x, y]) =>
                x < 0 ||
                y < 0 ||
                x >= cols ||
                y >= rows ||
                taken.has(`${x},${y}`),
            )
          )
            continue;
          for (const [x, y] of cells) {
            taken.add(`${x},${y}`);
            for (const [dx, dy] of [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ]) {
              const nx = x + dx;
              const ny = y + dy;
              if (
                nx >= 0 &&
                ny >= 0 &&
                nx < cols &&
                ny < rows &&
                !taken.has(`${nx},${ny}`)
              )
                frontier.push([nx, ny]);
            }
          }
          placed += 1;
          laid = true;
          break;
        }
        if (laid) break;
      }
      // A spot the piece will not fit is one spot, not the end of the
      // attempt: the next spot on the frontier may still take it.
      void laid;
    }
    if (placed === want) return taken;
  }
  return new Set<string>();
}

function composeTiles(seed: string, variantKey: string): AssemblyReading {
  const random = seededRandom(`tiles-to-cover:${variantKey}:${seed}`);
  const value = dealt(
    seed,
    TILE_COUNTS[variantKey] ?? TILE_COUNTS.domino,
    random,
  );
  const taken = layout(variantKey, value, random);
  const cells = [...taken].map((id) => id.split(',').map(Number) as Cell);
  const minX = Math.min(...cells.map((cell) => cell[0]));
  const maxX = Math.max(...cells.map((cell) => cell[0]));
  const minY = Math.min(...cells.map((cell) => cell[1]));
  const maxY = Math.max(...cells.map((cell) => cell[1]));
  const size = Math.min(
    76,
    Math.floor(620 / (maxX - minX + 1)),
    Math.floor(376 / (maxY - minY + 1)),
  );
  const ox = 330 + (620 - (maxX - minX + 1) * size) / 2 - minX * size;
  const oy = 204 + (376 - (maxY - minY + 1) * size) / 2 - minY * size;
  let body = '';
  let edges = '';
  for (const [x, y] of cells) {
    body += `<rect x="${round(ox + x * size)}" y="${round(oy + y * size)}" width="${size}" height="${size}" fill="${PALE}"/>`;
    const edge = (x1: number, y1: number, x2: number, y2: number) =>
      `<line x1="${round(ox + x1 * size)}" y1="${round(oy + y1 * size)}" x2="${round(ox + x2 * size)}" y2="${round(oy + y2 * size)}" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>`;
    if (!taken.has(`${x},${y - 1}`)) edges += edge(x, y, x + 1, y);
    if (!taken.has(`${x},${y + 1}`)) edges += edge(x, y + 1, x + 1, y + 1);
    if (!taken.has(`${x - 1},${y}`)) edges += edge(x, y, x, y + 1);
    if (!taken.has(`${x + 1},${y}`)) edges += edge(x + 1, y, x + 1, y + 1);
  }
  const pc = 44;
  const px = 96;
  const py = 300;
  let piece = '';
  for (const [x, y] of TILE_SHAPES[variantKey] ?? TILE_SHAPES.domino)
    piece += `<rect x="${round(px + x * pc)}" y="${round(py + y * pc)}" width="${pc}" height="${pc}" fill="${GOLD}" stroke="${INK}" stroke-width="6"/>`;
  return {
    familyKey: 'tiles-to-cover',
    variantKey,
    variant: `${variantKey}:${value}`,
    value,
    prompt: 'كم قطعة من هذي تغطي الشكل بالضبط؟',
    slider: { mode: 'numeric-range', min: 0, max: 20, step: 1, unit: 'قطعة' },
    altText: 'شكل مرسوم وجنبه قطعة وحدة بنفس حجم مربعاته',
    concept:
      'Work out how many copies of one piece tile a drawn shape exactly.',
    strategy:
      'Compare the shape’s squares with the piece’s squares, then split the shape into pieces.',
    domainDescription: 'copies of the piece, 0 to 20',
    factualClaim: `The shape is laid out of ${value} copies of the ${variantKey} piece.`,
    svg: frame(
      text('كم قطعة من هذي تغطي الشكل بالضبط؟', W / 2, 92, 42) +
        body +
        edges +
        piece +
        text('القطعة', px + 46, py + 176, 28, GREY),
    ),
  };
}

// ---------------------------------------------------------------------------
// «كم درجة دارت؟» — the same piece, before and after
// ---------------------------------------------------------------------------

const TURN_ANGLES: Record<string, number[]> = {
  small: [30, 45, 60, 75],
  quarter: [90, 105, 120, 135],
  half: [150, 165, 180, 195, 210],
  'past-half': [225, 240, 255, 270],
  large: [285, 300, 315, 330],
  fine: [105, 135, 165, 240, 300],
};

/** A shape with no symmetry at all, so one turn reads as one angle. */
const PIECE_PATH =
  'M-60,-96 L34,-96 L34,-34 L96,-34 L96,36 L10,36 L10,96 L-60,96 Z';

function composeTurn(seed: string, variantKey: string): AssemblyReading {
  const random = seededRandom(`rotation-degrees:${variantKey}:${seed}`);
  const value = dealt(
    seed,
    TURN_ANGLES[variantKey] ?? TURN_ANGLES.small,
    random,
  );
  const piece = (cx: number, degrees: number, fill: string) =>
    `<g transform="translate(${cx},390) rotate(${degrees}) scale(1.1)">` +
    `<path d="${PIECE_PATH}" fill="${fill}" stroke="${INK}" stroke-width="8" stroke-linejoin="round"/>` +
    `<circle cx="-26" cy="-60" r="15" fill="#FFFFFF" stroke="${INK}" stroke-width="6"/></g>`;
  return {
    familyKey: 'rotation-degrees',
    variantKey,
    variant: `${variantKey}:${value}`,
    value,
    prompt: 'القطعة دارت مع عقارب الساعة. كم درجة دارت؟',
    slider: { mode: 'numeric-range', min: 0, max: 360, step: 15, unit: 'درجة' },
    altText: 'نفس القطعة مرسومة مرتين، وحدة قبل الدوران ووحدة بعده',
    concept:
      'Read how far a piece was turned clockwise between two drawings of it.',
    strategy:
      'Pick one corner of the piece and see how far around it travelled.',
    domainDescription: 'degrees clockwise, 0 to 360',
    factualClaim: `The piece is drawn again at ${value} degrees clockwise.`,
    svg: frame(
      text('القطعة دارت مع عقارب الساعة. كم درجة دارت؟', W / 2, 96, 42) +
        piece(330, 0, PALE) +
        piece(870, value, GOLD) +
        text('قبل', 330, 604, 30, GREY) +
        text('بعد', 870, 604, 30, GREY),
    ),
  };
}

// ---------------------------------------------------------------------------
// «كم قطعة تطلع؟» — straight cuts across a sheet
// ---------------------------------------------------------------------------

type Cut = [number, number, number, number];

const CUT_SETUPS: Record<
  string,
  { lines: number; fan: boolean; parallel: boolean }
> = {
  'two-cuts': { lines: 2, fan: false, parallel: false },
  'three-cuts': { lines: 3, fan: false, parallel: false },
  'four-cuts': { lines: 4, fan: false, parallel: false },
  'five-cuts': { lines: 5, fan: false, parallel: false },
  parallel: { lines: 4, fan: false, parallel: true },
  fan: { lines: 4, fan: true, parallel: false },
};

/** Where two cuts cross, counted only inside the sheet. */
export function crossings(lines: readonly Cut[]): Array<[number, number]> {
  const found: Array<[number, number]> = [];
  for (let i = 0; i < lines.length; i += 1)
    for (let j = i + 1; j < lines.length; j += 1) {
      const [ax, ay, bx, by] = lines[i];
      const [cx, cy, dx, dy] = lines[j];
      const under = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
      if (Math.abs(under) < 1e-9) continue;
      const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / under;
      const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / under;
      if (t > 0.03 && t < 0.97 && u > 0.03 && u < 0.97)
        found.push([ax + t * (bx - ax), ay + t * (by - ay)]);
    }
  return found;
}

/** A cut from one edge of the sheet to another, as fractions of the sheet. */
const edgeCut = (random: () => number, steep: boolean): Cut =>
  steep
    ? [0.12 + random() * 0.76, 0, 0.12 + random() * 0.76, 1]
    : [0, 0.12 + random() * 0.76, 1, 0.12 + random() * 0.76];

function cutSheet(
  setup: { lines: number; fan: boolean; parallel: boolean },
  random: () => number,
): { lines: Cut[]; pieces: number } {
  const howManyParallel = 2 + Math.floor(random() * (setup.lines - 1));
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const lines: Cut[] = [];
    for (let i = 0; i < setup.lines; i += 1) {
      if (setup.parallel) {
        // How many parallel cuts there are is the question: a fixed number
        // of them would always leave the same count of pieces.
        const slide = 0.1 + (i + 0.5) * (0.8 / howManyParallel);
        if (i >= howManyParallel) continue;
        lines.push([
          0,
          slide - 0.06 + random() * 0.12,
          1,
          slide - 0.06 + random() * 0.12,
        ]);
      } else if (setup.fan) {
        // Cuts that all pass near one side, so they cross each other often.
        lines.push([
          0.06 + random() * 0.14,
          0.1 + random() * 0.8,
          0.98,
          0.08 + random() * 0.84,
        ]);
      } else {
        // Each cut leans whichever way the seed says, so two cuts sometimes
        // miss each other and the count is not the number of cuts alone.
        lines.push(edgeCut(random, random() < 0.5));
      }
    }
    const points = crossings(lines);
    // Three cuts through one point would break the count, so keep them apart.
    const apart = points.every((a, i) =>
      points.every(
        (b, j) => i === j || Math.hypot(a[0] - b[0], a[1] - b[1]) > 0.05,
      ),
    );
    if (!apart) continue;
    const pieces = 1 + lines.length + points.length;
    if (pieces >= 3 && pieces <= 19) return { lines, pieces };
  }
  return { lines: [[0, 0.5, 1, 0.5]], pieces: 2 };
}

function composeCuts(seed: string, variantKey: string): AssemblyReading {
  const random = seededRandom(`cut-pieces:${variantKey}:${seed}`);
  const setup = CUT_SETUPS[variantKey] ?? CUT_SETUPS['three-cuts'];
  const { lines, pieces } = cutSheet(setup, random);
  const x0 = 220;
  const y0 = 196;
  const x1 = 980;
  const y1 = 586;
  const at = (fx: number, fy: number): [number, number] => [
    x0 + fx * (x1 - x0),
    y0 + fy * (y1 - y0),
  ];
  let body = `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="14" fill="#FFFFFF" stroke="${INK}" stroke-width="9"/>`;
  for (const [ax, ay, bx, by] of lines) {
    const [sx, sy] = at(ax, ay);
    const [ex, ey] = at(bx, by);
    body += `<line x1="${round(sx)}" y1="${round(sy)}" x2="${round(ex)}" y2="${round(ey)}" stroke="${RED}" stroke-width="7" stroke-dasharray="18 12" stroke-linecap="round"/>`;
  }
  return {
    familyKey: 'cut-pieces',
    variantKey,
    variant: `${variantKey}:${pieces}:${lines.length}`,
    value: pieces,
    prompt: 'لو قصّينا الورقة على كل الخطوط، كم قطعة تطلع؟',
    slider: { mode: 'numeric-range', min: 0, max: 20, step: 1, unit: 'قطعة' },
    altText: 'ورقة مستطيلة وعليها خطوط قص متقطعة',
    concept:
      'Count the pieces a sheet falls into when every drawn cut is made.',
    strategy:
      'Each cut adds a piece, and every place two cuts cross adds one more.',
    domainDescription: 'pieces of the sheet, 0 to 20',
    factualClaim: `${lines.length} cuts crossing ${pieces - 1 - lines.length} times leave ${pieces} pieces.`,
    svg: frame(
      text('لو قصّينا الورقة على كل الخطوط، كم قطعة تطلع؟', W / 2, 96, 42) +
        body,
    ),
  };
}

// ---------------------------------------------------------------------------
// «وين الطية؟» — fold once so two marks meet
// ---------------------------------------------------------------------------

const FOLD_CELLS = 20;
const FOLD_SETUPS: Record<
  string,
  { gap: [number, number]; side: 'any' | 'left' | 'right' }
> = {
  narrow: { gap: [4, 6], side: 'any' },
  wide: { gap: [8, 16], side: 'any' },
  near: { gap: [4, 8], side: 'left' },
  far: { gap: [4, 8], side: 'right' },
  'left-heavy': { gap: [6, 10], side: 'left' },
  'right-heavy': { gap: [6, 10], side: 'right' },
};

export function foldMarks(
  setup: { gap: [number, number]; side: 'any' | 'left' | 'right' },
  random: () => number,
): { a: number; b: number; fold: number } {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const gap =
      setup.gap[0] + Math.floor(random() * (setup.gap[1] - setup.gap[0] + 1));
    if (gap % 2 !== 0) continue;
    const a = 1 + Math.floor(random() * (FOLD_CELLS - gap - 2));
    const b = a + gap;
    const fold = (a + b) / 2;
    if (!placeable(fold, FOLD_CELLS)) continue;
    if (setup.side === 'left' && fold > FOLD_CELLS / 2) continue;
    if (setup.side === 'right' && fold < FOLD_CELLS / 2) continue;
    return { a, b, fold };
  }
  return { a: 2, b: 6, fold: 4 };
}

function composeFold(seed: string, variantKey: string): AssemblyReading {
  const random = seededRandom(`fold-line:${variantKey}:${seed}`);
  const { a, b, fold } = foldMarks(
    FOLD_SETUPS[variantKey] ?? FOLD_SETUPS.narrow,
    random,
  );
  const y = 392;
  const { body, at } = laneStrip(FOLD_CELLS, y);
  const mark = (x: number, fill: string) =>
    `<circle cx="${round(at(x))}" cy="${round(y)}" r="22" fill="${fill}" stroke="#FFFFFF" stroke-width="5"/>`;
  return {
    familyKey: 'fold-line',
    variantKey,
    variant: `${variantKey}:${a}:${b}`,
    value: fold,
    prompt: 'نطوي الورقة مرة وحدة عشان النقطتين تنطبق على بعض. وين الطية؟',
    slider: {
      mode: 'between-anchors',
      min: 0,
      max: FOLD_CELLS,
      step: 1,
      leftAnchor: 'أول الورقة',
      rightAnchor: 'آخر الورقة',
    },
    altText: 'ورقة طويلة مقسّمة مربعات وعليها نقطتين بلونين',
    concept:
      'Find the one fold that brings two marks on a strip onto each other.',
    strategy:
      'The fold sits halfway between the two marks, however far they are from the ends.',
    domainDescription: 'a place along the strip of paper',
    factualClaim: `Marks at ${a} and ${b} meet when the strip is folded at ${fold}.`,
    svg: frame(
      text('نطوي الورقة مرة وحدة عشان النقطتين تنطبق', W / 2, 96, 40) +
        text('وين الطية؟', W / 2, 154, 40) +
        body +
        mark(a, RED) +
        mark(b, BLUE) +
        text('أول الورقة', at(0) + 56, y + 106, 28, GREY) +
        text('آخر الورقة', at(FOLD_CELLS) - 56, y + 106, 28, GREY),
    ),
  };
}

// ---------------------------------------------------------------------------
// «وين يتزن؟» — a plank and the weights on it
// ---------------------------------------------------------------------------

const BALANCE_CELLS = 20;
const BALANCE_SETUPS: Record<string, { howMany: 2 | 3; weights: number[][] }> =
  {
    'two-equal': {
      howMany: 2,
      weights: [
        [1, 1],
        [2, 2],
        [3, 3],
      ],
    },
    'heavy-left': {
      howMany: 2,
      weights: [
        [3, 1],
        [4, 2],
        [5, 1],
        [3, 2],
      ],
    },
    'heavy-right': {
      howMany: 2,
      weights: [
        [1, 3],
        [2, 4],
        [1, 5],
        [2, 3],
      ],
    },
    'three-weights': {
      howMany: 3,
      weights: [
        [1, 1, 2],
        [2, 1, 1],
        [1, 2, 1],
        [2, 2, 1],
      ],
    },
    'big-and-small': {
      howMany: 2,
      weights: [
        [4, 1],
        [1, 4],
        [5, 2],
        [2, 5],
      ],
    },
    'far-apart': {
      howMany: 2,
      weights: [
        [2, 1],
        [1, 2],
        [3, 2],
        [2, 3],
      ],
    },
  };

export function balanced(
  setup: { howMany: 2 | 3; weights: number[][] },
  farApart: boolean,
  random: () => number,
): { spots: number[]; loads: number[]; point: number } {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const loads = setup.weights[Math.floor(random() * setup.weights.length)];
    const spots: number[] = [];
    for (let i = 0; i < setup.howMany; i += 1) {
      const low = farApart && i === 0 ? 1 : 2;
      const high =
        farApart && i === setup.howMany - 1
          ? BALANCE_CELLS - 1
          : BALANCE_CELLS - 2;
      spots.push(low + Math.floor(random() * (high - low + 1)));
    }
    const sorted = [...spots].sort((one, two) => one - two);
    if (sorted.some((spot, i) => i > 0 && spot - sorted[i - 1] < 3)) continue;
    if (farApart && sorted[sorted.length - 1] - sorted[0] < 12) continue;
    const total = loads.reduce((sum, load) => sum + load, 0);
    const moment = sorted.reduce((sum, spot, i) => sum + spot * loads[i], 0);
    if (moment % total !== 0) continue;
    const point = moment / total;
    if (!placeable(point, BALANCE_CELLS)) continue;
    return { spots: sorted, loads, point };
  }
  return { spots: [3, 15], loads: [3, 1], point: 6 };
}

function composeBalance(seed: string, variantKey: string): AssemblyReading {
  const random = seededRandom(`balance-point:${variantKey}:${seed}`);
  const setup = BALANCE_SETUPS[variantKey] ?? BALANCE_SETUPS['two-equal'];
  const { spots, loads, point } = balanced(
    setup,
    variantKey === 'far-apart',
    random,
  );
  const y = 404;
  const { body, at } = laneStrip(BALANCE_CELLS, y);
  let boxes = '';
  spots.forEach((spot, index) => {
    const load = loads[index];
    const size = 48 + load * 11;
    boxes +=
      `<rect x="${round(at(spot) - size / 2)}" y="${round(y - 44 - size)}" width="${size}" height="${size}" rx="10" fill="${GOLD}" stroke="${INK}" stroke-width="6"/>` +
      text(`${load}`, at(spot), y - 54 - size / 2 + 12, 30);
  });
  return {
    familyKey: 'balance-point',
    variantKey,
    variant: `${variantKey}:${spots.join('-')}:${loads.join('-')}`,
    value: point,
    prompt: 'وين نحط المسند عشان اللوح يتزن؟',
    slider: {
      mode: 'between-anchors',
      min: 0,
      max: BALANCE_CELLS,
      step: 1,
      leftAnchor: 'يسار اللوح',
      rightAnchor: 'يمين اللوح',
    },
    altText: 'لوح طويل وعليه صناديق أوزانها مكتوبة',
    concept: 'Place the fulcrum of a loaded plank where the weights balance.',
    strategy:
      'The heavier side pulls the fulcrum toward it, and twice the weight pulls twice as hard.',
    domainDescription: 'a place along the plank',
    factualClaim: `Loads ${loads.join(', ')} at ${spots.join(', ')} balance at ${point}.`,
    svg: frame(
      text('وين نحط المسند عشان اللوح يتزن؟', W / 2, 104, 42) +
        boxes +
        body +
        text('يسار اللوح', at(0) + 58, y + 106, 28, GREY) +
        text('يمين اللوح', at(BALANCE_CELLS) - 58, y + 106, 28, GREY),
    ),
  };
}

export function composeAssemblyClosest(
  familyKey: AssemblyClosestFamily,
  seed: string,
  variantKey?: string,
): AssemblyReading {
  const variants = ASSEMBLY_CLOSEST_VARIANTS[familyKey] as readonly string[];
  const chosen =
    variantKey && variants.includes(variantKey)
      ? variantKey
      : variants[
          Math.floor(
            seededRandom(`${familyKey}:variant:${seed}`)() * variants.length,
          )
        ];
  switch (familyKey) {
    case 'tiles-to-cover':
      return composeTiles(seed, chosen);
    case 'rotation-degrees':
      return composeTurn(seed, chosen);
    case 'cut-pieces':
      return composeCuts(seed, chosen);
    case 'fold-line':
      return composeFold(seed, chosen);
    default:
      return composeBalance(seed, chosen);
  }
}
