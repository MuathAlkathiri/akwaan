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
import { LETTER_WORDS } from './composed-letters';
import { dotlessSentences } from './composed-bomb-more';

/**
 * مين أقرب in «الكلمات والحروف»: three families the engine writes for itself
 * — the letters of a block of writing, one letter's turns inside it, and the
 * one word in a row that breaks the rule the rest of the row keeps.
 *
 * The first two were tried once over a single sentence and taken out again
 * (owner, 2026-11-28): twenty letters is a number a team *can* reach, so it
 * counts them, and counting against the clock is a chore. They come back at
 * the size of a paragraph, where counting is out of the question and the
 * team has to judge the block and throw a number — which is what مين أقرب
 * is for.
 */
export const WORD_CLOSEST_VARIANTS = {
  'letters-in-text': ['six', 'seven', 'eight', 'nine', 'ten', 'longest'],
  'letter-repeats': ['baa', 'laam', 'raa', 'noon', 'meem', 'mixed'],
  'odd-word-place': [
    'same-last',
    'same-first',
    'same-length',
    'has-letter',
    'dotless',
    'dotted',
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

const BLUE = '#2F6FE0';
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
// «كم حرف تقريبًا؟» and «كم مرة يتكرر الحرف؟» — a block too long to count
// ---------------------------------------------------------------------------

/** The owner's sentences as a player reads them: no brackets, nothing else. */
export const plainSentences = (): string[] =>
  dotlessSentences().map((line) => line.replace(/[[\]]/g, '').trim());

export const lettersOf = (lines: readonly string[]): number =>
  lines.join('').replace(/\s+/g, '').length;

export const countLetter = (lines: readonly string[], letter: string): number =>
  lines.join('').split(letter).length - 1;

/** Letters a player cannot mistake for another shape. */
export const SAFE_LETTERS: Record<string, { letter: string; ar: string }> = {
  baa: { letter: 'ب', ar: 'الباء' },
  laam: { letter: 'ل', ar: 'اللام' },
  raa: { letter: 'ر', ar: 'الراء' },
  noon: { letter: 'ن', ar: 'النون' },
  meem: { letter: 'م', ar: 'الميم' },
  seen: { letter: 'س', ar: 'السين' },
};

const PARAGRAPH_SIZES: Record<string, number> = {
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  longest: 8,
};

/** Every block of `howMany` sentences in a row. */
export function paragraphs(howMany: number, longestFirst = false): string[][] {
  const all = longestFirst
    ? [...plainSentences()].sort(
        (one, two) => lettersOf([two]) - lettersOf([one]),
      )
    : plainSentences();
  const out: string[][] = [];
  for (let i = 0; i + howMany <= all.length; i += 1)
    out.push(all.slice(i, i + howMany));
  return out;
}

/** The block written out, two sentences a line, so it reads as a paragraph. */
function paragraphSvg(title: string, lines: string[]): string {
  const rows: string[] = [];
  for (let i = 0; i < lines.length; i += 2)
    rows.push(lines.slice(i, i + 2).join(' • '));
  const size = rows.length > 4 ? 32 : 36;
  const step = rows.length > 4 ? 76 : 88;
  const top = 340 - ((rows.length - 1) * step) / 2;
  return frame(
    text(title, W / 2, 110, 40) +
      rows
        .map((row, index) => text(row, W / 2, top + index * step, size, BLUE))
        .join(''),
  );
}

function composeTextLetters(seed: string, variantKey: string): WordReading {
  const random = seededRandom(`letters-in-text:${variantKey}:${seed}`);
  const howMany = PARAGRAPH_SIZES[variantKey] ?? 8;
  const lines = dealt(
    seed,
    paragraphs(howMany, variantKey === 'longest'),
    random,
  );
  const value = lettersOf(lines);
  return {
    familyKey: 'letters-in-text',
    variantKey,
    variant: `${variantKey}:${value}:${lines[0]}`,
    value,
    prompt: 'كم حرف تقريبًا في الكلام المكتوب؟ المسافات ما تنعد.',
    slider: { mode: 'numeric-range', min: 0, max: 300, step: 1, unit: 'حرف' },
    altText: 'فقرة من عدة جمل عربية مكتوبة',
    concept:
      'Guess the letters of a block of writing too long to count through.',
    strategy:
      'Judge the letters of one line, then reckon for the lines below it.',
    domainDescription: 'letters in the writing, 0 to 300',
    factualClaim: `These ${howMany} sentences are written with ${value} letters.`,
    svg: paragraphSvg('كم حرف تقريبًا في الكلام المكتوب؟', lines),
  };
}

function composeRepeats(seed: string, variantKey: string): WordReading {
  const random = seededRandom(`letter-repeats:${variantKey}:${seed}`);
  const named = SAFE_LETTERS[variantKey];
  const choices = named ? [named] : Object.values(SAFE_LETTERS);
  const fits: Array<[string[], { letter: string; ar: string }]> = [];
  for (const howMany of [8, 9, 10])
    for (const lines of paragraphs(howMany))
      for (const one of choices) {
        const found = countLetter(lines, one.letter);
        if (found >= 8 && found <= 34) fits.push([lines, one]);
      }
  const [lines, letter] = fits.length
    ? dealt(seed, fits, random)
    : [paragraphs(8)[0], SAFE_LETTERS.laam];
  const value = countLetter(lines, letter.letter);
  return {
    familyKey: 'letter-repeats',
    variantKey,
    variant: `${variantKey}:${letter.letter}:${value}:${lines[0]}`,
    value,
    prompt: `كم مرة تقريبًا يتكرر حرف ${letter.ar} في الكلام المكتوب؟`,
    slider: { mode: 'numeric-range', min: 0, max: 40, step: 1, unit: 'مرة' },
    altText: 'فقرة من عدة جمل عربية مكتوبة',
    concept: 'Guess how often one letter turns up across a block of writing.',
    strategy:
      'Count the letter in one line, then reckon for the lines below it.',
    domainDescription: 'turns of the letter, 0 to 40',
    factualClaim: `The letter ${letter.letter} appears ${value} times in these ${lines.length} sentences.`,
    svg: paragraphSvg(
      `كم مرة تقريبًا يتكرر حرف ${letter.ar} في الكلام المكتوب؟`,
      lines,
    ),
  };
}

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
    case 'letters-in-text':
      return composeTextLetters(seed, chosen);
    case 'letter-repeats':
      return composeRepeats(seed, chosen);
    default:
      return composeOddWord(seed, chosen);
  }
}
