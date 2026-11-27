import {
  INK,
  W,
  PUZZLE_FONT_FAMILY,
  frame,
  pick,
  round,
  seededRandom,
} from './composed-kit';
import { shuffled } from './composed-kit';
import { DrawnThing, drawnThings, thingSvg } from './drawn-things';

/**
 * مين أقرب in «المسارات والحركة»: eight families the engine draws, whose
 * answer it works out from the drawing — bounces counted by simulation, a
 * meeting point solved from two speeds, a thread measured segment by segment.
 *
 * Three of them answer with a *place* rather than a number: the slider is a
 * bare line between two named ends (`between-anchors`), and the team marks
 * where on the picture the thing happens. A between-anchors answer is kept
 * out of the middle fifth of the line, because a mark left in the centre
 * would otherwise win without thinking.
 */
export const PATH_CLOSEST_VARIANTS = {
  'ball-bounce-count': ['small', 'wide', 'tall', 'long', 'square', 'odd'],
  'travel-seconds': ['car', 'bus', 'bicycle', 'train', 'scooter', 'truck'],
  'gear-turns': [
    'half',
    'third',
    'quarter',
    'slow-half',
    'slow-third',
    'three-to-two',
  ],
  'pipe-flow-litres': [
    'one-closed',
    'two-closed',
    'three-closed',
    'half-closed',
    'mixed',
    'three-branches',
  ],
  'thread-length': ['gentle', 'zigzag', 'coiled', 'wave', 'steep', 'long'],
  'meeting-point': [
    'quick-left',
    'quick-right',
    'faster-left',
    'faster-right',
    'steady-left',
    'steady-right',
  ],
  'robot-stop': [
    'two-moves',
    'three-moves',
    'four-moves',
    'back-heavy',
    'forward-run',
    'long-way',
  ],
  'ball-drop-floor': [
    'two-boards',
    'three-boards',
    'four-boards',
    'zigzag',
    'long-boards',
    'short-boards',
  ],
} as const;

export type PathClosestFamily = keyof typeof PATH_CLOSEST_VARIANTS;

export const isPathClosestFamily = (
  familyKey: string | null | undefined,
): familyKey is PathClosestFamily =>
  Object.prototype.hasOwnProperty.call(PATH_CLOSEST_VARIANTS, familyKey ?? '');

export type ClosestSlider =
  | {
      mode: 'numeric-range';
      min: number;
      max: number;
      step: number;
      unit?: string;
    }
  | {
      mode: 'between-anchors';
      min: number;
      max: number;
      step: number;
      leftAnchor: string;
      rightAnchor: string;
    };

export interface PathReading {
  familyKey: PathClosestFamily;
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
const GREEN = '#2FA866';
const RED = '#D8493F';
const GOLD = '#E8B33A';
const GREY = '#6B6558';
const RULE = '#D8D2C4';

const byKey = new Map(drawnThings().map((thing) => [thing.key, thing]));
const thingAt = (key: string, cx: number, cy: number, size: number): string => {
  const thing: DrawnThing | undefined = byKey.get(key);
  return thing ? thingSvg(thing, cx, cy, size) : '';
};

const text = (
  value: string,
  x: number,
  y: number,
  size: number,
  fill = INK,
): string =>
  `<text x="${round(x)}" y="${round(y)}" text-anchor="middle" font-family="${PUZZLE_FONT_FAMILY}" font-weight="700" font-size="${size}" fill="${fill}">${value}</text>`;

/**
 * An arrow, drawn. The composer's font has no arrow glyph of any kind, and a
 * character it cannot draw is served as an empty box.
 */
const arrow = (
  x: number,
  y: number,
  dir: 1 | -1,
  len: number,
  colour: string,
): string =>
  `<g><line x1="${round(x - (dir * len) / 2)}" y1="${round(y)}" x2="${round(x + (dir * len) / 2 - dir * 16)}" y2="${round(y)}" stroke="${colour}" stroke-width="8" stroke-linecap="round"/>` +
  `<path d="M${round(x + (dir * len) / 2)} ${round(y)} L${round(x + (dir * len) / 2 - dir * 21)} ${round(y - 13)} L${round(x + (dir * len) / 2 - dir * 21)} ${round(y + 13)}Z" fill="${colour}"/></g>`;

/** The line the picture and the slider share: cell 0 on the left, as the slider runs. */
const LANE = { x0: 110, x1: 1090 };
const laneStrip = (cells: number, y: number) => {
  const cw = (LANE.x1 - LANE.x0) / cells;
  let body = `<rect x="${LANE.x0}" y="${round(y - 34)}" width="${round(LANE.x1 - LANE.x0)}" height="68" rx="10" fill="#FFFFFF" stroke="${INK}" stroke-width="6"/>`;
  for (let i = 1; i < cells; i += 1)
    body += `<line x1="${round(LANE.x0 + i * cw)}" y1="${round(y - 34)}" x2="${round(LANE.x0 + i * cw)}" y2="${round(y + 34)}" stroke="${RULE}" stroke-width="3"/>`;
  return { body, at: (i: number) => LANE.x0 + i * cw, cw };
};

/**
 * The shape this item takes, out of a template's shapes. The seed is
 * «job:ordinal»: the job shuffles the shapes once and item n takes the next
 * one, so a batch walks the whole list instead of landing twice on one by
 * chance. A seed without an ordinal draws at random.
 */
export function dealt<T>(
  seed: string,
  options: readonly T[],
  random: () => number,
): T {
  const match = /^(.*):(\d+)$/.exec(seed);
  if (!match) return pick(options, random);
  const deck = shuffled(options, seededRandom(`deal:${match[1]}`));
  return deck[Number(match[2]) % deck.length];
}

/** A target this close to the midpoint is refused by the screen. */
export const CENTRE_BAND = 0.1;
export const offCentre = (value: number, cells: number): boolean =>
  Math.abs(value - cells / 2) > cells * CENTRE_BAND;

/**
 * Where a between-anchors answer may fall: clear of the middle fifth, which
 * the screen refuses, and clear of both ends, which a team wins by dragging.
 */
export const placeable = (value: number, cells: number): boolean =>
  offCentre(value, cells) && value >= 2 && value <= cells - 2;

// ---------------------------------------------------------------------------
// «كم مرة ترتد؟» — a ball at 45° in a box, counted by simulation
// ---------------------------------------------------------------------------

const BOUNCE_BOXES: Record<string, Array<[number, number]>> = {
  small: [
    [5, 3],
    [5, 4],
    [4, 3],
    [5, 2],
    [4, 5],
  ],
  wide: [
    [7, 4],
    [7, 3],
    [8, 3],
    [9, 2],
    [8, 7],
  ],
  tall: [
    [4, 7],
    [3, 7],
    [3, 8],
    [2, 9],
    [4, 9],
  ],
  long: [
    [8, 5],
    [9, 5],
    [8, 7],
    [10, 7],
    [9, 8],
  ],
  square: [
    [6, 5],
    [5, 6],
    [7, 6],
    [6, 7],
    [8, 9],
  ],
  odd: [
    [9, 4],
    [7, 5],
    [9, 7],
    [10, 3],
    [11, 4],
  ],
};

/** The ball's corners and walls, and how many walls it meets on the way. */
export function bouncePath(
  cols: number,
  rows: number,
): { hits: number; points: Array<[number, number]> } {
  let x = 0;
  let y = 0;
  let dx = 1;
  let dy = 1;
  let hits = 0;
  const points: Array<[number, number]> = [[0, 0]];
  for (let guard = 0; guard < 2000; guard += 1) {
    x += dx;
    y += dy;
    const onX = x === 0 || x === cols;
    const onY = y === 0 || y === rows;
    if (onX && onY) {
      points.push([x, y]);
      break;
    }
    if (onX || onY) {
      points.push([x, y]);
      hits += 1;
    }
    if (onX) dx = -dx;
    if (onY) dy = -dy;
  }
  return { hits, points };
}

function composeBounce(seed: string, variantKey: string): PathReading {
  const random = seededRandom(`ball-bounce-count:${variantKey}:${seed}`);
  const [cols, rows] = dealt(
    seed,
    BOUNCE_BOXES[variantKey] ?? BOUNCE_BOXES.small,
    random,
  );
  const { hits, points } = bouncePath(cols, rows);
  const cell = Math.min(760 / cols, 400 / rows);
  const ox = (W - cols * cell) / 2;
  const oy = 190;
  const px = (point: [number, number]) =>
    `${round(ox + point[0] * cell)},${round(oy + point[1] * cell)}`;
  let grid = '';
  for (let c = 1; c < cols; c += 1)
    grid += `<line x1="${round(ox + c * cell)}" y1="${round(oy)}" x2="${round(ox + c * cell)}" y2="${round(oy + rows * cell)}" stroke="${RULE}" stroke-width="2"/>`;
  for (let r = 1; r < rows; r += 1)
    grid += `<line x1="${round(ox)}" y1="${round(oy + r * cell)}" x2="${round(ox + cols * cell)}" y2="${round(oy + r * cell)}" stroke="${RULE}" stroke-width="2"/>`;
  const end = points[points.length - 1];
  return {
    familyKey: 'ball-bounce-count',
    variantKey,
    variant: `${variantKey}:${cols}x${rows}`,
    value: hits,
    prompt: 'كم مرة ترتد الكورة في الجدار قبل ما تدخل الحفرة؟',
    slider: {
      mode: 'numeric-range',
      min: 0,
      max: 20,
      step: 1,
      unit: 'ارتدادة',
    },
    altText: 'كورة ترتد بين جدران صندوق ومسارها مرسوم',
    concept:
      'Count the wall bounces on a drawn 45° path before the ball reaches the hole.',
    strategy:
      'Follow the drawn path from the ball and count each time it touches a wall.',
    domainDescription: 'bounces off the walls, 0 to 20',
    factualClaim: `A 45° path in a ${cols} by ${rows} box meets a wall ${hits} times before a corner.`,
    svg: frame(
      text('كم مرة ترتد الكورة في الجدار قبل ما تدخل الحفرة؟', W / 2, 104, 42) +
        `<rect x="${round(ox)}" y="${round(oy)}" width="${round(cols * cell)}" height="${round(rows * cell)}" fill="#FFFFFF"/>` +
        grid +
        `<polyline points="${points.map(px).join(' ')}" fill="none" stroke="${BLUE}" stroke-width="7" stroke-linejoin="round"/>` +
        `<rect x="${round(ox)}" y="${round(oy)}" width="${round(cols * cell)}" height="${round(rows * cell)}" fill="none" stroke="${INK}" stroke-width="9"/>` +
        `<circle cx="${round(ox + end[0] * cell)}" cy="${round(oy + end[1] * cell)}" r="21" fill="${INK}"/>` +
        `<circle cx="${round(ox)}" cy="${round(oy)}" r="18" fill="${RED}" stroke="#FFFFFF" stroke-width="5"/>`,
    ),
  };
}

// ---------------------------------------------------------------------------
// «كم ثانية يوصل؟» — a track of squares and a speed
// ---------------------------------------------------------------------------

const VEHICLES: Record<string, { key: string; speed: number; ar: string }> = {
  car: { key: 'car', speed: 3, ar: 'السيارة' },
  bus: { key: 'bus', speed: 2, ar: 'الباص' },
  bicycle: { key: 'bicycle', speed: 4, ar: 'السيكل' },
  train: { key: 'train', speed: 3, ar: 'القطار' },
  scooter: { key: 'scooter', speed: 2, ar: 'السكوتر' },
  truck: { key: 'truck', speed: 4, ar: 'الشاحنة' },
};

function composeTravel(seed: string, variantKey: string): PathReading {
  const random = seededRandom(`travel-seconds:${variantKey}:${seed}`);
  const vehicle = VEHICLES[variantKey] ?? VEHICLES.car;
  const most = Math.min(13, Math.floor(32 / vehicle.speed));
  const choices = Array.from(
    { length: Math.max(1, most - 3) },
    (_, i) => 4 + i,
  );
  const value = dealt(seed, choices, random);
  const cells = value * vehicle.speed;
  const perRow = Math.ceil(cells / 2);
  const cell = Math.min(840 / perRow, 112);
  const ox = (W - perRow * cell) / 2;
  const oy = 250;
  let body = '';
  const at: Array<[number, number]> = [];
  for (let i = 0; i < cells; i += 1) {
    const row = Math.floor(i / perRow);
    const col = row % 2 === 0 ? i % perRow : perRow - 1 - (i % perRow);
    const x = ox + col * cell;
    const y = oy + row * (cell + 26);
    at.push([x, y]);
    body += `<rect x="${round(x + 4)}" y="${round(y + 4)}" width="${round(cell - 8)}" height="${round(cell - 8)}" rx="12" fill="#FFFFFF" stroke="${INK}" stroke-width="5"/>`;
  }
  const first = at[0];
  const last = at[cells - 1];
  body += thingAt(
    vehicle.key,
    first[0] + cell / 2,
    first[1] + cell / 2,
    cell * 0.78,
  );
  body +=
    `<g><rect x="${round(last[0] + cell / 2 - 5)}" y="${round(last[1] + 16)}" width="10" height="${round(cell - 32)}" fill="${INK}"/>` +
    `<path d="M${round(last[0] + cell / 2 + 5)} ${round(last[1] + 20)} L${round(last[0] + cell / 2 + 52)} ${round(last[1] + 34)} L${round(last[0] + cell / 2 + 5)} ${round(last[1] + 48)}Z" fill="${RED}"/></g>`;
  return {
    familyKey: 'travel-seconds',
    variantKey,
    variant: `${variantKey}:${cells}`,
    value,
    prompt: `كم ثانية تحتاج ${vehicle.ar} عشان توصل العلم؟`,
    slider: { mode: 'numeric-range', min: 0, max: 20, step: 1, unit: 'ثانية' },
    altText: 'مسار مربعات من المركبة لين العلم',
    concept:
      'Divide the squares of a drawn track by the squares crossed each second.',
    strategy:
      'Count the squares of the track, then split them into groups the size of one second.',
    domainDescription: 'seconds to the end of the track, 0 to 20',
    factualClaim: `A track of ${cells} squares at ${vehicle.speed} squares a second takes ${value} seconds.`,
    svg: frame(
      text(`كم ثانية تحتاج ${vehicle.ar} عشان توصل العلم؟`, W / 2, 92, 42) +
        text(`كل ثانية تتحرك ${vehicle.speed} مربعات`, W / 2, 152, 34, BLUE) +
        body,
    ),
  };
}

// ---------------------------------------------------------------------------
// «كم لفة يلف؟» — two gears, the driver's turns given
// ---------------------------------------------------------------------------

const GEAR_SETUPS: Record<
  string,
  { driver: number; driven: number; turns: number[] }
> = {
  half: { driver: 20, driven: 10, turns: [3, 4, 5, 6, 7, 8] },
  third: { driver: 24, driven: 8, turns: [2, 3, 4, 5, 6] },
  quarter: { driver: 24, driven: 6, turns: [2, 3, 4, 5] },
  'slow-half': { driver: 10, driven: 20, turns: [6, 8, 10, 12, 14] },
  'slow-third': { driver: 8, driven: 24, turns: [6, 9, 12, 15] },
  'three-to-two': { driver: 12, driven: 18, turns: [6, 9, 12, 15] },
};

function gearSvg(
  cx: number,
  cy: number,
  r: number,
  teeth: number,
  fill: string,
): string {
  let body = '';
  for (let i = 0; i < teeth; i += 1) {
    const degrees = (i / teeth) * 360;
    const width = (Math.PI * 2 * r) / teeth / 2.2;
    body += `<rect x="${round(-width / 2)}" y="${round(-r - 19)}" width="${round(width)}" height="26" rx="5" fill="${fill}" transform="translate(${round(cx)},${round(cy)}) rotate(${round(degrees)})"/>`;
  }
  return (
    `<g>${body}<circle cx="${round(cx)}" cy="${round(cy)}" r="${round(r)}" fill="${fill}"/>` +
    `<circle cx="${round(cx)}" cy="${round(cy)}" r="${round(r * 0.26)}" fill="#F6F1E7" stroke="${INK}" stroke-width="5"/></g>`
  );
}

function composeGears(seed: string, variantKey: string): PathReading {
  const random = seededRandom(`gear-turns:${variantKey}:${seed}`);
  const setup = GEAR_SETUPS[variantKey] ?? GEAR_SETUPS.half;
  const turns = dealt(seed, setup.turns, random);
  const value = (turns * setup.driver) / setup.driven;
  const unit = 7.2;
  const rd = setup.driver * unit;
  const rn = setup.driven * unit;
  const cy = 430;
  const cx1 = W / 2 - (rd + rn + 30) / 2 + 30;
  const cx2 = cx1 + rd + rn + 30;
  return {
    familyKey: 'gear-turns',
    variantKey,
    variant: `${variantKey}:${turns}`,
    value,
    prompt: 'الترس الأزرق لف اللفات المكتوبة. كم لفة يلف الترس الأصفر؟',
    slider: { mode: 'numeric-range', min: 0, max: 24, step: 1, unit: 'لفة' },
    altText: 'ترسان متعاشقان، واحد أزرق وواحد أصفر',
    concept:
      'Read the size ratio of two meshed gears and turn the driver turns into the driven ones.',
    strategy:
      'A gear half the size turns twice as often: compare the two gears, then scale the turns.',
    domainDescription: 'turns of the second gear, 0 to 24',
    factualClaim: `${setup.driver} teeth turning ${turns} times drives ${setup.driven} teeth ${value} times.`,
    svg: frame(
      text(
        'الترس الأزرق لف ' + turns + ' لفات. كم لفة يلف الترس الأصفر؟',
        W / 2,
        110,
        40,
      ) +
        gearSvg(cx1, cy, rd, setup.driver, BLUE) +
        gearSvg(cx2, cy, rn, setup.driven, GOLD),
    ),
  };
}

// ---------------------------------------------------------------------------
// «كم لتر يوصل؟» — water split evenly down a tree of pipes
// ---------------------------------------------------------------------------

const PIPE_SETUPS: Record<
  string,
  {
    litres: number[];
    closedLeaves: number;
    closedHalf: boolean;
    branches: 3 | 4;
  }
> = {
  'one-closed': {
    litres: [16, 20, 24, 28],
    closedLeaves: 1,
    closedHalf: false,
    branches: 4,
  },
  'two-closed': {
    litres: [16, 20, 24, 28],
    closedLeaves: 2,
    closedHalf: false,
    branches: 4,
  },
  'three-closed': {
    litres: [16, 20, 24, 32],
    closedLeaves: 3,
    closedHalf: false,
    branches: 4,
  },
  'half-closed': {
    litres: [16, 20, 24, 28],
    closedLeaves: 0,
    closedHalf: true,
    branches: 4,
  },
  mixed: {
    litres: [16, 20, 24, 28],
    closedLeaves: 1,
    closedHalf: true,
    branches: 4,
  },
  'three-branches': {
    litres: [12, 18, 24, 30],
    closedLeaves: 1,
    closedHalf: false,
    branches: 3,
  },
};

function composePipes(seed: string, variantKey: string): PathReading {
  const random = seededRandom(`pipe-flow-litres:${variantKey}:${seed}`);
  const setup = PIPE_SETUPS[variantKey] ?? PIPE_SETUPS['one-closed'];
  const litres = dealt(seed, setup.litres, random);
  const topY = 212;
  const midY = 352;
  const botY = 476;
  const bucketY = 580;
  const pipe = (x1: number, y1: number, x2: number, y2: number, on: boolean) =>
    `<line x1="${round(x1)}" y1="${round(y1)}" x2="${round(x2)}" y2="${round(y2)}" stroke="${on ? BLUE : '#B9B2A4'}" stroke-width="18" stroke-linecap="round"/>`;
  const shut = (x: number, y: number) =>
    `<g><circle cx="${round(x)}" cy="${round(y)}" r="28" fill="#FFFFFF" stroke="${RED}" stroke-width="8"/>` +
    `<path d="M${round(x - 13)} ${round(y - 13)} L${round(x + 13)} ${round(y + 13)} M${round(x + 13)} ${round(y - 13)} L${round(x - 13)} ${round(y + 13)}" stroke="${RED}" stroke-width="9" stroke-linecap="round"/></g>`;
  let body =
    `<rect x="${round(W / 2 - 150)}" y="${round(topY - 76)}" width="300" height="76" rx="14" fill="#FFFFFF" stroke="${INK}" stroke-width="7"/>` +
    text(`${litres} لتر`, W / 2, topY - 24, 40, BLUE) +
    pipe(W / 2, topY, W / 2, topY + 44, true);
  let reaching = 0;
  const toBucket = (x: number) =>
    pipe(x, botY, x, bucketY - 54, true) +
    pipe(x, bucketY - 54, W / 2, bucketY - 54, true) +
    pipe(W / 2, bucketY - 54, W / 2, bucketY - 18, true);

  if (setup.branches === 3) {
    const xs = [280, W / 2, 920];
    const closed = Math.floor(random() * 3);
    body += pipe(xs[0], topY + 44, xs[2], topY + 44, true);
    xs.forEach((x, index) => {
      const on = index !== closed;
      body += pipe(x, topY + 44, x, botY, on);
      if (!on) body += shut(x, (topY + 44 + botY) / 2);
      else {
        reaching += litres / 3;
        body += toBucket(x);
      }
    });
  } else {
    const xs = [250, 470, 730, 950];
    const halves = [360, 840];
    const deadHalf = setup.closedHalf ? Math.floor(random() * 2) : -1;
    const order = [0, 1, 2, 3].filter(
      (leaf) => Math.floor(leaf / 2) !== deadHalf,
    );
    const dead = new Set(
      [...order].sort(() => random() - 0.5).slice(0, setup.closedLeaves),
    );
    body += pipe(halves[0], topY + 44, halves[1], topY + 44, true);
    [0, 1].forEach((half) => {
      const alive = half !== deadHalf;
      body += pipe(halves[half], topY + 44, halves[half], midY, alive);
      if (!alive) body += shut(halves[half], (topY + 44 + midY) / 2);
      body += pipe(xs[half * 2], midY, xs[half * 2 + 1], midY, alive);
      [0, 1].forEach((leaf) => {
        const index = half * 2 + leaf;
        const x = xs[index];
        const on = alive && !dead.has(index);
        body += pipe(x, midY, x, botY, on);
        if (!on && alive) body += shut(x, (midY + botY) / 2);
        else if (on) {
          reaching += litres / 4;
          body += toBucket(x);
        }
      });
    });
  }
  body += `<path d="M${round(W / 2 - 170)} ${round(bucketY - 14)} L${round(W / 2 + 170)} ${round(bucketY - 14)} L${round(W / 2 + 128)} ${round(bucketY + 72)} L${round(W / 2 - 128)} ${round(bucketY + 72)}Z" fill="#FFFFFF" stroke="${INK}" stroke-width="7"/>`;
  const value = Math.round(reaching);
  return {
    familyKey: 'pipe-flow-litres',
    variantKey,
    variant: `${variantKey}:${litres}:${value}`,
    value,
    prompt:
      'كم لتر يوصل للدلو؟ الموية تتوزع بالتساوي على الفروع، والمقفول ما يمرّر.',
    slider: { mode: 'numeric-range', min: 0, max: 32, step: 1, unit: 'لتر' },
    altText: 'خزان موية ينقسم على فروع، بعضها مقفول، وتحتها دلو',
    concept:
      'Split a tank evenly down a tree of pipes and add up what the open branches deliver.',
    strategy:
      'Work out one branch’s share, then add the shares of the branches that are still open.',
    domainDescription: 'litres reaching the bucket, 0 to 32',
    factualClaim: `${litres} litres split down this tree leaves ${value} litres in the bucket.`,
    svg: frame(
      text('كم لتر يوصل للدلو؟', W / 2, 64, 40) +
        text(
          'الموية تتوزع بالتساوي على الفروع، والمقفول ما يمرّر',
          W / 2,
          110,
          30,
          GREY,
        ) +
        body,
    ),
  };
}

// ---------------------------------------------------------------------------
// «كم طول الخيط؟» — a thread measured against the squares under it
// ---------------------------------------------------------------------------

const THREAD_SETUPS: Record<
  string,
  { segments: number; rise: number; run: [number, number] }
> = {
  gentle: { segments: 4, rise: 1.6, run: [2.0, 3.0] },
  zigzag: { segments: 11, rise: 5.0, run: [0.6, 1.0] },
  coiled: { segments: 18, rise: 4.0, run: [0.3, 0.6] },
  wave: { segments: 7, rise: 2.2, run: [1.2, 1.9] },
  steep: { segments: 8, rise: 6.0, run: [0.7, 1.2] },
  long: { segments: 13, rise: 2.0, run: [0.8, 1.2] },
};

function composeThread(seed: string, variantKey: string): PathReading {
  const random = seededRandom(`thread-length:${variantKey}:${seed}`);
  const setup = THREAD_SETUPS[variantKey] ?? THREAD_SETUPS.gentle;
  const cell = 74;
  const cols = 14;
  const rows = 7;
  const ox = (W - cols * cell) / 2;
  const oy = 150;
  let grid = '';
  for (let c = 0; c <= cols; c += 1)
    grid += `<line x1="${round(ox + c * cell)}" y1="${round(oy)}" x2="${round(ox + c * cell)}" y2="${round(oy + rows * cell)}" stroke="${RULE}" stroke-width="2"/>`;
  for (let r = 0; r <= rows; r += 1)
    grid += `<line x1="${round(ox)}" y1="${round(oy + r * cell)}" x2="${round(ox + cols * cell)}" y2="${round(oy + r * cell)}" stroke="${RULE}" stroke-width="2"/>`;
  let x = 0.8;
  let y = rows / 2;
  let length = 0;
  const points: Array<[number, number]> = [[x, y]];
  for (let i = 0; i < setup.segments; i += 1) {
    const run = setup.run[0] + random() * (setup.run[1] - setup.run[0]);
    const next = Math.min(cols - 0.8, x + run);
    const rise = (random() - 0.5) * setup.rise;
    const ny = Math.max(0.6, Math.min(rows - 0.6, y + rise));
    length += Math.hypot(next - x, ny - y);
    x = next;
    y = ny;
    points.push([x, y]);
  }
  const value = Math.round(length);
  const path = points
    .map(
      (point, index) =>
        `${index ? 'L' : 'M'}${round(ox + point[0] * cell)} ${round(oy + point[1] * cell)}`,
    )
    .join(' ');
  const pin = (point: [number, number], fill: string) =>
    `<circle cx="${round(ox + point[0] * cell)}" cy="${round(oy + point[1] * cell)}" r="15" fill="${fill}" stroke="#FFFFFF" stroke-width="5"/>`;
  return {
    familyKey: 'thread-length',
    variantKey,
    variant: `${variantKey}:${value}`,
    value,
    prompt: 'كم مربع يطلع طول الخيط لو مدّيناه؟',
    slider: { mode: 'numeric-range', min: 0, max: 30, step: 1, unit: 'مربع' },
    altText: 'خيط متعرّج فوق شبكة مربعات',
    concept:
      'Estimate the laid-out length of a bent thread against the squares it lies on.',
    strategy:
      'Take the thread piece by piece and add each piece’s length in squares.',
    domainDescription: 'squares of thread laid straight, 0 to 30',
    factualClaim: `The drawn thread measures ${value} squares laid straight.`,
    svg: frame(
      text('كم مربع يطلع طول الخيط لو مدّيناه؟', W / 2, 92, 44) +
        grid +
        `<path d="${path}" fill="none" stroke="${GREEN}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>` +
        pin(points[0], RED) +
        pin(points[points.length - 1], INK),
    ),
  };
}

// ---------------------------------------------------------------------------
// «وين يلتقون؟» — two speeds from two ends: a place, not a number
// ---------------------------------------------------------------------------

const MEET_SETUPS: Record<
  string,
  { roads: number[]; left: number; right: number }
> = {
  'quick-left': { roads: [15, 18, 21, 24], left: 1, right: 2 },
  'quick-right': { roads: [15, 18, 21, 24], left: 2, right: 1 },
  'faster-left': { roads: [12, 16, 20, 24], left: 1, right: 3 },
  'faster-right': { roads: [12, 16, 20, 24], left: 3, right: 1 },
  'steady-left': { roads: [15, 20, 25, 10], left: 1, right: 4 },
  'steady-right': { roads: [15, 20, 25, 10], left: 4, right: 1 },
};

function composeMeeting(seed: string, variantKey: string): PathReading {
  const random = seededRandom(`meeting-point:${variantKey}:${seed}`);
  const setup = MEET_SETUPS[variantKey] ?? MEET_SETUPS['quick-left'];
  const { left, right } = setup;
  const cells = dealt(seed, setup.roads, random);
  const value = (cells * left) / (left + right);
  const y = 408;
  const { body, at } = laneStrip(cells, y);
  return {
    familyKey: 'meeting-point',
    variantKey,
    variant: `${variantKey}:${cells}:${left}:${right}`,
    value,
    prompt: 'السيارة والشاحنة انطلقوا مع بعض من البيتين. وين بيلتقون؟',
    slider: {
      mode: 'between-anchors',
      min: 0,
      max: cells,
      step: 1,
      leftAnchor: 'بيت أحمد',
      rightAnchor: 'بيت سعد',
    },
    altText: 'طريق بين بيتين، سيارة على طرف وشاحنة على الطرف الثاني',
    concept:
      'Find where two movers coming from opposite ends at different speeds meet.',
    strategy:
      'The faster one covers more of the road: split the road in the ratio of the two speeds.',
    domainDescription: 'a place on the road between the two houses',
    factualClaim: `At ${left} and ${right} squares a second over ${cells} squares they meet at square ${value}.`,
    svg: frame(
      text(
        'السيارة والشاحنة انطلقوا مع بعض من البيتين. وين بيلتقون؟',
        W / 2,
        96,
        40,
      ) +
        body +
        thingAt('car', at(0) + 34, y, 90) +
        thingAt('truck', at(cells) - 34, y, 90) +
        text(`${left} مربعات في الثانية`, at(0) + 190, y - 74, 30, BLUE) +
        text(`${right} مربعات في الثانية`, at(cells) - 190, y - 74, 30, RED) +
        text('بيت أحمد', at(0) + 40, y + 102, 28, GREY) +
        text('بيت سعد', at(cells) - 40, y + 102, 28, GREY),
    ),
  };
}

// ---------------------------------------------------------------------------
// «وين يوقف الروبوت؟» — orders carried out in turn
// ---------------------------------------------------------------------------

const ROBOT_SETUPS: Record<string, number> = {
  'two-moves': 2,
  'three-moves': 3,
  'four-moves': 4,
  'back-heavy': 3,
  'forward-run': 3,
  'long-way': 4,
};

/** Orders whose end is on the line and clear of its middle fifth. */
export function robotRun(
  cells: number,
  howMany: number,
  random: () => number,
): { start: number; moves: number[]; end: number } {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const start = 2 + Math.floor(random() * (cells - 4));
    const moves: number[] = [];
    let at = start;
    let fine = true;
    for (let i = 0; i < howMany; i += 1) {
      const size = 2 + Math.floor(random() * 7);
      const dir = random() < 0.62 ? 1 : -1;
      const next = at + dir * size;
      if (next < 1 || next > cells - 1) {
        fine = false;
        break;
      }
      moves.push(dir * size);
      at = next;
    }
    if (fine && placeable(at, cells) && at !== start)
      return { start, moves, end: at };
  }
  return { start: 2, moves: [3], end: 5 };
}

function composeRobot(seed: string, variantKey: string): PathReading {
  const random = seededRandom(`robot-stop:${variantKey}:${seed}`);
  const cells = 20;
  const { start, moves, end } = robotRun(
    cells,
    ROBOT_SETUPS[variantKey] ?? 3,
    random,
  );
  const y = 372;
  const { body, at } = laneStrip(cells, y);
  let chips = '';
  moves.forEach((move, index) => {
    const cx = W / 2 + (moves.length / 2 - 0.5 - index) * 228;
    chips +=
      `<rect x="${round(cx - 98)}" y="540" width="196" height="76" rx="18" fill="#FFFFFF" stroke="${INK}" stroke-width="5"/>` +
      arrow(cx - 40, 578, move > 0 ? 1 : -1, 72, move > 0 ? GREEN : RED) +
      text(`${Math.abs(move)}`, cx + 54, 592, 40);
  });
  return {
    familyKey: 'robot-stop',
    variantKey,
    variant: `${variantKey}:${start}:${moves.join(',')}`,
    value: end,
    prompt: 'الروبوت ينفّذ الأوامر بالترتيب. وين بيوقف؟',
    slider: {
      mode: 'between-anchors',
      min: 0,
      max: cells,
      step: 1,
      leftAnchor: 'أول الممر',
      rightAnchor: 'آخر الممر',
    },
    altText: 'ممر مربعات وروبوت عليه، وتحته أوامر حركة بأسهم',
    concept:
      'Carry out a short list of signed moves along a line and mark where they end.',
    strategy:
      'Start at the robot and step the orders one by one, forwards then back.',
    domainDescription: 'a place along the corridor',
    factualClaim: `From square ${start}, the orders ${moves.join(', ')} end at square ${end}.`,
    svg: frame(
      text('الروبوت ينفّذ الأوامر بالترتيب. وين بيوقف؟', W / 2, 94, 42) +
        body +
        thingAt('ufo', at(start), y, 84) +
        `<circle cx="${round(at(start))}" cy="${round(y + 62)}" r="9" fill="${INK}"/>` +
        chips,
    ),
  };
}

// ---------------------------------------------------------------------------
// «وين تطيح الكورة؟» — boards that pass the ball down to the floor
// ---------------------------------------------------------------------------

const DROP_SETUPS: Record<string, { boards: number; span: [number, number] }> =
  {
    'two-boards': { boards: 2, span: [7, 12] },
    'three-boards': { boards: 3, span: [6, 11] },
    'four-boards': { boards: 4, span: [5, 9] },
    zigzag: { boards: 3, span: [8, 13] },
    'long-boards': { boards: 3, span: [10, 15] },
    'short-boards': { boards: 4, span: [4, 7] },
  };

/** Boards the ball really travels, and the square it leaves them on. */
export function dropRun(
  cells: number,
  howMany: number,
  span: [number, number],
  random: () => number,
): { start: number; boards: Array<[number, number]>; end: number } {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const start = 1 + Math.floor(random() * (cells - 2));
    const boards: Array<[number, number]> = [];
    let at = start;
    let fine = true;
    for (let i = 0; i < howMany; i += 1) {
      const width = span[0] + Math.floor(random() * (span[1] - span[0] + 1));
      const toRight = random() < 0.5;
      const far = toRight ? at + width : at - width;
      if (far < 0 || far > cells) {
        fine = false;
        break;
      }
      boards.push([at, far]);
      at = far;
    }
    if (fine && placeable(at, cells) && boards.length === howMany)
      return { start, boards, end: at };
  }
  return { start: 2, boards: [[2, 16]], end: 16 };
}

function composeDrop(seed: string, variantKey: string): PathReading {
  const random = seededRandom(`ball-drop-floor:${variantKey}:${seed}`);
  const cells = 20;
  const setup = DROP_SETUPS[variantKey] ?? DROP_SETUPS['three-boards'];
  const { start, boards, end } = dropRun(
    cells,
    setup.boards,
    setup.span,
    random,
  );
  const floorY = 548;
  const { body: floor, at } = laneStrip(cells, floorY);
  const top = 212;
  const gap = (floorY - 78 - top) / Math.max(1, boards.length);
  let body = '';
  boards.forEach(([from, to], index) => {
    const y = top + index * gap;
    const down = to > from ? 1 : -1;
    const [ax, bx] = [at(from), at(to)];
    body += `<line x1="${round(ax)}" y1="${round(y - down * 34)}" x2="${round(bx)}" y2="${round(y + down * 34)}" stroke="${INK}" stroke-width="16" stroke-linecap="round"/>`;
  });
  return {
    familyKey: 'ball-drop-floor',
    variantKey,
    variant: `${variantKey}:${start}:${boards.map((board) => board.join('-')).join(',')}`,
    value: end,
    prompt: 'الكورة تنزل وتتدحرج على الألواح. وين بتطيح على الأرض؟',
    slider: {
      mode: 'between-anchors',
      min: 0,
      max: cells,
      step: 1,
      leftAnchor: 'يسار الأرض',
      rightAnchor: 'يمين الأرض',
    },
    altText: 'كورة فوق ألواح مايلة وتحتها أرض مقسّمة مربعات',
    concept:
      'Follow a ball rolling down the low end of each tilted board to the floor.',
    strategy:
      'On each board the ball rolls to the lower end, then drops straight onto the next.',
    domainDescription: 'a place along the floor',
    factualClaim: `Dropped at square ${start}, the ball leaves the boards at square ${end}.`,
    svg: frame(
      text(
        'الكورة تنزل وتتدحرج على الألواح. وين بتطيح على الأرض؟',
        W / 2,
        86,
        40,
      ) +
        body +
        floor +
        text('يسار الأرض', LANE.x0 + 70, floorY + 92, 28, GREY) +
        text('يمين الأرض', LANE.x1 - 70, floorY + 92, 28, GREY) +
        `<circle cx="${round(at(start))}" cy="${round(top - 62)}" r="22" fill="${RED}" stroke="#FFFFFF" stroke-width="5"/>`,
    ),
  };
}

export function composePathClosest(
  familyKey: PathClosestFamily,
  seed: string,
  variantKey?: string,
): PathReading {
  const variants = PATH_CLOSEST_VARIANTS[familyKey] as readonly string[];
  const chosen =
    variantKey && variants.includes(variantKey)
      ? variantKey
      : variants[
          Math.floor(
            seededRandom(`${familyKey}:variant:${seed}`)() * variants.length,
          )
        ];
  switch (familyKey) {
    case 'ball-bounce-count':
      return composeBounce(seed, chosen);
    case 'travel-seconds':
      return composeTravel(seed, chosen);
    case 'gear-turns':
      return composeGears(seed, chosen);
    case 'pipe-flow-litres':
      return composePipes(seed, chosen);
    case 'thread-length':
      return composeThread(seed, chosen);
    case 'meeting-point':
      return composeMeeting(seed, chosen);
    case 'robot-stop':
      return composeRobot(seed, chosen);
    default:
      return composeDrop(seed, chosen);
  }
}
