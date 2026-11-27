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
 * مين أقرب in «الملاحظة والخداع»: five families the engine draws and counts
 * for itself — shapes laid among clutter, squares of every size in a grid,
 * dots of two colours, the odd one in a row, and where two lines would meet
 * if they were drawn on.
 *
 * The last two answer with a place on a bare line (`between-anchors`), kept
 * clear of the middle fifth and of both ends.
 */
export const OBSERVATION_CLOSEST_VARIANTS = {
  'clutter-count': [
    'stars',
    'circles',
    'triangles',
    'squares',
    'mixed',
    'dense',
  ],
  'grid-squares': ['small', 'three', 'wide', 'four', 'tall', 'big'],
  'dots-estimate': [
    'few',
    'many',
    'clustered',
    'spread',
    'mostly-red',
    'mostly-blue',
  ],
  'odd-one-place': ['colour', 'size', 'turned', 'gap', 'shade', 'shape'],
  'lines-meet': ['shallow', 'steep', 'narrow', 'wide', 'left', 'right'],
} as const;

export type ObservationClosestFamily =
  keyof typeof OBSERVATION_CLOSEST_VARIANTS;

export const isObservationClosestFamily = (
  familyKey: string | null | undefined,
): familyKey is ObservationClosestFamily =>
  Object.prototype.hasOwnProperty.call(
    OBSERVATION_CLOSEST_VARIANTS,
    familyKey ?? '',
  );

export interface ObservationReading {
  familyKey: ObservationClosestFamily;
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
  return { body, at: (i: number) => LANE.x0 + i * cw, cw };
};

// --- the shapes the clutter is made of -------------------------------------

const star = (
  cx: number,
  cy: number,
  r: number,
  fill: string,
  turn = 0,
): string => {
  const points: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const angle = (Math.PI / 5) * i - Math.PI / 2 + turn;
    const reach = i % 2 ? r * 0.46 : r;
    points.push(
      `${round(cx + Math.cos(angle) * reach)},${round(cy + Math.sin(angle) * reach)}`,
    );
  }
  return `<polygon points="${points.join(' ')}" fill="${fill}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`;
};
const triangle = (
  cx: number,
  cy: number,
  r: number,
  fill: string,
  turn = 0,
): string => {
  const points = [0, 1, 2].map((i) => {
    const angle = (Math.PI * 2 * i) / 3 - Math.PI / 2 + turn;
    return `${round(cx + Math.cos(angle) * r)},${round(cy + Math.sin(angle) * r)}`;
  });
  return `<polygon points="${points.join(' ')}" fill="${fill}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`;
};
const disc = (cx: number, cy: number, r: number, fill: string): string =>
  `<circle cx="${round(cx)}" cy="${round(cy)}" r="${round(r)}" fill="${fill}" stroke="${INK}" stroke-width="4"/>`;
const square = (
  cx: number,
  cy: number,
  r: number,
  fill: string,
  turn = 0,
): string =>
  `<rect x="${round(-r)}" y="${round(-r)}" width="${round(r * 2)}" height="${round(r * 2)}" rx="5" fill="${fill}" stroke="${INK}" stroke-width="4" transform="translate(${round(cx)},${round(cy)}) rotate(${round((turn * 180) / Math.PI)})"/>`;

type Draw = (
  cx: number,
  cy: number,
  r: number,
  fill: string,
  turn: number,
) => string;

const KINDS: Record<string, { draw: Draw; ar: string; fill: string }> = {
  stars: { draw: star, ar: 'نجمة', fill: GOLD },
  circles: {
    draw: (cx, cy, r, fill) => disc(cx, cy, r * 0.9, fill),
    ar: 'دائرة',
    fill: '#7FB7E8',
  },
  triangles: { draw: triangle, ar: 'مثلث', fill: '#EFA08F' },
  squares: {
    draw: (cx, cy, r, fill, turn) => square(cx, cy, r * 0.82, fill, turn),
    ar: 'مربع',
    fill: '#9BD18A',
  },
};

// ---------------------------------------------------------------------------
// «كم نجمة؟» — one kind counted among others that overlap it
// ---------------------------------------------------------------------------

const CLUTTER_SETUPS: Record<string, { want: number[]; others: number }> = {
  stars: { want: [9, 11, 13, 15], others: 16 },
  circles: { want: [10, 12, 14, 16], others: 16 },
  triangles: { want: [8, 10, 12, 14], others: 16 },
  squares: { want: [9, 11, 13, 15], others: 16 },
  mixed: { want: [8, 10, 12, 14], others: 22 },
  dense: { want: [14, 16, 18, 20], others: 24 },
};

function composeClutter(seed: string, variantKey: string): ObservationReading {
  const random = seededRandom(`clutter-count:${variantKey}:${seed}`);
  const setup = CLUTTER_SETUPS[variantKey] ?? CLUTTER_SETUPS.stars;
  const value = dealt(seed, setup.want, random);
  const names = Object.keys(KINDS);
  const kindKey =
    variantKey in KINDS
      ? variantKey
      : names[Math.floor(random() * names.length)];
  const kind = KINDS[kindKey];
  const rest = names.filter((name) => name !== kindKey);
  const spots: Array<[number, number, number, number]> = [];
  for (let i = 0; i < value + setup.others; i += 1)
    spots.push([
      150 + random() * 900,
      200 + random() * 380,
      25 + random() * 16,
      random() * Math.PI,
    ]);
  const targets = new Set(
    shuffled(
      spots.map((_, index) => index),
      random,
    ).slice(0, value),
  );
  let body = '';
  spots.forEach(([x, y, size, turn], index) => {
    if (targets.has(index)) body += kind.draw(x, y, size, kind.fill, turn);
    else {
      const other = KINDS[rest[index % rest.length]];
      body += other.draw(x, y, size, other.fill, turn);
    }
  });
  return {
    familyKey: 'clutter-count',
    variantKey,
    variant: `${variantKey}:${kindKey}:${value}`,
    value,
    prompt: `كم ${kind.ar} في الصورة؟`,
    slider: { mode: 'numeric-range', min: 0, max: 30, step: 1, unit: 'شكل' },
    altText: 'أشكال كثيرة متداخلة من أنواع مختلفة',
    concept: 'Count one kind of shape among others that overlap and crowd it.',
    strategy:
      'Sweep the picture in one direction so no shape is counted twice or missed.',
    domainDescription: 'shapes of one kind, 0 to 30',
    factualClaim: `The picture holds ${value} of the ${kindKey} among ${setup.others} other shapes.`,
    svg: frame(text(`كم ${kind.ar} في الصورة؟`, W / 2, 100, 44) + body),
  };
}

// ---------------------------------------------------------------------------
// «كم مربع؟» — every square in a grid, the big ones too
// ---------------------------------------------------------------------------

const GRID_SETUPS: Record<string, Array<[number, number]>> = {
  small: [
    [2, 3],
    [3, 2],
    [2, 4],
    [4, 2],
  ],
  three: [
    [3, 3],
    [2, 5],
    [5, 2],
    [3, 4],
  ],
  wide: [
    [4, 3],
    [2, 6],
    [6, 2],
    [5, 3],
  ],
  four: [
    [4, 4],
    [3, 5],
    [5, 3],
    [4, 3],
  ],
  tall: [
    [2, 5],
    [5, 2],
    [2, 6],
    [6, 2],
  ],
  big: [
    [4, 4],
    [5, 3],
    [3, 5],
    [4, 5],
  ],
};

/** Squares of every size that fit in an n by m grid. */
export const gridSquares = (n: number, m: number): number => {
  let total = 0;
  for (let k = 1; k <= Math.min(n, m); k += 1)
    total += (n - k + 1) * (m - k + 1);
  return total;
};

function composeGrid(seed: string, variantKey: string): ObservationReading {
  const random = seededRandom(`grid-squares:${variantKey}:${seed}`);
  const [n, m] = dealt(
    seed,
    GRID_SETUPS[variantKey] ?? GRID_SETUPS.small,
    random,
  );
  const value = gridSquares(n, m);
  const cell = Math.min(96, Math.floor(700 / n), Math.floor(356 / m));
  const ox = (W - n * cell) / 2;
  const oy = 206 + (356 - m * cell) / 2;
  let body = `<rect x="${round(ox)}" y="${round(oy)}" width="${round(n * cell)}" height="${round(m * cell)}" fill="#FFFFFF"/>`;
  for (let i = 0; i <= n; i += 1)
    body += `<line x1="${round(ox + i * cell)}" y1="${round(oy)}" x2="${round(ox + i * cell)}" y2="${round(oy + m * cell)}" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>`;
  for (let j = 0; j <= m; j += 1)
    body += `<line x1="${round(ox)}" y1="${round(oy + j * cell)}" x2="${round(ox + n * cell)}" y2="${round(oy + j * cell)}" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>`;
  return {
    familyKey: 'grid-squares',
    variantKey,
    variant: `${variantKey}:${n}x${m}`,
    value,
    prompt: 'كم مربع تشوف في الشبكة؟ المربعات الكبيرة محسوبة بعد.',
    slider: { mode: 'numeric-range', min: 0, max: 45, step: 1, unit: 'مربع' },
    altText: 'شبكة خطوط تكوّن مربعات بأحجام مختلفة',
    concept:
      'Count the squares of every size a grid of lines holds, not only the small ones.',
    strategy:
      'Count the small squares, then the two-by-twos, then the bigger ones, and add them.',
    domainDescription: 'squares of every size, 0 to 45',
    factualClaim: `A ${n} by ${m} grid holds ${value} squares counting every size.`,
    svg: frame(
      text('كم مربع تشوف في الشبكة؟', W / 2, 92, 42) +
        text('المربعات الكبيرة محسوبة بعد', W / 2, 146, 32, GREY) +
        body,
    ),
  };
}

// ---------------------------------------------------------------------------
// «كم نقطة حمراء؟» — one colour among another
// ---------------------------------------------------------------------------

const DOT_SETUPS: Record<
  string,
  { reds: number[]; blues: number; clustered: boolean }
> = {
  few: { reds: [9, 12, 15, 18], blues: 22, clustered: false },
  many: { reds: [30, 34, 38, 42], blues: 20, clustered: false },
  clustered: { reds: [16, 20, 24, 28], blues: 24, clustered: true },
  spread: { reds: [14, 18, 22, 26], blues: 26, clustered: false },
  'mostly-red': { reds: [32, 36, 40, 44], blues: 12, clustered: false },
  'mostly-blue': { reds: [10, 13, 16, 19], blues: 42, clustered: false },
};

function composeDots(seed: string, variantKey: string): ObservationReading {
  const random = seededRandom(`dots-estimate:${variantKey}:${seed}`);
  const setup = DOT_SETUPS[variantKey] ?? DOT_SETUPS.few;
  const value = dealt(seed, setup.reds, random);
  const spots: Array<[number, number, boolean]> = [];
  const hubs = [
    [360, 300],
    [760, 420],
    [560, 520],
  ];
  for (let i = 0; i < value + setup.blues; i += 1) {
    const red = i < value;
    if (setup.clustered && red) {
      const [hx, hy] = hubs[i % hubs.length];
      spots.push([
        Math.max(140, Math.min(1060, hx + (random() - 0.5) * 240)),
        Math.max(190, Math.min(590, hy + (random() - 0.5) * 180)),
        red,
      ]);
    } else {
      spots.push([140 + random() * 920, 190 + random() * 400, red]);
    }
  }
  let body = '';
  for (const [x, y, red] of shuffled(spots, random))
    body += disc(x, y, 15, red ? RED : BLUE);
  return {
    familyKey: 'dots-estimate',
    variantKey,
    variant: `${variantKey}:${value}:${setup.blues}`,
    value,
    prompt: 'كم نقطة حمراء في الصورة؟',
    slider: { mode: 'numeric-range', min: 0, max: 60, step: 1, unit: 'نقطة' },
    altText: 'نقاط حمراء وزرقاء منثورة في الصورة',
    concept:
      'Estimate how many dots of one colour are scattered among dots of another.',
    strategy:
      'Count one small patch, then judge how many patches like it the picture holds.',
    domainDescription: 'red dots, 0 to 60',
    factualClaim: `The picture holds ${value} red dots among ${setup.blues} blue ones.`,
    svg: frame(text('كم نقطة حمراء في الصورة؟', W / 2, 100, 44) + body),
  };
}

// ---------------------------------------------------------------------------
// «وين الشكل المختلف؟» — a row with one that is not like the rest
// ---------------------------------------------------------------------------

const ODD_CELLS = 20;

function composeOdd(seed: string, variantKey: string): ObservationReading {
  const random = seededRandom(`odd-one-place:${variantKey}:${seed}`);
  let odd = 2 + Math.floor(random() * (ODD_CELLS - 4));
  for (let guard = 0; guard < 80 && !placeable(odd, ODD_CELLS); guard += 1)
    odd = 2 + Math.floor(random() * (ODD_CELLS - 4));
  if (!placeable(odd, ODD_CELLS)) odd = 4;
  const y = 396;
  const { body, at, cw } = laneStrip(ODD_CELLS, y);
  let shapes = '';
  for (let i = 0; i < ODD_CELLS; i += 1) {
    const cx = at(i) + cw / 2;
    const special = i === odd;
    const fill =
      special && variantKey === 'colour'
        ? '#E8632A'
        : special && variantKey === 'shade'
          ? '#C9972A'
          : GOLD;
    const size = special && variantKey === 'size' ? 24 : 18;
    const turn = special && variantKey === 'turned' ? 0.62 : 0;
    if (special && variantKey === 'gap') continue;
    if (special && variantKey === 'shape') shapes += disc(cx, y, size, fill);
    else shapes += square(cx, y, size, fill, turn);
  }
  return {
    familyKey: 'odd-one-place',
    variantKey,
    variant: `${variantKey}:${odd}`,
    value: odd,
    prompt: 'وحد من الأشكال مختلف عن الباقي. وين هو؟',
    slider: {
      mode: 'between-anchors',
      min: 0,
      max: ODD_CELLS,
      step: 1,
      leftAnchor: 'يسار الصف',
      rightAnchor: 'يمين الصف',
    },
    altText: 'صف أشكال متشابهة وفيه واحد مختلف',
    concept:
      'Find the one shape in a long row that is not like its neighbours.',
    strategy:
      'Sweep the row once and stop where the rhythm of the shapes breaks.',
    domainDescription: 'a place along the row',
    factualClaim: `The ${variantKey} odd one sits at place ${odd} of the row.`,
    svg: frame(
      text('وحد من الأشكال مختلف عن الباقي. وين هو؟', W / 2, 116, 42) +
        body +
        shapes +
        text('يسار الصف', at(0) + 62, y + 106, 28, GREY) +
        text('يمين الصف', at(ODD_CELLS) - 62, y + 106, 28, GREY),
    ),
  };
}

// ---------------------------------------------------------------------------
// «وين يتقاطعون؟» — two lines carried on past where they are drawn
// ---------------------------------------------------------------------------

const MEET_CELLS = 20;
const LINE_SETUPS: Record<
  string,
  { spread: [number, number]; side: 'any' | 'left' | 'right' }
> = {
  shallow: { spread: [210, 280], side: 'any' },
  steep: { spread: [90, 140], side: 'any' },
  narrow: { spread: [110, 160], side: 'any' },
  wide: { spread: [230, 300], side: 'any' },
  left: { spread: [140, 220], side: 'left' },
  right: { spread: [140, 220], side: 'right' },
};

function composeLines(seed: string, variantKey: string): ObservationReading {
  const random = seededRandom(`lines-meet:${variantKey}:${seed}`);
  const setup = LINE_SETUPS[variantKey] ?? LINE_SETUPS.shallow;
  const y = 530;
  const { body, at } = laneStrip(MEET_CELLS, y);
  // Both lines have to start inside the picture, so how far apart they are
  // decides which crossing places are drawable at all. Every pair that fits
  // is collected, so one template still draws more than one picture.
  const fits: Array<[number, number]> = [];
  for (let gap = setup.spread[0]; gap <= setup.spread[1]; gap += 10)
    for (let place = 1; place < MEET_CELLS; place += 1) {
      const apexAt = at(place);
      if (apexAt - gap < 140 || apexAt + gap > W - 140) continue;
      if (!placeable(place, MEET_CELLS)) continue;
      if (setup.side === 'left' && place > MEET_CELLS / 2) continue;
      if (setup.side === 'right' && place < MEET_CELLS / 2) continue;
      fits.push([gap, place]);
    }
  const [spread, meet] = fits.length
    ? fits[Math.floor(random() * fits.length)]
    : [120, setup.side === 'right' ? 14 : 6];
  const topY = 180;
  const baseY = 438;
  const apex = at(meet);
  const drawn = 0.62;
  const line = (fromX: number, colour: string) =>
    `<line x1="${round(fromX)}" y1="${round(baseY)}" x2="${round(fromX + (apex - fromX) * drawn)}" y2="${round(baseY + (topY - baseY) * drawn)}" stroke="${colour}" stroke-width="9" stroke-linecap="round"/>`;
  return {
    familyKey: 'lines-meet',
    variantKey,
    variant: `${variantKey}:${meet}:${spread}`,
    value: meet,
    prompt: 'لو كمّلنا الخطين، وين بيتقاطعون؟',
    slider: {
      mode: 'between-anchors',
      min: 0,
      max: MEET_CELLS,
      step: 1,
      leftAnchor: 'يسار اللوح',
      rightAnchor: 'يمين اللوح',
    },
    altText: 'خطين مايلين تحتهما مسطرة مقسّمة',
    concept:
      'Carry two drawn lines on in the eye and say where they would cross.',
    strategy:
      'Follow the slope of each line past where it stops and see where the two paths meet.',
    domainDescription: 'a place along the board',
    factualClaim: `The two lines, carried on, cross above place ${meet}.`,
    svg: frame(
      text('لو كمّلنا الخطين، وين بيتقاطعون؟', W / 2, 112, 42) +
        line(apex - spread, BLUE) +
        line(apex + spread, RED) +
        body +
        text('يسار اللوح', at(0) + 62, y + 106, 28, GREY) +
        text('يمين اللوح', at(MEET_CELLS) - 62, y + 106, 28, GREY),
    ),
  };
}

export function composeObservationClosest(
  familyKey: ObservationClosestFamily,
  seed: string,
  variantKey?: string,
): ObservationReading {
  const variants = OBSERVATION_CLOSEST_VARIANTS[familyKey] as readonly string[];
  const chosen =
    variantKey && variants.includes(variantKey)
      ? variantKey
      : variants[
          Math.floor(
            seededRandom(`${familyKey}:variant:${seed}`)() * variants.length,
          )
        ];
  switch (familyKey) {
    case 'clutter-count':
      return composeClutter(seed, chosen);
    case 'grid-squares':
      return composeGrid(seed, chosen);
    case 'dots-estimate':
      return composeDots(seed, chosen);
    case 'odd-one-place':
      return composeOdd(seed, chosen);
    default:
      return composeLines(seed, chosen);
  }
}
