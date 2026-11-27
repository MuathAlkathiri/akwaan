import {
  GOLD,
  H,
  INK,
  PUZZLE_FONT_FAMILY,
  RED,
  W,
  frame,
  pick,
  round,
  seededRandom,
} from './composed-kit';
import {
  ASSEMBLY_CLOSEST_VARIANTS,
  AssemblyClosestFamily,
  composeAssemblyClosest,
  isAssemblyClosestFamily,
} from './composed-closest-assembly';
import {
  OBSERVATION_CLOSEST_VARIANTS,
  ObservationClosestFamily,
  composeObservationClosest,
  isObservationClosestFamily,
} from './composed-closest-observation';
import {
  ERROR_CLOSEST_VARIANTS,
  ErrorClosestFamily,
  composeErrorClosest,
  isErrorClosestFamily,
} from './composed-closest-errors';
import {
  ClosestSlider,
  PATH_CLOSEST_VARIANTS,
  PathClosestFamily,
  composePathClosest,
  isPathClosestFamily,
} from './composed-closest-paths';

/**
 * مين أقرب, drawn: a picture whose answer is a number the engine worked out
 * from the drawing itself — steps counted by search, cubes summed, a length
 * or a minute set before anything was drawn. The slider is a numeric range;
 * nearest wins, so the question needs no tolerance.
 */
export const CLOSEST_VARIANTS = {
  ...PATH_CLOSEST_VARIANTS,
  ...ASSEMBLY_CLOSEST_VARIANTS,
  ...OBSERVATION_CLOSEST_VARIANTS,
  ...ERROR_CLOSEST_VARIANTS,
  'key-door-route': ['key-door', 'star-first'],
  'cube-pile-count': ['square', 'long', 'tall'],
  'length-illusion-ratio': ['arrows', 'rails', 'circles'],
  'wrong-clock-minutes': ['ahead', 'behind', 'digital'],
} as const;

export type ClosestFamily = keyof typeof CLOSEST_VARIANTS;

export const COMPOSED_CLOSEST_FAMILIES = Object.keys(
  CLOSEST_VARIANTS,
) as ClosestFamily[];

export const isComposedClosestFamily = (
  familyKey: string | null | undefined,
): familyKey is ClosestFamily =>
  Object.prototype.hasOwnProperty.call(CLOSEST_VARIANTS, familyKey ?? '');

export interface ComposedReading {
  familyKey: ClosestFamily;
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

const GREEN = '#2FA866';
const BLUE = '#2F6FE0';
const BROWN = '#8A5A2B';

const text = (
  value: string,
  x: number,
  y: number,
  size: number,
  fill = INK,
  weight = 700,
): string =>
  `<text x="${round(x)}" y="${round(y)}" text-anchor="middle" font-family="${PUZZLE_FONT_FAMILY}" font-weight="${weight}" font-size="${size}" fill="${fill}">${value}</text>`;

// ---------------------------------------------------------------------------
// «الطريق الوحيد» — fewest steps, with a key before the door or a star first
// ---------------------------------------------------------------------------

type Cell = [number, number];
const COLS = 9;
const ROWS = 5;

interface Board {
  walls: Set<string>;
  start: Cell;
  goal: Cell;
  key?: Cell;
  door?: Cell;
  star?: Cell;
}

const id = ([x, y]: Cell): string => `${x},${y}`;
const same = (a?: Cell, b?: Cell): boolean =>
  Boolean(a && b && a[0] === b[0] && a[1] === b[1]);

/**
 * Fewest steps from start to goal, by breadth-first search over the cell and
 * what has been collected. With `ignoreRule` the door is open and the star
 * not needed: the walk the rule makes longer.
 */
export function fewestSteps(board: Board, ignoreRule = false): number {
  const needs = board.key ? 'key' : board.star ? 'star' : undefined;
  const queue: Array<[number, number, boolean, number]> = [
    [board.start[0], board.start[1], ignoreRule || !needs, 0],
  ];
  const seen = new Set([`${id(board.start)}:${ignoreRule || !needs}`]);
  while (queue.length) {
    const [x, y, held, steps] = queue.shift()!;
    if (x === board.goal[0] && y === board.goal[1] && held) return steps;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const next: Cell = [x + dx, y + dy];
      if (next[0] < 0 || next[1] < 0 || next[0] >= COLS || next[1] >= ROWS) {
        continue;
      }
      if (board.walls.has(id(next))) continue;
      if (!held && same(next, board.door)) continue;
      const now =
        held ||
        (needs === 'key' && same(next, board.key)) ||
        (needs === 'star' && same(next, board.star));
      const state = `${id(next)}:${now}`;
      if (seen.has(state)) continue;
      seen.add(state);
      queue.push([next[0], next[1], now, steps + 1]);
    }
  }
  return -1;
}

function buildBoard(variantKey: string, random: () => number): Board {
  for (;;) {
    const walls = new Set<string>();
    const start: Cell = [0, Math.floor(random() * ROWS)];
    const goal: Cell = [COLS - 1, Math.floor(random() * ROWS)];
    const board: Board = { walls, start, goal };
    const free = (cell: Cell) =>
      !walls.has(id(cell)) &&
      !same(cell, start) &&
      !same(cell, goal) &&
      !same(cell, board.key) &&
      !same(cell, board.door) &&
      !same(cell, board.star);
    if (variantKey === 'key-door') {
      // A wall down the middle with one door in it: the only way across.
      const column = pick([4, 5], random);
      const doorRow = Math.floor(random() * ROWS);
      for (let y = 0; y < ROWS; y += 1) {
        if (y !== doorRow) walls.add(id([column, y]));
      }
      board.door = [column, doorRow];
      board.key = [
        1 + Math.floor(random() * (column - 1)),
        Math.floor(random() * ROWS),
      ];
    } else {
      board.star = [
        2 + Math.floor(random() * (COLS - 4)),
        Math.floor(random() * ROWS),
      ];
    }
    for (let x = 1; x < COLS - 1; x += 1) {
      for (let y = 0; y < ROWS; y += 1) {
        if (free([x, y]) && random() < 0.24) walls.add(id([x, y]));
      }
    }
    const steps = fewestSteps(board);
    const plain = fewestSteps(board, true);
    // The rule must cost something, and the count must stay countable.
    if (steps < 0 || plain < 0) continue;
    if (steps - plain < 4 || steps < 12 || steps > 26) continue;
    return board;
  }
}

const CELL = 90;
const GRID_X = (W - COLS * CELL) / 2;
const GRID_Y = 84;

function keyIcon(cx: number, cy: number, s: number): string {
  return (
    `<g data-icon="key"><circle cx="${round(cx - s * 0.22)}" cy="${round(cy)}" r="${round(s * 0.2)}" fill="none" stroke="${GOLD}" stroke-width="${round(s * 0.11)}"/>` +
    `<path d="M ${round(cx - s * 0.02)} ${round(cy)} h ${round(s * 0.4)} m ${round(-s * 0.12)} 0 v ${round(s * 0.16)} m ${round(-s * 0.12)} ${round(-s * 0.16)} v ${round(s * 0.12)}" stroke="${GOLD}" stroke-width="${round(s * 0.11)}" fill="none" stroke-linecap="round"/></g>`
  );
}

function doorIcon(x: number, y: number, s: number): string {
  return (
    `<g data-icon="door"><rect x="${round(x + s * 0.18)}" y="${round(y + s * 0.08)}" width="${round(s * 0.64)}" height="${round(s * 0.84)}" rx="${round(s * 0.08)}" fill="${BROWN}" stroke="${INK}" stroke-width="5"/>` +
    `<circle cx="${round(x + s * 0.5)}" cy="${round(y + s * 0.46)}" r="${round(s * 0.08)}" fill="${GOLD}"/>` +
    `<rect x="${round(x + s * 0.47)}" y="${round(y + s * 0.5)}" width="${round(s * 0.06)}" height="${round(s * 0.14)}" fill="${GOLD}"/></g>`
  );
}

function starIcon(cx: number, cy: number, r: number): string {
  const points = Array.from({ length: 10 }, (_, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    const radius = index % 2 ? r * 0.45 : r;
    return `${round(cx + radius * Math.cos(angle))},${round(cy + radius * Math.sin(angle))}`;
  }).join(' ');
  return `<polygon data-icon="star" points="${points}" fill="${GOLD}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`;
}

function flagIcon(cx: number, cy: number, s: number): string {
  return (
    `<g data-icon="goal"><line x1="${round(cx - s * 0.18)}" y1="${round(cy - s * 0.34)}" x2="${round(cx - s * 0.18)}" y2="${round(cy + s * 0.36)}" stroke="${INK}" stroke-width="6" stroke-linecap="round"/>` +
    `<path d="M ${round(cx - s * 0.18)} ${round(cy - s * 0.34)} l ${round(s * 0.46)} ${round(s * 0.14)} l ${round(-s * 0.46)} ${round(s * 0.16)} z" fill="${RED}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/></g>`
  );
}

const startIcon = (cx: number, cy: number, s: number): string =>
  `<circle data-icon="start" cx="${round(cx)}" cy="${round(cy)}" r="${round(s * 0.3)}" fill="${GREEN}" stroke="${INK}" stroke-width="5"/>`;

export function boardSvg(board: Board): string {
  let body = '';
  for (let x = 0; x < COLS; x += 1) {
    for (let y = 0; y < ROWS; y += 1) {
      // Drawn right to left like the page: column 0 is on the right.
      const left = GRID_X + (COLS - 1 - x) * CELL;
      const top = GRID_Y + y * CELL;
      const wall = board.walls.has(id([x, y]));
      body += `<rect data-cell="${x},${y}"${wall ? ' data-wall="1"' : ''} x="${left + 3}" y="${top + 3}" width="${CELL - 6}" height="${CELL - 6}" rx="12" fill="${wall ? INK : '#FFFFFF'}" stroke="${wall ? INK : '#C9C2B4'}" stroke-width="3"/>`;
    }
  }
  const at = ([x, y]: Cell) => ({
    x: GRID_X + (COLS - 1 - x) * CELL,
    y: GRID_Y + y * CELL,
  });
  const centre = (cell: Cell) => ({
    x: at(cell).x + CELL / 2,
    y: at(cell).y + CELL / 2,
  });
  body += startIcon(centre(board.start).x, centre(board.start).y, CELL);
  body += flagIcon(centre(board.goal).x, centre(board.goal).y, CELL);
  if (board.key)
    body += keyIcon(centre(board.key).x, centre(board.key).y, CELL);
  if (board.door) body += doorIcon(at(board.door).x, at(board.door).y, CELL);
  if (board.star) {
    body += starIcon(centre(board.star).x, centre(board.star).y, CELL * 0.36);
  }
  // The key of the drawing, under the grid, right to left.
  const legend: Array<[string, (cx: number, cy: number) => string]> = [
    ['البداية', (cx, cy) => startIcon(cx, cy, 70)],
    ...(board.key
      ? ([
          ['المفتاح', (cx: number, cy: number) => keyIcon(cx, cy, 70)],
          ['الباب', (cx: number, cy: number) => doorIcon(cx - 35, cy - 35, 70)],
        ] as Array<[string, (cx: number, cy: number) => string]>)
      : ([
          ['النجمة', (cx: number, cy: number) => starIcon(cx, cy, 26)],
        ] as Array<[string, (cx: number, cy: number) => string]>)),
    ['النهاية', (cx, cy) => flagIcon(cx, cy, 70)],
  ];
  const slot = 230;
  const y = GRID_Y + ROWS * CELL + 58;
  legend.forEach(([label, icon], index) => {
    const right = (W + legend.length * slot) / 2 - index * slot;
    body += icon(right - 40, y) + text(label, right - 130, y + 13, 30);
  });
  return frame(body);
}

function composeKeyDoor(seed: string, variantKey: string): ComposedReading {
  const random = seededRandom(`key-door-route:${variantKey}:${seed}`);
  const board = buildBoard(variantKey, random);
  const value = fewestSteps(board);
  const keyed = variantKey === 'key-door';
  return {
    familyKey: 'key-door-route',
    variantKey,
    variant: `${variantKey}:${value}`,
    value,
    prompt: keyed
      ? 'أقل عدد خطوات من البداية للنهاية، والباب ما ينفتح إلا بالمفتاح. كم خطوة؟'
      : 'أقل عدد خطوات من البداية للنهاية، ولازم تمر على النجمة. كم خطوة؟',
    slider: { mode: 'numeric-range', min: 0, max: 40, step: 1, unit: 'خطوة' },
    altText: keyed
      ? 'شبكة مربعات فيها جدران وبداية ونهاية ومفتاح وباب'
      : 'شبكة مربعات فيها جدران وبداية ونهاية ونجمة',
    concept:
      'Plan the shortest walk on a grid under one rule and count its steps.',
    strategy:
      'Walk the shortest way to the key (or star), then the shortest way on to the goal, and count the squares stepped on.',
    domainDescription: 'steps on a grid, one square at a time, no diagonals',
    factualClaim: `Shortest walk under the rule: ${value} steps (without the rule: ${fewestSteps(board, true)}).`,
    svg: boardSvg(board),
  };
}

// ---------------------------------------------------------------------------
// «كم مكعب في الكومة؟»
// ---------------------------------------------------------------------------

type Heights = number[][];

/**
 * Heights that never rise toward the viewer, so the top of every column is
 * in sight and the count is the sum. Cubes under others are there: nothing
 * floats.
 */
function buildPile(
  nx: number,
  ny: number,
  tallest: number,
  random: () => number,
): Heights {
  for (;;) {
    const heights: Heights = [];
    for (let x = 0; x < nx; x += 1) {
      heights.push([]);
      for (let y = 0; y < ny; y += 1) {
        const ceiling = Math.min(
          x > 0 ? heights[x - 1][y] : tallest,
          y > 0 ? heights[x][y - 1] : tallest,
        );
        const drop =
          x === 0 && y === 0
            ? pick([0, 0, 1], random)
            : pick([0, 0, 1, 1, 2], random);
        heights[x].push(Math.max(0, ceiling - drop));
      }
    }
    const total = heights.flat().reduce((sum, h) => sum + h, 0);
    if (total >= 14 && total <= 42 && heights[0][0] >= tallest - 1) {
      return heights;
    }
  }
}

export const pileCount = (heights: Heights): number =>
  heights.flat().reduce((sum, h) => sum + h, 0);

export function pileSvg(heights: Heights): string {
  const nx = heights.length;
  const ny = heights[0].length;
  const tallest = Math.max(...heights.flat());
  const size = Math.min(
    84,
    Math.floor(560 / ((nx + ny) * 0.5 + tallest)),
    Math.floor(1000 / ((nx + ny) * 0.866)),
  );
  const spanY = ((nx + ny) * 0.5 + tallest) * size;
  const cx = W / 2 + ((ny - nx) * size * 0.866) / 2;
  const cy = (H - spanY) / 2 + tallest * size;
  const at = (x: number, y: number, z: number) => ({
    x: cx + (x - y) * size * 0.866,
    y: cy + (x + y) * size * 0.5 - z * size,
  });
  const face = (points: Array<{ x: number; y: number }>, fill: string) =>
    `<polygon points="${points.map((p) => `${round(p.x)},${round(p.y)}`).join(' ')}" fill="${fill}" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`;
  let body = '';
  for (let depth = 0; depth <= nx + ny - 2; depth += 1) {
    for (let x = 0; x < nx; x += 1) {
      const y = depth - x;
      if (y < 0 || y >= ny) continue;
      for (let z = 0; z < heights[x][y]; z += 1) {
        const top = [
          at(x, y, z + 1),
          at(x + 1, y, z + 1),
          at(x + 1, y + 1, z + 1),
          at(x, y + 1, z + 1),
        ];
        const left = [
          at(x, y + 1, z + 1),
          at(x + 1, y + 1, z + 1),
          at(x + 1, y + 1, z),
          at(x, y + 1, z),
        ];
        const right = [
          at(x + 1, y, z + 1),
          at(x + 1, y + 1, z + 1),
          at(x + 1, y + 1, z),
          at(x + 1, y, z),
        ];
        body +=
          `<g data-cube="${x},${y},${z}">` +
          face(top, '#F4D58A') +
          face(left, '#E8B33A') +
          face(right, '#C98F1C') +
          `</g>`;
      }
    }
  }
  return frame(body);
}

function composeCubePile(seed: string, variantKey: string): ComposedReading {
  const random = seededRandom(`cube-pile-count:${variantKey}:${seed}`);
  const [nx, ny, tallest] =
    variantKey === 'long'
      ? [5, 3, 4]
      : variantKey === 'tall'
        ? [3, 3, 5]
        : [4, 4, 4];
  const heights = buildPile(nx, ny, tallest, random);
  const value = pileCount(heights);
  return {
    familyKey: 'cube-pile-count',
    variantKey,
    variant: `${variantKey}:${heights.map((row) => row.join('')).join('/')}`,
    value,
    prompt: 'كم مكعب في الكومة كلها؟ المكعبات اللي تحت غيرها موجودة بعد.',
    slider: { mode: 'numeric-range', min: 0, max: 60, step: 1, unit: 'مكعب' },
    altText: 'كومة مكعبات متدرجة مرسومة بالمنظور',
    concept:
      'Count a stepped pile of cubes, including the ones hidden under the visible tops.',
    strategy:
      'Count column by column: the height of each stack, then add the stacks up.',
    domainDescription: 'whole cubes in one pile',
    factualClaim: `The pile holds ${value} cubes (column heights ${heights.map((row) => row.join(',')).join(' / ')}).`,
    svg: pileSvg(heights),
  };
}

// ---------------------------------------------------------------------------
// «كم طوله؟» — a length read against a reference the eye is fooled about
// ---------------------------------------------------------------------------

/** The share of the reference the second figure is drawn at. */
export const ILLUSION_VALUES = Array.from({ length: 17 }, (_, i) => 60 + i * 5);

const tag = (value: string, x: number, y: number, fill: string): string =>
  `<g data-tag="${value}"><circle cx="${round(x)}" cy="${round(y)}" r="34" fill="#FFFFFF" stroke="${fill}" stroke-width="7"/>` +
  text(value, x, y + 12, value === '؟' ? 38 : 26, fill) +
  `</g>`;

function arrowsSvg(ratio: number, redFirst: boolean): string {
  const reference = 420;
  const lines = [
    { colour: RED, length: reference, tagText: '100' },
    { colour: BLUE, length: (reference * ratio) / 100, tagText: '؟' },
  ];
  // The longer line gets the fins that shorten it, and the shorter the fins
  // that stretch it: the eye is pulled away from the truth.
  const longer = ratio >= 100 ? 1 : 0;
  const order = redFirst ? [0, 1] : [1, 0];
  let body = '';
  order.forEach((index, row) => {
    const line = lines[index];
    const y = 210 + row * 250;
    const centre = W / 2 + (row === 0 ? -50 : 70);
    const a = centre - line.length / 2;
    const b = centre + line.length / 2;
    const inward = index === longer; // <—> reads short
    const fin = 46;
    const ends = [
      [a, inward ? 1 : -1],
      [b, inward ? -1 : 1],
    ] as const;
    body += `<g data-line="${index === 0 ? 'reference' : 'asked'}" data-length="${round(line.length)}"><line x1="${round(a)}" y1="${y}" x2="${round(b)}" y2="${y}" stroke="${line.colour}" stroke-width="12" stroke-linecap="round"/>`;
    for (const [x, sign] of ends) {
      body += `<path d="M ${round(x + sign * fin)} ${y - fin} L ${round(x)} ${y} L ${round(x + sign * fin)} ${y + fin}" fill="none" stroke="${line.colour}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    body += `</g>` + tag(line.tagText, b + 110, y, line.colour);
  });
  return frame(body);
}

function railsSvg(ratio: number): string {
  // Two rails meeting toward the top: the upper bar looks the longer.
  const apexX = W / 2;
  const apexY = 40;
  const baseY = 640;
  const spread = 300;
  let body =
    `<line x1="${apexX}" y1="${apexY}" x2="${apexX - spread}" y2="${baseY}" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>` +
    `<line x1="${apexX}" y1="${apexY}" x2="${apexX + spread}" y2="${baseY}" stroke="${INK}" stroke-width="10" stroke-linecap="round"/>`;
  const reference = 220;
  const asked = (reference * ratio) / 100;
  // The truly longer bar sits low, where the rails make it look short.
  const bars =
    ratio >= 100
      ? [
          { colour: RED, length: reference, y: 230, tagText: '100' },
          { colour: BLUE, length: asked, y: 500, tagText: '؟' },
        ]
      : [
          { colour: BLUE, length: asked, y: 230, tagText: '؟' },
          { colour: RED, length: reference, y: 500, tagText: '100' },
        ];
  for (const bar of bars) {
    body +=
      `<line data-line="${bar.colour === RED ? 'reference' : 'asked'}" data-length="${round(bar.length)}" x1="${round(apexX - bar.length / 2)}" y1="${bar.y}" x2="${round(apexX + bar.length / 2)}" y2="${bar.y}" stroke="${bar.colour}" stroke-width="14" stroke-linecap="round"/>` +
      tag(bar.tagText, apexX + spread + 150, bar.y, bar.colour);
  }
  return frame(body);
}

function circlesSvg(ratio: number, redRight: boolean): string {
  const reference = 110;
  const discs = [
    { colour: RED, d: reference, tagText: '100' },
    { colour: BLUE, d: (reference * ratio) / 100, tagText: '؟' },
  ];
  // The truly bigger disc is ringed by big circles, which shrink it.
  const bigger = ratio >= 100 ? 1 : 0;
  let body = '';
  discs.forEach((disc, index) => {
    const right = index === 0 ? redRight : !redRight;
    const cx = W / 2 + (right ? 280 : -280);
    const cy = 330;
    const ringBig = index === bigger;
    const count = ringBig ? 6 : 8;
    const ringR = ringBig ? 62 : 22;
    const distance = disc.d / 2 + ringR + (ringBig ? 26 : 14);
    for (let k = 0; k < count; k += 1) {
      const angle = (k * 2 * Math.PI) / count;
      body += `<circle cx="${round(cx + distance * Math.cos(angle))}" cy="${round(cy + distance * Math.sin(angle))}" r="${ringR}" fill="#C9C2B4" stroke="${INK}" stroke-width="4"/>`;
    }
    body +=
      `<circle data-line="${index === 0 ? 'reference' : 'asked'}" data-length="${round(disc.d)}" cx="${round(cx)}" cy="${cy}" r="${round(disc.d / 2)}" fill="${disc.colour}" stroke="${INK}" stroke-width="5"/>` +
      tag(disc.tagText, cx, 600, disc.colour);
  });
  return frame(body);
}

function composeLengthIllusion(
  seed: string,
  variantKey: string,
): ComposedReading {
  const random = seededRandom(`length-illusion-ratio:${variantKey}:${seed}`);
  const value = pick(ILLUSION_VALUES, random);
  const circles = variantKey === 'circles';
  const svg =
    variantKey === 'arrows'
      ? arrowsSvg(value, random() < 0.5)
      : variantKey === 'rails'
        ? railsSvg(value)
        : circlesSvg(value, random() < 0.5);
  return {
    familyKey: 'length-illusion-ratio',
    variantKey,
    variant: `${variantKey}:${value}`,
    value,
    prompt: circles
      ? 'قطر الدائرة الحمراء 100. كم قطر الدائرة الزرقاء؟'
      : 'طول الخط الأحمر 100. كم طول الخط الأزرق؟',
    slider: { mode: 'numeric-range', min: 40, max: 160, step: 5 },
    altText: circles
      ? 'دائرتين حولهم دوائر بأحجام مختلفة تخدع العين'
      : 'خطين بطولين مختلفين حولهم رسم يخدع العين',
    concept:
      'Judge one length against another while the drawing around them pulls the eye the wrong way.',
    strategy:
      'Ignore the fins, rails or rings and compare the two coloured lengths alone.',
    domainDescription:
      'the blue length as a share of the red one, the red being 100',
    factualClaim: `The blue ${circles ? 'disc' : 'line'} is drawn at ${value}% of the red.`,
    svg,
  };
}

// ---------------------------------------------------------------------------
// «الساعة الغلط» — how many minutes one clock is off from the right one
// ---------------------------------------------------------------------------

function clockSvg(cx: number, cy: number, r: number, minutes: number): string {
  let body = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#FFFFFF" stroke="${INK}" stroke-width="12"/>`;
  for (let k = 0; k < 60; k += 1) {
    const angle = (k * Math.PI) / 30;
    const long = k % 5 === 0;
    const r1 = r - (long ? 34 : 16);
    const r2 = r - 8;
    body += `<line x1="${round(cx + r1 * Math.sin(angle))}" y1="${round(cy - r1 * Math.cos(angle))}" x2="${round(cx + r2 * Math.sin(angle))}" y2="${round(cy - r2 * Math.cos(angle))}" stroke="${INK}" stroke-width="${long ? 7 : 3}" stroke-linecap="round"/>`;
  }
  const minuteAngle = ((minutes % 60) * Math.PI) / 30;
  const hourAngle = (((minutes / 60) % 12) * Math.PI) / 6;
  const hand = (angle: number, length: number, width: number, colour: string) =>
    `<line x1="${cx}" y1="${cy}" x2="${round(cx + length * Math.sin(angle))}" y2="${round(cy - length * Math.cos(angle))}" stroke="${colour}" stroke-width="${width}" stroke-linecap="round"/>`;
  body +=
    hand(hourAngle, r * 0.5, 16, INK) +
    hand(minuteAngle, r * 0.82, 9, RED) +
    `<circle cx="${cx}" cy="${cy}" r="14" fill="${INK}"/>`;
  return `<g data-clock="${minutes}">${body}</g>`;
}

const clockLabel = (minutes: number): string => {
  const hour = Math.floor(minutes / 60) % 12 || 12;
  const minute = minutes % 60;
  return `${hour}:${String(minute).padStart(2, '0')}`;
};

function composeWrongClock(seed: string, variantKey: string): ComposedReading {
  const random = seededRandom(`wrong-clock-minutes:${variantKey}:${seed}`);
  const value = 3 + Math.floor(random() * 55); // 3..57
  const right = Math.floor(random() * 720);
  const behind = variantKey === 'behind';
  const wrong = (right + (behind ? -value : value) + 720) % 720;
  const r = 210;
  let body = '';
  // The right clock on the right, the wrong one on the left: read as Arabic.
  if (variantKey === 'digital') {
    body +=
      `<g data-clock="${right}"><rect x="${W / 2 + 70}" y="${170}" width="380" height="190" rx="30" fill="${INK}"/>` +
      text(clockLabel(right), W / 2 + 260, 300, 104, '#7CF2A4') +
      `</g>`;
  } else {
    body += clockSvg(W / 2 + 270, 290, r, right);
  }
  body += clockSvg(W / 2 - 270, 290, r, wrong);
  body +=
    text('مضبوطة', W / 2 + 270, 600, 40, GREEN) +
    text(behind ? 'متأخرة' : 'متقدمة', W / 2 - 270, 600, 40, RED);
  return {
    familyKey: 'wrong-clock-minutes',
    variantKey,
    variant: `${variantKey}:${clockLabel(right)}:${value}`,
    value,
    prompt: behind
      ? 'الساعة اليمين مضبوطة واليسار متأخرة. بكم دقيقة متأخرة؟'
      : 'الساعة اليمين مضبوطة واليسار متقدمة. بكم دقيقة متقدمة؟',
    slider: { mode: 'numeric-range', min: 0, max: 60, step: 1, unit: 'دقيقة' },
    altText: 'ساعتين، وحدة مضبوطة ووحدة الوقت فيها غلط',
    concept: 'Read two clocks and find how far the wrong one is off.',
    strategy:
      'Read the minutes on each clock and take the difference, minding the hour if it is crossed.',
    domainDescription: 'minutes between two clock times',
    factualClaim: `Right time ${clockLabel(right)}, wrong clock ${clockLabel(wrong)}: ${value} minutes ${behind ? 'behind' : 'ahead'}.`,
    svg: frame(body),
  };
}

export function composeClosest(
  familyKey: ClosestFamily,
  seed: string,
  variantKey?: string,
): ComposedReading {
  const variants = CLOSEST_VARIANTS[familyKey] as readonly string[];
  const chosen =
    variantKey && variants.includes(variantKey)
      ? variantKey
      : variants[
          Math.floor(
            seededRandom(`${familyKey}:variant:${seed}`)() * variants.length,
          )
        ];
  if (isErrorClosestFamily(familyKey))
    return composeErrorClosest(familyKey as ErrorClosestFamily, seed, chosen);
  if (isObservationClosestFamily(familyKey))
    return composeObservationClosest(
      familyKey as ObservationClosestFamily,
      seed,
      chosen,
    );
  if (isAssemblyClosestFamily(familyKey))
    return composeAssemblyClosest(
      familyKey as AssemblyClosestFamily,
      seed,
      chosen,
    );
  if (isPathClosestFamily(familyKey))
    return composePathClosest(familyKey as PathClosestFamily, seed, chosen);
  switch (familyKey) {
    case 'key-door-route':
      return composeKeyDoor(seed, chosen);
    case 'cube-pile-count':
      return composeCubePile(seed, chosen);
    case 'length-illusion-ratio':
      return composeLengthIllusion(seed, chosen);
    default:
      return composeWrongClock(seed, chosen);
  }
}
