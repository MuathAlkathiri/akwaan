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

/**
 * مين أقرب in «الكلمات والحروف»: one family the engine writes for itself —
 * the one word in a row that breaks the rule the rest of the row keeps.
 *
 * Counting templates were tried here and taken out again (owner, 2026-11-28):
 * counting the letters of a sentence, or how often a letter turns up in it,
 * is a chore against the clock rather than a puzzle. A Closest question in
 * this Scope has to turn on a rule the player works out, not on enumeration.
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
  return composeOddWord(seed, chosen);
}
