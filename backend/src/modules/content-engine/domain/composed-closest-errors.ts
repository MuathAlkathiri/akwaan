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
 * مين أقرب in «اكتشف الخطأ»: five families whose answer is the size of a
 * mistake or the place of one — shapes flipped the wrong way, a total that
 * does not add up, a balance that does not balance, a number that breaks a
 * run, a shadow that disagrees with the sun.
 *
 * The last two answer with a place on a bare line (`between-anchors`), kept
 * clear of the middle fifth and of both ends.
 */
export const ERROR_CLOSEST_VARIANTS = {
  'mirrored-count': ['few', 'some', 'many', 'wide-grid', 'tall-grid', 'dense'],
  'total-off-by': [
    'three-items',
    'four-items',
    'five-items',
    'over',
    'under',
    'big-prices',
  ],
  'balance-missing': [
    'one-each',
    'two-left',
    'two-right',
    'three-blocks',
    'small-gap',
    'big-gap',
  ],
  'pattern-break': [
    'step-two',
    'step-three',
    'step-four',
    'step-five',
    'step-six',
    'countdown',
  ],
  'shadow-break': [
    'sun-left',
    'sun-right',
    'short-row',
    'long-row',
    'near-start',
    'near-end',
  ],
} as const;

export type ErrorClosestFamily = keyof typeof ERROR_CLOSEST_VARIANTS;

export const isErrorClosestFamily = (
  familyKey: string | null | undefined,
): familyKey is ErrorClosestFamily =>
  Object.prototype.hasOwnProperty.call(ERROR_CLOSEST_VARIANTS, familyKey ?? '');

export interface ErrorReading {
  familyKey: ErrorClosestFamily;
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

const RED = '#D8493F';
const GOLD = '#E8B33A';
const GREY = '#6B6558';
const RULE = '#D8D2C4';
const PALE = '#DDF1FB';
const SHADOW = '#9C9486';

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
  let body = `<rect x="${LANE.x0}" y="${round(y - 38)}" width="${round(LANE.x1 - LANE.x0)}" height="76" rx="10" fill="#FFFFFF" stroke="${INK}" stroke-width="6"/>`;
  for (let i = 1; i < cells; i += 1)
    body += `<line x1="${round(LANE.x0 + i * cw)}" y1="${round(y - 38)}" x2="${round(LANE.x0 + i * cw)}" y2="${round(y + 38)}" stroke="${RULE}" stroke-width="3"/>`;
  return { body, at: (i: number) => LANE.x0 + i * cw, cw };
};

/** A shape with no line of symmetry, so a flipped one is plainly flipped. */
const GLYPH = 'M-30,-44 L14,-44 L14,-14 L44,-14 L44,16 L4,16 L4,44 L-30,44 Z';

// ---------------------------------------------------------------------------
// «كم شكل مقلوب؟» — a field of one shape, some of it mirrored
// ---------------------------------------------------------------------------

/**
 * A field too big to count through in the time (owner, 2026-11-28): the
 * team judges the share that faces the wrong way and throws a number.
 */
const MIRROR_SETUPS: Record<
  string,
  { cols: number; rows: number; wrong: number[] }
> = {
  few: { cols: 13, rows: 6, wrong: [14, 18, 22, 26] },
  some: { cols: 13, rows: 6, wrong: [28, 32, 36, 40] },
  many: { cols: 13, rows: 6, wrong: [42, 46, 50, 54] },
  'wide-grid': { cols: 15, rows: 5, wrong: [20, 26, 32, 38] },
  'tall-grid': { cols: 10, rows: 7, wrong: [22, 28, 34, 40] },
  dense: { cols: 14, rows: 7, wrong: [30, 40, 50, 60] },
};

function composeMirrored(seed: string, variantKey: string): ErrorReading {
  const random = seededRandom(`mirrored-count:${variantKey}:${seed}`);
  const setup = MIRROR_SETUPS[variantKey] ?? MIRROR_SETUPS.few;
  const value = dealt(seed, setup.wrong, random);
  const places = setup.cols * setup.rows;
  const flipped = new Set(
    shuffled([...Array(places).keys()], random).slice(0, value),
  );
  const cw = Math.min(150, Math.floor(1040 / setup.cols));
  const ch = Math.min(112, Math.floor(410 / setup.rows));
  const ox = (W - setup.cols * cw) / 2;
  const oy = 186 + (410 - setup.rows * ch) / 2;
  const scale = Math.min(0.82, (cw / 150) * 0.82, (ch / 112) * 0.82);
  let body = '';
  for (let i = 0; i < places; i += 1) {
    const cx = ox + (i % setup.cols) * cw + cw / 2;
    const cy = oy + Math.floor(i / setup.cols) * ch + ch / 2;
    const flip = flipped.has(i) ? ' scale(-1,1)' : '';
    body += `<g transform="translate(${round(cx)},${round(cy)}) scale(${round(scale)})${flip}"><path d="${GLYPH}" fill="${PALE}" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/></g>`;
  }
  return {
    familyKey: 'mirrored-count',
    variantKey,
    variant: `${variantKey}:${value}`,
    value,
    prompt: 'كم شكل تقريبًا مقلوب عكس الباقي؟',
    slider: { mode: 'numeric-range', min: 0, max: 80, step: 1, unit: 'شكل' },
    altText: 'شبكة من نفس الشكل، وبعضها معكوس',
    concept: 'Guess how many shapes of a crowded field are drawn mirrored.',
    strategy:
      'Fix the right way round in mind, judge one row, then reckon for the rest.',
    domainDescription: 'mirrored shapes, 0 to 80',
    factualClaim: `${value} of the ${places} shapes are drawn mirrored.`,
    svg: frame(text('كم شكل تقريبًا مقلوب عكس الباقي؟', W / 2, 104, 42) + body),
  };
}

// ---------------------------------------------------------------------------
// «الحساب غلطان بكم؟» — a till slip whose total does not add up
// ---------------------------------------------------------------------------

const TOTAL_SETUPS: Record<
  string,
  { items: number; price: [number, number]; off: number[]; over?: boolean }
> = {
  'three-items': { items: 3, price: [6, 24], off: [2, 3, 4, 5, 6] },
  'four-items': { items: 4, price: [5, 22], off: [3, 4, 6, 7, 8] },
  'five-items': { items: 5, price: [4, 18], off: [2, 5, 7, 9, 11] },
  over: { items: 4, price: [6, 20], off: [4, 6, 8, 10], over: true },
  under: { items: 4, price: [6, 20], off: [3, 5, 7, 9], over: false },
  'big-prices': { items: 3, price: [20, 48], off: [5, 8, 11, 14] },
};

function composeTotal(seed: string, variantKey: string): ErrorReading {
  const random = seededRandom(`total-off-by:${variantKey}:${seed}`);
  const setup = TOTAL_SETUPS[variantKey] ?? TOTAL_SETUPS['three-items'];
  const value = dealt(seed, setup.off, random);
  const prices = Array.from(
    { length: setup.items },
    () =>
      setup.price[0] +
      Math.floor(random() * (setup.price[1] - setup.price[0] + 1)),
  );
  const real = prices.reduce((sum, price) => sum + price, 0);
  const over = setup.over ?? random() < 0.5;
  const shown = over ? real + value : real - value;
  const names = ['أ', 'ب', 'ج', 'د', 'هـ'];
  const x0 = 330;
  const y0 = 170;
  const width = 540;
  let body = `<rect x="${x0}" y="${y0}" width="${width}" height="${round(136 + prices.length * 62)}" rx="16" fill="#FFFFFF" stroke="${INK}" stroke-width="7"/>`;
  prices.forEach((price, index) => {
    const y = y0 + 58 + index * 62;
    body +=
      text(`صنف ${names[index]}`, x0 + 140, y, 34, GREY) +
      text(`${price}`, x0 + width - 110, y, 36);
  });
  const totalY = y0 + 84 + prices.length * 62;
  body +=
    `<line x1="${x0 + 40}" y1="${round(totalY - 50)}" x2="${x0 + width - 40}" y2="${round(totalY - 50)}" stroke="${INK}" stroke-width="5"/>` +
    text('المجموع', x0 + 140, totalY, 34, RED) +
    text(`${shown}`, x0 + width - 110, totalY, 40, RED);
  return {
    familyKey: 'total-off-by',
    variantKey,
    variant: `${variantKey}:${prices.join('-')}:${shown}`,
    value,
    prompt: 'المجموع المكتوب غلط. غلطان بكم؟',
    slider: { mode: 'numeric-range', min: 0, max: 20, step: 1, unit: 'ريال' },
    altText: 'فاتورة فيها أصناف وأسعار ومجموع مكتوب',
    concept:
      'Add a short bill and say how far the written total is from the right one.',
    strategy:
      'Add the prices yourself, then take the written total away from what you got.',
    domainDescription: 'riyals the total is out by, 0 to 20',
    factualClaim: `The prices come to ${real} while the slip says ${shown}: out by ${value}.`,
    svg: frame(text('المجموع المكتوب غلط. غلطان بكم؟', W / 2, 112, 42) + body),
  };
}

// ---------------------------------------------------------------------------
// «كم ناقص عشان يتعادل؟» — two pans that do not agree
// ---------------------------------------------------------------------------

const BALANCE_SETUPS: Record<
  string,
  { left: number; right: number; gap: [number, number] }
> = {
  'one-each': { left: 1, right: 1, gap: [2, 7] },
  'two-left': { left: 2, right: 1, gap: [3, 9] },
  'two-right': { left: 1, right: 2, gap: [3, 9] },
  'three-blocks': { left: 2, right: 2, gap: [2, 8] },
  'small-gap': { left: 2, right: 2, gap: [2, 4] },
  'big-gap': { left: 2, right: 1, gap: [9, 14] },
};

function composeBalance(seed: string, variantKey: string): ErrorReading {
  const random = seededRandom(`balance-missing:${variantKey}:${seed}`);
  const setup = BALANCE_SETUPS[variantKey] ?? BALANCE_SETUPS['one-each'];
  const value =
    setup.gap[0] + Math.floor(random() * (setup.gap[1] - setup.gap[0] + 1));
  const load = (howMany: number, total: number): number[] => {
    const parts: number[] = [];
    let left = total;
    for (let i = 0; i < howMany - 1; i += 1) {
      const take = Math.max(
        1,
        Math.min(left - (howMany - 1 - i), 2 + Math.floor(random() * 7)),
      );
      parts.push(take);
      left -= take;
    }
    parts.push(Math.max(1, left));
    return parts;
  };
  const lighter = 5 + Math.floor(random() * 9);
  const heavier = lighter + value;
  const heavyLeft = random() < 0.5;
  const leftLoads = load(setup.left, heavyLeft ? heavier : lighter);
  const rightLoads = load(setup.right, heavyLeft ? lighter : heavier);
  const leftTotal = leftLoads.reduce((sum, one) => sum + one, 0);
  const rightTotal = rightLoads.reduce((sum, one) => sum + one, 0);
  const tilt = leftTotal > rightTotal ? 7 : -7;
  const cy = 430;
  const armWidth = 760;
  const pan = (cx: number, loads: number[]): string => {
    let body =
      `<path d="M${round(cx - 110)} ${round(cy + 36)} L${round(cx + 110)} ${round(cy + 36)} L${round(cx + 80)} ${round(cy + 96)} L${round(cx - 80)} ${round(cy + 96)}Z" fill="#FFFFFF" stroke="${INK}" stroke-width="6"/>` +
      `<line x1="${round(cx)}" y1="${round(cy)}" x2="${round(cx)}" y2="${round(cy + 36)}" stroke="${INK}" stroke-width="6"/>`;
    loads.forEach((one, index) => {
      const size = 46 + one * 9;
      const spot = cx - (loads.length * 70) / 2 + index * 70 + 35;
      body +=
        `<rect x="${round(spot - size / 2)}" y="${round(cy + 30 - size)}" width="${round(size)}" height="${round(size)}" rx="8" fill="${GOLD}" stroke="${INK}" stroke-width="5"/>` +
        text(`${one}`, spot, cy + 30 - size / 2 + 11, 28);
    });
    return body;
  };
  const body =
    `<path d="M${W / 2} ${cy} L${W / 2 - 70} ${cy + 180} L${W / 2 + 70} ${cy + 180}Z" fill="#FFFFFF" stroke="${INK}" stroke-width="7"/>` +
    `<g transform="rotate(${tilt} ${W / 2} ${cy})">` +
    `<line x1="${W / 2 - armWidth / 2}" y1="${cy}" x2="${W / 2 + armWidth / 2}" y2="${cy}" stroke="${INK}" stroke-width="12" stroke-linecap="round"/>` +
    pan(W / 2 - armWidth / 2 + 60, leftLoads) +
    pan(W / 2 + armWidth / 2 - 60, rightLoads) +
    `</g>`;
  return {
    familyKey: 'balance-missing',
    variantKey,
    variant: `${variantKey}:${leftLoads.join('-')}:${rightLoads.join('-')}`,
    value: Math.abs(leftTotal - rightTotal),
    prompt: 'كم كيلو ناقص على الكفة الخفيفة عشان يتعادل الميزان؟',
    slider: { mode: 'numeric-range', min: 0, max: 20, step: 1, unit: 'كيلو' },
    altText: 'ميزان بكفتين مايل، وعلى كل كفة صناديق أوزانها مكتوبة',
    concept: 'Say how much the light pan of a tilted balance is short by.',
    strategy:
      'Add each pan up and take the smaller total away from the bigger.',
    domainDescription: 'kilos the light pan is short, 0 to 20',
    factualClaim: `${leftTotal} against ${rightTotal}: the light pan is ${Math.abs(leftTotal - rightTotal)} short.`,
    svg: frame(
      text(
        'كم كيلو ناقص على الكفة الخفيفة عشان يتعادل الميزان؟',
        W / 2,
        100,
        38,
      ) + body,
    ),
  };
}

// ---------------------------------------------------------------------------
// «وين انكسر النمط؟» — a run of numbers with one wrong
// ---------------------------------------------------------------------------

const PATTERN_CELLS = 14;
const PATTERN_STEPS: Record<string, number[]> = {
  'step-two': [2],
  'step-three': [3],
  'step-four': [4],
  'step-five': [5],
  'step-six': [6],
  countdown: [-4, -5, -6],
};

/** The place the run breaks, clear of the middle fifth and of both ends. */
export function brokenPlaces(): number[] {
  const places: number[] = [];
  for (let place = 2; place < PATTERN_CELLS - 1; place += 1)
    if (placeable(place, PATTERN_CELLS)) places.push(place);
  return places;
}

function composePattern(seed: string, variantKey: string): ErrorReading {
  const random = seededRandom(`pattern-break:${variantKey}:${seed}`);
  const step = dealt(
    seed,
    PATTERN_STEPS[variantKey] ?? PATTERN_STEPS['step-two'],
    random,
  );
  const broken = dealt(seed, brokenPlaces(), random);
  const first =
    step > 0
      ? 3 + Math.floor(random() * 7)
      : 4 + Math.abs(step) * PATTERN_CELLS + Math.floor(random() * 7);
  // A wrong number that neither repeats a neighbour nor keeps the run.
  const drift = [-2, -1, 1, 2][Math.floor(random() * 4)];
  const y = 400;
  const { body, at, cw } = laneStrip(PATTERN_CELLS, y);
  let numbers = '';
  for (let i = 0; i < PATTERN_CELLS; i += 1) {
    const right = first + i * step;
    const shown = i === broken ? right + drift : right;
    numbers += text(`${shown}`, at(i) + cw / 2, y + 12, 30);
  }
  return {
    familyKey: 'pattern-break',
    variantKey,
    variant: `${variantKey}:${first}:${step}:${broken}`,
    value: broken,
    prompt: 'الأرقام ماشية على نمط، ورقم واحد كسره. وين هو؟',
    slider: {
      mode: 'between-anchors',
      min: 0,
      max: PATTERN_CELLS,
      step: 1,
      leftAnchor: 'أول الصف',
      rightAnchor: 'آخر الصف',
    },
    altText: 'صف أرقام ماشي على نمط وفيه رقم مكسور',
    concept:
      'Find the one number in a run that does not follow the run’s own step.',
    strategy:
      'Work out the step from the first few numbers, then read along until one misses it.',
    domainDescription: 'a place along the run of numbers',
    factualClaim: `The run starts at ${first} with step ${step}; place ${broken} is out by ${drift}.`,
    svg: frame(
      text('الأرقام ماشية على نمط، ورقم واحد كسره. وين هو؟', W / 2, 116, 40) +
        body +
        numbers +
        text('أول الصف', at(0) + 56, y + 110, 28, GREY) +
        text('آخر الصف', at(PATTERN_CELLS) - 56, y + 110, 28, GREY),
    ),
  };
}

// ---------------------------------------------------------------------------
// «وين الظل الغلط؟» — one shadow against the sun
// ---------------------------------------------------------------------------

const SHADOW_SETUPS: Record<
  string,
  { cells: number; sunLeft: boolean; side: 'any' | 'left' | 'right' }
> = {
  'sun-left': { cells: 14, sunLeft: true, side: 'any' },
  'sun-right': { cells: 14, sunLeft: false, side: 'any' },
  'short-row': { cells: 11, sunLeft: true, side: 'any' },
  'long-row': { cells: 16, sunLeft: false, side: 'any' },
  'near-start': { cells: 14, sunLeft: true, side: 'left' },
  'near-end': { cells: 14, sunLeft: false, side: 'right' },
};

function composeShadow(seed: string, variantKey: string): ErrorReading {
  const random = seededRandom(`shadow-break:${variantKey}:${seed}`);
  const setup = SHADOW_SETUPS[variantKey] ?? SHADOW_SETUPS['sun-left'];
  const { cells } = setup;
  // Every place the wrong shadow may fall, so a batch walks them instead of
  // landing twice on one by chance.
  const places: number[] = [];
  for (let place = 1; place < cells; place += 1) {
    if (!placeable(place, cells)) continue;
    if (setup.side === 'left' && place > cells / 2) continue;
    if (setup.side === 'right' && place < cells / 2) continue;
    places.push(place);
  }
  const wrong = places.length ? dealt(seed, places, random) : 2;
  const y = 410;
  const { body, at, cw } = laneStrip(cells, y);
  const away = setup.sunLeft ? 1 : -1;
  let items = '';
  for (let i = 0; i < cells; i += 1) {
    const cx = at(i) + cw / 2;
    const dir = i === wrong ? -away : away;
    items +=
      `<path d="M${round(cx)} ${round(y + 30)} L${round(cx + dir * 54)} ${round(y + 36)} L${round(cx + dir * 48)} ${round(y + 10)} L${round(cx)} ${round(y + 4)}Z" fill="${SHADOW}"/>` +
      `<rect x="${round(cx - 19)}" y="${round(y - 30)}" width="38" height="56" rx="6" fill="${GOLD}" stroke="${INK}" stroke-width="5"/>`;
  }
  const sunX = setup.sunLeft ? 210 : W - 210;
  const sun =
    `<circle cx="${sunX}" cy="200" r="40" fill="${GOLD}" stroke="${INK}" stroke-width="6"/>` +
    text('الشمس', sunX, 278, 26, GREY);
  return {
    familyKey: 'shadow-break',
    variantKey,
    variant: `${variantKey}:${wrong}`,
    value: wrong,
    prompt: 'ظل واحد مخالف لاتجاه الشمس. وين هو؟',
    slider: {
      mode: 'between-anchors',
      min: 0,
      max: cells,
      step: 1,
      leftAnchor: 'يسار الصف',
      rightAnchor: 'يمين الصف',
    },
    altText: 'صف أشياء وظلالها، والشمس مرسومة على طرف',
    concept:
      'Find the one shadow in a row that falls the wrong way for the drawn sun.',
    strategy:
      'The sun throws every shadow away from itself: look for the one that leans back.',
    domainDescription: 'a place along the row',
    factualClaim: `With the sun on the ${setup.sunLeft ? 'left' : 'right'}, place ${wrong} casts its shadow the wrong way.`,
    svg: frame(
      text('ظل واحد مخالف لاتجاه الشمس. وين هو؟', W / 2, 112, 42) +
        sun +
        body +
        items +
        text('يسار الصف', at(0) + 56, y + 114, 28, GREY) +
        text('يمين الصف', at(cells) - 56, y + 114, 28, GREY),
    ),
  };
}

export function composeErrorClosest(
  familyKey: ErrorClosestFamily,
  seed: string,
  variantKey?: string,
): ErrorReading {
  const variants = ERROR_CLOSEST_VARIANTS[familyKey] as readonly string[];
  const chosen =
    variantKey && variants.includes(variantKey)
      ? variantKey
      : variants[
          Math.floor(
            seededRandom(`${familyKey}:variant:${seed}`)() * variants.length,
          )
        ];
  switch (familyKey) {
    case 'mirrored-count':
      return composeMirrored(seed, chosen);
    case 'total-off-by':
      return composeTotal(seed, chosen);
    case 'balance-missing':
      return composeBalance(seed, chosen);
    case 'pattern-break':
      return composePattern(seed, chosen);
    default:
      return composeShadow(seed, chosen);
  }
}
