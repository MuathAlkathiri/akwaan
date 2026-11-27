import {
  GOLD,
  INK,
  PUZZLE_FONT_FAMILY,
  W,
  frame,
  round,
  seededRandom,
  shuffled,
} from './composed-kit';
import { ClosestSlider, dealt, placeable } from './composed-closest-paths';
import { LETTER_WORDS } from './composed-letters';

/**
 * مين أقرب in «الكلمات والحروف»: four families the engine writes for itself —
 * the word in a row that breaks the rule, how many cards survive a pair of
 * conditions, how many walks across a grid spell a word, and how many listed
 * words a set of letter columns can build.
 *
 * Counting templates were tried here and taken out again (owner, 2026-11-28):
 * counting the letters of a sentence, or how often a letter turns up in it,
 * is a chore against the clock rather than a puzzle. The three families added
 * the same day (owner's own sketches) are counts too, but of things too many
 * to count in the time given — so the answer has to be judged, not tallied.
 */
export const WORD_CLOSEST_VARIANTS = {
  'odd-word-place': [
    'same-last',
    'same-first',
    'same-length',
    'has-letter',
    'dotless',
    'dotted',
  ],
  'survivor-words': [
    'has-not',
    'has-either',
    'length-has',
    'length-not',
    'starts-group',
    'ends-group',
  ],
  'word-paths': [
    'grid-five',
    'grid-six',
    'grid-wide',
    'grid-big',
    'grid-tall',
    'with-fillers',
  ],
  'column-words': [
    'three-columns',
    'wide-columns',
    'four-columns',
    'short-columns',
    'long-list',
    'tight-list',
  ],
} as const;

export type WordClosestFamily = keyof typeof WORD_CLOSEST_VARIANTS;

export const isWordClosestFamily = (
  familyKey: string | null | undefined,
): familyKey is WordClosestFamily =>
  Object.prototype.hasOwnProperty.call(WORD_CLOSEST_VARIANTS, familyKey ?? '');

export interface WordReading {
  familyKey: WordClosestFamily;
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

const GREY = '#6B6558';
const RULE = '#D8D2C4';
const PALE = '#DDF1FB';

const cross = <A, B>(
  first: readonly A[],
  second: readonly B[],
): Array<[A, B]> =>
  first.flatMap((one) => second.map((two) => [one, two] as [A, B]));

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
  let body = `<rect x="${LANE.x0}" y="${round(y - 40)}" width="${round(LANE.x1 - LANE.x0)}" height="80" rx="10" fill="#FFFFFF" stroke="${INK}" stroke-width="6"/>`;
  for (let i = 1; i < cells; i += 1)
    body += `<line x1="${round(LANE.x0 + i * cw)}" y1="${round(y - 40)}" x2="${round(LANE.x0 + i * cw)}" y2="${round(y + 40)}" stroke="${RULE}" stroke-width="3"/>`;
  return { body, at: (i: number) => LANE.x0 + i * cw, cw };
};

/** Letters that carry at least one dot, for the dotted/dotless rules. */
const DOTTED = new Set('بتثجخذزشضظغفقنية'.split(''));
export const hasDots = (word: string): boolean =>
  word.split('').some((letter) => DOTTED.has(letter));

// ---------------------------------------------------------------------------
// «وين الكلمة الغريبة؟» — a row on one rule, with one word off it
// ---------------------------------------------------------------------------

/**
 * Ten places, not more: a rule like «كلها تبدأ بنفس الحرف» has only ten or
 * so words in the list to keep it, and a row longer than the rule can fill
 * would quietly fall back to words that keep no rule at all.
 */
const ODD_CELLS = 10;

interface Rule {
  ar: string;
  keeps: (word: string, mark: string) => boolean;
  marks: () => string[];
}

const RULES: Record<string, Rule> = {
  'same-last': {
    ar: 'كلها تنتهي بنفس الحرف إلا وحدة',
    keeps: (word, mark) => word.endsWith(mark),
    marks: () => ['ر', 'ب', 'م', 'ل'],
  },
  'same-first': {
    ar: 'كلها تبدأ بنفس الحرف إلا وحدة',
    keeps: (word, mark) => word.startsWith(mark),
    marks: () => ['م', 'ح'],
  },
  'same-length': {
    ar: 'كلها بنفس عدد الحروف إلا وحدة',
    keeps: (word, mark) => word.length === Number(mark),
    marks: () => ['3', '4'],
  },
  'has-letter': {
    ar: 'كلها فيها نفس الحرف إلا وحدة',
    keeps: (word, mark) => word.includes(mark),
    marks: () => ['ر', 'م', 'ب', 'ل'],
  },
  dotless: {
    ar: 'كلها بدون نقط إلا وحدة',
    keeps: (word) => !hasDots(word),
    marks: () => ['-'],
  },
  dotted: {
    ar: 'كلها فيها نقط إلا وحدة',
    keeps: (word) => hasDots(word),
    marks: () => ['-'],
  },
};

function composeOddWord(seed: string, variantKey: string): WordReading {
  const random = seededRandom(`odd-word-place:${variantKey}:${seed}`);
  const rule = RULES[variantKey] ?? RULES['same-last'];
  let mark = rule.marks()[0];
  let keep: string[] = [];
  let breakers: string[] = [];
  for (const candidate of shuffled(rule.marks(), random)) {
    const kept = LETTER_WORDS.filter((word) => rule.keeps(word, candidate));
    const broke = LETTER_WORDS.filter((word) => !rule.keeps(word, candidate));
    if (kept.length >= ODD_CELLS - 1 && broke.length >= 1) {
      mark = candidate;
      keep = shuffled(kept, random).slice(0, ODD_CELLS - 1);
      breakers = shuffled(broke, random);
      break;
    }
  }
  if (keep.length < ODD_CELLS - 1 || !breakers.length)
    throw new Error(`odd-word-place: no mark fills ${variantKey}`);
  const places: number[] = [];
  for (let place = 1; place < ODD_CELLS; place += 1)
    if (placeable(place, ODD_CELLS)) places.push(place);
  const odd = dealt(seed, places, random);
  const row = [...keep];
  row.splice(odd, 0, breakers[0]);
  const y = 404;
  const { body, at, cw } = laneStrip(ODD_CELLS, y);
  const words = row
    .map((word, index) => text(word, at(index) + cw / 2, y + 13, 32))
    .join('');
  return {
    familyKey: 'odd-word-place',
    variantKey,
    variant: `${variantKey}:${mark}:${odd}:${row[odd]}`,
    value: odd,
    prompt: 'كل الكلمات تتبع قاعدة وحدة إلا كلمة. وين هي؟',
    slider: {
      mode: 'between-anchors',
      min: 0,
      max: ODD_CELLS,
      step: 1,
      leftAnchor: 'أول الصف',
      rightAnchor: 'آخر الصف',
    },
    altText: 'صف كلمات عربية في مربعات',
    concept:
      'Find the one word in a row that does not keep the rule the rest share.',
    strategy:
      'Work the rule out from the first few words, then read on until one misses it.',
    domainDescription: 'a place along the row of words',
    factualClaim: `«${row[odd]}» at place ${odd} breaks the rule: ${variantKey}.`,
    svg: frame(
      text('كل الكلمات تتبع قاعدة وحدة إلا كلمة. وين هي؟', W / 2, 116, 42) +
        text(rule.ar, W / 2, 176, 30, GREY) +
        body +
        words +
        text('أول الصف', at(0) + 56, y + 116, 28, GREY) +
        text('آخر الصف', at(ODD_CELLS) - 56, y + 116, 28, GREY),
    ),
  };
}

// ---------------------------------------------------------------------------
// «كم كلمة نجت؟» — a pair of conditions over a wall of cards
// ---------------------------------------------------------------------------

/** Letter names, so a condition reads «فيها حرف الراء» and not «فيها حرف ر». */
const LETTER_NAMES: Record<string, string> = {
  ا: 'الألف',
  ب: 'الباء',
  ت: 'التاء',
  ث: 'الثاء',
  ج: 'الجيم',
  ح: 'الحاء',
  خ: 'الخاء',
  د: 'الدال',
  ذ: 'الذال',
  ر: 'الراء',
  ز: 'الزاي',
  س: 'السين',
  ش: 'الشين',
  ص: 'الصاد',
  ض: 'الضاد',
  ط: 'الطاء',
  ظ: 'الظاء',
  ع: 'العين',
  غ: 'الغين',
  ف: 'الفاء',
  ق: 'القاف',
  ك: 'الكاف',
  ل: 'اللام',
  م: 'الميم',
  ن: 'النون',
  ه: 'الهاء',
  و: 'الواو',
  ي: 'الياء',
};

const named = (letters: readonly string[]): string =>
  letters.map((letter) => LETTER_NAMES[letter]).join(' أو ');

const SURVIVOR_CARDS = 45;
const SURVIVOR_COLS = 9;

/** What the wall asks of a card, and how many of them should pass. */
interface Survivor {
  ar: string;
  /** The ask in letters, so a test can rebuild it without reading Arabic. */
  code: string;
  keeps: (word: string) => boolean;
  low: number;
  high: number;
}

const WIDE = ['ر', 'م', 'ل', 'ب'] as const;
const NARROW = ['د', 'ت', 'ق', 'ك', 'ج', 'ع', 'ف'] as const;

function survivorAsks(variantKey: string, random: () => number): Survivor[] {
  const wide = shuffled(WIDE, random);
  const narrow = shuffled(NARROW, random);
  const lengths = shuffled([3, 4], random);
  const starts = shuffled(['م', 'ح', 'ق', 'ك', 'ب', 'س'], random);
  const ends = shuffled(['ر', 'م', 'ل', 'ب'], random);
  switch (variantKey) {
    case 'has-either':
      return cross(wide, wide)
        .filter(([one, two]) => one !== two)
        .map(([one, two]) => ({
          ar: `فيها حرف ${named([one, two])}`,
          code: `${one}|${two}`,
          keeps: (word: string) => word.includes(one) || word.includes(two),
          low: 16,
          high: 30,
        }));
    case 'length-has':
      return cross(lengths, wide).map(([length, one]) => ({
        ar: `طولها ${length} حروف وفيها حرف ${LETTER_NAMES[one]}`,
        code: `${length}|${one}`,
        keeps: (word: string) => word.length === length && word.includes(one),
        low: 6,
        high: 16,
      }));
    case 'length-not':
      return cross(lengths, narrow).map(([length, one]) => ({
        ar: `طولها ${length} حروف وما فيها حرف ${LETTER_NAMES[one]}`,
        code: `${length}|${one}`,
        keeps: (word: string) => word.length === length && !word.includes(one),
        low: 13,
        high: 28,
      }));
    case 'starts-group':
      return [starts.slice(0, 3), starts.slice(1, 4), starts.slice(2, 5)].map(
        (group) => ({
          ar: `تبدأ بحرف ${named(group)}`,
          code: group.join('|'),
          keeps: (word: string) => group.includes(word[0]),
          low: 7,
          high: 18,
        }),
      );
    case 'ends-group':
      return [ends.slice(0, 3), ends.slice(1, 4), [ends[0], ends[2]]].map(
        (group) => ({
          ar: `تنتهي بحرف ${named(group)}`,
          code: group.join('|'),
          keeps: (word: string) => group.includes(word[word.length - 1]),
          low: 10,
          high: 24,
        }),
      );
    default:
      return cross(wide, narrow).map(([one, two]) => ({
        ar: `فيها حرف ${LETTER_NAMES[one]} وما فيها حرف ${LETTER_NAMES[two]}`,
        code: `${one}|${two}`,
        keeps: (word: string) => word.includes(one) && !word.includes(two),
        low: 9,
        high: 20,
      }));
  }
}

/**
 * The wall is dealt to the answer, not the answer read off the wall: the
 * engine picks how many cards should survive, then deals exactly that many
 * passing cards among failing ones. Every card is a real word either way, and
 * a wall whose count was left to chance would sit at the same number all day.
 */
function composeSurvivors(seed: string, variantKey: string): WordReading {
  const random = seededRandom(`survivor-words:${variantKey}:${seed}`);
  const asks = survivorAsks(variantKey, random);
  let built: { ask: Survivor; cards: string[]; value: number } | null = null;
  for (const ask of shuffled(asks, random)) {
    const live = LETTER_WORDS.filter((word) => ask.keeps(word));
    const dead = LETTER_WORDS.filter((word) => !ask.keeps(word));
    const wants: number[] = [];
    for (let count = ask.low; count <= ask.high; count += 1)
      if (count <= live.length && SURVIVOR_CARDS - count <= dead.length)
        wants.push(count);
    if (!wants.length) continue;
    const value = dealt(seed, wants, random);
    built = {
      ask,
      value,
      cards: shuffled(
        [
          ...shuffled(live, random).slice(0, value),
          ...shuffled(dead, random).slice(0, SURVIVOR_CARDS - value),
        ],
        random,
      ),
    };
    break;
  }
  if (!built) throw new Error(`survivor-words: no ask fills ${variantKey}`);
  const { ask, cards, value } = built;
  const cw = 118;
  const ch = 74;
  const ox = (W - SURVIVOR_COLS * cw) / 2;
  const oy = 232;
  let body = '';
  cards.forEach((word, index) => {
    const x = ox + (index % SURVIVOR_COLS) * cw;
    const y = oy + Math.floor(index / SURVIVOR_COLS) * ch;
    body += `<rect x="${round(x + 4)}" y="${round(y + 4)}" width="${cw - 8}" height="${ch - 8}" rx="10" fill="#FFFFFF" stroke="${INK}" stroke-width="3"/>`;
    body += text(word, x + cw / 2, y + ch / 2 + 9, 26);
  });
  return {
    familyKey: 'survivor-words',
    variantKey,
    variant: `${variantKey}:${ask.code}:${value}`,
    value,
    prompt: 'كم بطاقة من الحيطة تنجو من الشرط؟',
    slider: {
      mode: 'numeric-range',
      min: 0,
      max: SURVIVOR_CARDS,
      step: 1,
      unit: 'كلمة',
    },
    altText: 'حيطة بطاقات كلمات عربية',
    concept: 'Guess how many of a wall of word cards pass the condition.',
    strategy:
      'Read a handful of cards, judge what share of them passes, and scale it up.',
    domainDescription: `a count of surviving cards out of ${SURVIVOR_CARDS}`,
    factualClaim: `${value} of the ${SURVIVOR_CARDS} cards are ${ask.ar}.`,
    svg: frame(
      text(`كم كلمة ${ask.ar}؟`, W / 2, 104, ask.ar.length > 34 ? 34 : 40) +
        text('تقريبًا — ما يلزم تعدّها كلها', W / 2, 160, 28, GREY) +
        body,
    ),
  };
}

// ---------------------------------------------------------------------------
// «كم طريق للكلمة؟» — walks across a grid of letters, counted by search
// ---------------------------------------------------------------------------

const PATH_FILLERS = 'هوطعصنكدفخزث'.split('');

/**
 * A three-letter word on a grid of its own three letters: the walks run into
 * the twenties, which is far past tracing them one by one inside the clock.
 * Mixing fillers in cuts the count down, so the bigger boards stay pure.
 */
export const PATH_SHAPES: Record<
  string,
  {
    rows: number;
    cols: number;
    share: number;
    max: number;
    low: number;
    high: number;
  }
> = {
  'grid-five': { rows: 5, cols: 6, share: 0.95, max: 25, low: 4, high: 16 },
  'grid-six': { rows: 6, cols: 6, share: 1, max: 30, low: 6, high: 19 },
  'grid-wide': { rows: 6, cols: 7, share: 1, max: 35, low: 8, high: 23 },
  'grid-big': { rows: 7, cols: 7, share: 1, max: 40, low: 10, high: 28 },
  // 6×7 and 7×6 at the same share draw the same board turned on its side,
  // so the tall one keeps a few fillers to make it a board of its own.
  'grid-tall': { rows: 7, cols: 6, share: 0.94, max: 35, low: 7, high: 21 },
  'with-fillers': { rows: 6, cols: 6, share: 0.88, max: 30, low: 4, high: 17 },
};

/**
 * Every walk across touching cells that spells the word, no cell used twice.
 * The engine counts them itself, so the answer is never written down.
 */
export function wordPaths(grid: readonly string[][], word: string): number {
  const rows = grid.length;
  const cols = grid[0].length;
  let total = 0;
  const walk = (
    row: number,
    col: number,
    step: number,
    used: Set<string>,
  ): void => {
    if (grid[row][col] !== word[step]) return;
    if (step === word.length - 1) {
      total += 1;
      return;
    }
    used.add(`${row},${col}`);
    for (const [dr, dc] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nextRow = row + dr;
      const nextCol = col + dc;
      if (
        nextRow < 0 ||
        nextCol < 0 ||
        nextRow >= rows ||
        nextCol >= cols ||
        used.has(`${nextRow},${nextCol}`)
      )
        continue;
      walk(nextRow, nextCol, step + 1, used);
    }
    used.delete(`${row},${col}`);
  };
  for (let row = 0; row < rows; row += 1)
    for (let col = 0; col < cols; col += 1) walk(row, col, 0, new Set());
  return total;
}

/**
 * The count cannot be planted the way a wall of cards can — it falls out of
 * the board — so the engine aims at a number and keeps the closest board it
 * drew, which spreads the answers instead of parking them on one value.
 */
function composePaths(seed: string, variantKey: string): WordReading {
  const shape = PATH_SHAPES[variantKey] ?? PATH_SHAPES['grid-six'];
  const random = seededRandom(`word-paths:${variantKey}:${seed}`);
  // A repeated letter would fill the board with two letters and read as noise.
  const words = LETTER_WORDS.filter(
    (word) => word.length === 3 && new Set(word.split('')).size === 3,
  );
  const aims: number[] = [];
  for (let aim = shape.low; aim <= shape.high; aim += 1) aims.push(aim);
  const target = dealt(seed, aims, random);
  let best: { word: string; grid: string[][]; value: number } | null = null;
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const word = words[Math.floor(random() * words.length)];
    const letters = word.split('');
    const fillers = PATH_FILLERS.filter((one) => !letters.includes(one));
    const grid: string[][] = [];
    for (let row = 0; row < shape.rows; row += 1) {
      const line: string[] = [];
      for (let col = 0; col < shape.cols; col += 1)
        line.push(
          random() < shape.share
            ? letters[Math.floor(random() * letters.length)]
            : fillers[Math.floor(random() * fillers.length)],
        );
      grid.push(line);
    }
    const value = wordPaths(grid, word);
    if (value < 1 || value > shape.max) continue;
    if (!best || Math.abs(value - target) < Math.abs(best.value - target))
      best = { word, grid, value };
    if (best.value === target) break;
  }
  if (!best) throw new Error(`word-paths: no board fills ${variantKey}`);
  const { word, grid, value } = best;
  const ch = Math.min(88, Math.round(400 / shape.rows));
  const cw = Math.min(120, Math.round(980 / shape.cols));
  const ox = (W - shape.cols * cw) / 2;
  const oy = 244;
  let body = '';
  grid.forEach((line, row) =>
    line.forEach((letter, col) => {
      const x = ox + col * cw;
      const y = oy + row * ch;
      body += `<rect x="${round(x + 4)}" y="${round(y + 4)}" width="${round(cw - 8)}" height="${round(ch - 8)}" rx="10" fill="${PALE}" stroke="${INK}" stroke-width="3"/>`;
      body += text(
        letter,
        x + cw / 2,
        y + ch / 2 + Math.round(ch * 0.16),
        Math.round(ch * 0.46),
      );
    }),
  );
  return {
    familyKey: 'word-paths',
    variantKey,
    variant: `${variantKey}:${word}:${value}`,
    value,
    prompt: 'كم طريق تقدر تكوّن فيه الكلمة على الشبكة؟',
    slider: {
      mode: 'numeric-range',
      min: 0,
      max: shape.max,
      step: 1,
      unit: 'طريق',
    },
    altText: 'شبكة حروف عربية',
    concept:
      'Guess how many walks across touching cells spell the word without reusing a cell.',
    strategy:
      'Count the cells the word could start from, judge how many ways each carries on, and multiply.',
    domainDescription: 'a count of walks across the grid',
    factualClaim: `«${word}» walks ${value} ways on this ${shape.rows}×${shape.cols} board.`,
    svg: frame(
      text(`كم طريق تقدر تكوّن فيه كلمة «${word}»؟`, W / 2, 100, 40) +
        text(
          'تنتقل بين خانتين متلاصقتين، وما تستخدم خانة مرتين',
          W / 2,
          154,
          27,
          GREY,
        ) +
        body,
    ),
  };
}

// ---------------------------------------------------------------------------
// «الأعمدة المتحركة» — one letter from each column, against a list
// ---------------------------------------------------------------------------

export const COLUMN_SHAPES: Record<
  string,
  { length: number; letters: number; list: number; low: number; high: number }
> = {
  'three-columns': { length: 3, letters: 6, list: 18, low: 4, high: 11 },
  'wide-columns': { length: 3, letters: 7, list: 18, low: 5, high: 13 },
  'four-columns': { length: 4, letters: 6, list: 15, low: 3, high: 9 },
  'short-columns': { length: 3, letters: 5, list: 18, low: 3, high: 9 },
  'long-list': { length: 3, letters: 6, list: 24, low: 5, high: 15 },
  'tight-list': { length: 3, letters: 6, list: 12, low: 3, high: 8 },
};

const COLUMN_SPARES = 'ابتجحدرسعفقكلمنهو'.split('');

/**
 * Dealt to the answer like the wall of cards: left to chance, a board of
 * columns lets only one or two words of a list through, and «واحد أو اثنين»
 * is not a guess worth making. The engine picks the count, then fills the
 * list with that many words the columns build and the rest with words they
 * do not.
 */
function composeColumns(seed: string, variantKey: string): WordReading {
  const shape = COLUMN_SHAPES[variantKey] ?? COLUMN_SHAPES['three-columns'];
  const random = seededRandom(`column-words:${variantKey}:${seed}`);
  const pool = LETTER_WORDS.filter((word) => word.length === shape.length);
  let built: { columns: string[][]; list: string[]; value: number } | null =
    null;
  for (let attempt = 0; attempt < 240 && !built; attempt += 1) {
    const seeds = shuffled(pool, random).slice(0, shape.letters);
    const columns: string[][] = [];
    for (let place = 0; place < shape.length; place += 1) {
      const letters = [...new Set(seeds.map((word) => word[place]))];
      for (const spare of shuffled(COLUMN_SPARES, random)) {
        if (letters.length >= shape.letters) break;
        if (!letters.includes(spare)) letters.push(spare);
      }
      columns.push(shuffled(letters.slice(0, shape.letters), random));
    }
    const fits = pool.filter((word) =>
      word.split('').every((letter, place) => columns[place].includes(letter)),
    );
    const misses = pool.filter((word) => !fits.includes(word));
    const wants: number[] = [];
    for (let count = shape.low; count <= shape.high; count += 1)
      if (count <= fits.length && shape.list - count <= misses.length)
        wants.push(count);
    if (!wants.length) continue;
    const value = dealt(seed, wants, random);
    built = {
      columns,
      value,
      list: shuffled(
        [
          ...shuffled(fits, random).slice(0, value),
          ...shuffled(misses, random).slice(0, shape.list - value),
        ],
        random,
      ),
    };
  }
  if (!built) throw new Error(`column-words: no board fills ${variantKey}`);
  const { columns, list, value } = built;
  let body = '';
  // Columns on the right, column 1 first, so they read the way the words do.
  const step = Math.min(74, Math.round(392 / shape.letters));
  columns.forEach((column, index) => {
    const x = 980 - index * 110;
    body += text(`عمود ${index + 1}`, x, 232, 24, GREY);
    column.forEach((letter, place) => {
      const y = 256 + place * step;
      body += `<rect x="${round(x - 47)}" y="${round(y)}" width="94" height="${step - 8}" rx="10" fill="${GOLD}" stroke="${INK}" stroke-width="4"/>`;
      body += text(
        letter,
        x,
        y + step - 24,
        Math.min(34, Math.round(step * 0.5)),
      );
    });
  });
  const listCols = shape.list > 18 ? 4 : 3;
  const listRows = Math.ceil(shape.list / listCols);
  const listStep = Math.min(68, Math.round(392 / listRows));
  list.forEach((word, index) => {
    const x = 138 + (index % listCols) * 112;
    const y = 256 + Math.floor(index / listCols) * listStep;
    body += `<rect x="${round(x - 52)}" y="${round(y)}" width="104" height="${listStep - 10}" rx="10" fill="#FFFFFF" stroke="${INK}" stroke-width="3"/>`;
    body += text(word, x, y + listStep - 26, 27);
  });
  return {
    familyKey: 'column-words',
    variantKey,
    variant: `${variantKey}:${columns.map((one) => one.join('')).join('|')}:${value}`,
    value,
    prompt: 'كم كلمة من القائمة تتكوّن بحرف من كل عمود؟',
    slider: {
      mode: 'numeric-range',
      min: 0,
      max: shape.list,
      step: 1,
      unit: 'كلمة',
    },
    altText: 'أعمدة حروف وقائمة كلمات عربية',
    concept:
      'Guess how many words of a list can be spelled with one letter from each column.',
    strategy:
      'Check the first letter of each word against column one and skip early.',
    domainDescription: `a count of words out of ${shape.list}`,
    factualClaim: `${value} of the ${shape.list} listed words fit the columns.`,
    svg: frame(
      text('كم كلمة من القائمة تقدر تكوّنها بحرف من كل عمود؟', W / 2, 100, 38) +
        text('من اليمين لليسار', W / 2, 152, 27, GREY) +
        body,
    ),
  };
}

export function composeWordClosest(
  familyKey: WordClosestFamily,
  seed: string,
  variantKey?: string,
): WordReading {
  const variants = WORD_CLOSEST_VARIANTS[familyKey] as readonly string[];
  const chosen =
    variantKey && variants.includes(variantKey)
      ? variantKey
      : variants[
          Math.floor(
            seededRandom(`${familyKey}:variant:${seed}`)() * variants.length,
          )
        ];
  switch (familyKey) {
    case 'survivor-words':
      return composeSurvivors(seed, chosen);
    case 'word-paths':
      return composePaths(seed, chosen);
    case 'column-words':
      return composeColumns(seed, chosen);
    default:
      return composeOddWord(seed, chosen);
  }
}
