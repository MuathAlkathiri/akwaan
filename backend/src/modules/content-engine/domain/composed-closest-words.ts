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
 * مين أقرب in «الكلمات والحروف»: four families the engine writes and counts
 * for itself — the letters of a sentence, one letter's turns inside a block
 * of writing, the words of a list that hold a letter, and the one word in a
 * row that breaks the row's own rule.
 *
 * The words are `LETTER_WORDS` and the sentences are the owner-reviewed
 * `dotless-sentences.txt`, read without their brackets. Letters whose shape
 * a player may argue about — the alef's hamzas, ة against ت, ى against ي —
 * are never the letter asked about.
 */
export const WORD_CLOSEST_VARIANTS = {
  'letters-in-sentence': [
    'short',
    'medium',
    'long',
    'very-long',
    'few-words',
    'many-words',
  ],
  'letter-repeats': ['baa', 'laam', 'raa', 'noon', 'meem', 'mixed'],
  'words-with-letter': ['raa', 'meem', 'baa', 'laam', 'noon', 'seen'],
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
  let body = `<rect x="${LANE.x0}" y="${round(y - 40)}" width="${round(LANE.x1 - LANE.x0)}" height="80" rx="10" fill="#FFFFFF" stroke="${INK}" stroke-width="6"/>`;
  for (let i = 1; i < cells; i += 1)
    body += `<line x1="${round(LANE.x0 + i * cw)}" y1="${round(y - 40)}" x2="${round(LANE.x0 + i * cw)}" y2="${round(y + 40)}" stroke="${RULE}" stroke-width="3"/>`;
  return { body, at: (i: number) => LANE.x0 + i * cw, cw };
};

/** The sentences as a player reads them: no brackets, nothing else changed. */
export const plainSentences = (): string[] =>
  dotlessSentences().map((line) => line.replace(/[[\]]/g, '').trim());

export const lettersOf = (line: string): number =>
  line.replace(/\s+/g, '').length;

/** Letters a player cannot mistake for another shape. */
export const SAFE_LETTERS: Record<string, { letter: string; ar: string }> = {
  baa: { letter: 'ب', ar: 'الباء' },
  laam: { letter: 'ل', ar: 'اللام' },
  raa: { letter: 'ر', ar: 'الراء' },
  noon: { letter: 'ن', ar: 'النون' },
  meem: { letter: 'م', ar: 'الميم' },
  seen: { letter: 'س', ar: 'السين' },
};

/** Letters that carry at least one dot, for the dotted/dotless rules. */
const DOTTED = new Set('بتثجخذزشضظغفقنية'.split(''));
export const hasDots = (word: string): boolean =>
  word.split('').some((letter) => DOTTED.has(letter));

/** Writing laid out in lines that fit the picture. */
function wrapped(words: string[], perLine: number): string[] {
  const lines: string[] = [];
  for (let i = 0; i < words.length; i += perLine)
    lines.push(words.slice(i, i + perLine).join(' '));
  return lines;
}

// ---------------------------------------------------------------------------
// «كم حرف في الجملة؟»
// ---------------------------------------------------------------------------

const SENTENCE_BANDS: Record<string, (line: string) => boolean> = {
  short: (line) => lettersOf(line) <= 17,
  medium: (line) => lettersOf(line) >= 18 && lettersOf(line) <= 20,
  long: (line) => lettersOf(line) >= 21 && lettersOf(line) <= 22,
  'very-long': (line) => lettersOf(line) >= 23,
  'few-words': (line) => line.split(/\s+/).length <= 4,
  'many-words': (line) => line.split(/\s+/).length >= 5,
};

function composeLetters(seed: string, variantKey: string): WordReading {
  const random = seededRandom(`letters-in-sentence:${variantKey}:${seed}`);
  const band = SENTENCE_BANDS[variantKey] ?? SENTENCE_BANDS.short;
  const all = plainSentences();
  const pool = all.filter(band);
  const line = dealt(seed, pool.length >= 4 ? pool : all, random);
  const value = lettersOf(line);
  return {
    familyKey: 'letters-in-sentence',
    variantKey,
    variant: `${variantKey}:${line}`,
    value,
    prompt: 'كم حرف في الجملة؟ المسافات ما تنعد.',
    slider: { mode: 'numeric-range', min: 0, max: 35, step: 1, unit: 'حرف' },
    altText: 'جملة عربية مكتوبة بخط كبير',
    concept: 'Count the letters of a written sentence, spaces aside.',
    strategy: 'Count each word on its own and add the words up.',
    domainDescription: 'letters in the sentence, 0 to 35',
    factualClaim: `«${line}» is written with ${value} letters.`,
    svg: frame(
      text('كم حرف في الجملة؟', W / 2, 150, 46) +
        text('المسافات ما تنعد', W / 2, 212, 32, GREY) +
        text(line, W / 2, 400, 54, BLUE),
    ),
  };
}

// ---------------------------------------------------------------------------
// «كم مرة يتكرر الحرف؟» — one letter inside a block of three sentences
// ---------------------------------------------------------------------------

/**
 * Blocks of three, four or five sentences in a row. A rarer letter needs
 * more writing before it turns up often enough to be worth estimating, so
 * every block length is offered and the template takes the ones that fit.
 */
export function blocks(): string[][] {
  const all = plainSentences();
  const out: string[][] = [];
  for (const howMany of [3, 4, 5])
    for (let i = 0; i + howMany <= all.length; i += 1)
      out.push(all.slice(i, i + howMany));
  return out;
}

export const countLetter = (lines: string[], letter: string): number =>
  lines.join('').split(letter).length - 1;

function composeRepeats(seed: string, variantKey: string): WordReading {
  const random = seededRandom(`letter-repeats:${variantKey}:${seed}`);
  const named = SAFE_LETTERS[variantKey];
  const choices = named ? [named] : Object.values(SAFE_LETTERS);
  const fits: Array<[string[], { letter: string; ar: string }]> = [];
  for (const lines of blocks())
    for (const pick of choices) {
      const found = countLetter(lines, pick.letter);
      if (found >= 4 && found <= 14) fits.push([lines, pick]);
    }
  const [lines, letter] = fits.length
    ? dealt(seed, fits, random)
    : [blocks()[0], SAFE_LETTERS.laam];
  const value = countLetter(lines, letter.letter);
  return {
    familyKey: 'letter-repeats',
    variantKey,
    variant: `${variantKey}:${letter.letter}:${lines[0]}`,
    value,
    prompt: `كم مرة يتكرر حرف ${letter.ar} في الكلام المكتوب؟`,
    slider: { mode: 'numeric-range', min: 0, max: 20, step: 1, unit: 'مرة' },
    altText: 'ثلاث جمل مكتوبة بخط كبير',
    concept:
      'Count how often one letter turns up across a short block of writing.',
    strategy: 'Take the lines one at a time and keep a running count.',
    domainDescription: 'turns of the letter, 0 to 20',
    factualClaim: `The letter ${letter.letter} appears ${value} times in these three lines.`,
    svg: frame(
      text(`كم مرة يتكرر حرف ${letter.ar} في الكلام المكتوب؟`, W / 2, 110, 40) +
        lines
          .map((line, index) =>
            text(
              line,
              W / 2,
              (lines.length > 4 ? 212 : 268) +
                index * (lines.length > 4 ? 92 : 104),
              lines.length > 4 ? 42 : 46,
              BLUE,
            ),
          )
          .join(''),
    ),
  };
}

// ---------------------------------------------------------------------------
// «كم كلمة فيها الحرف؟» — a list of words, some holding the letter
// ---------------------------------------------------------------------------

const WORDS_SHOWN = 18;

function composeWordsWith(seed: string, variantKey: string): WordReading {
  const random = seededRandom(`words-with-letter:${variantKey}:${seed}`);
  const named = SAFE_LETTERS[variantKey] ?? SAFE_LETTERS.raa;
  const holding = LETTER_WORDS.filter((word) => word.includes(named.letter));
  const without = LETTER_WORDS.filter((word) => !word.includes(named.letter));
  const most = Math.min(12, holding.length - 2, WORDS_SHOWN - 4);
  const value = dealt(
    seed,
    Array.from({ length: Math.max(1, most - 3) }, (_, i) => 4 + i),
    random,
  );
  const chosen = shuffled(
    [
      ...shuffled(holding, random).slice(0, value),
      ...shuffled(without, random).slice(0, WORDS_SHOWN - value),
    ],
    random,
  );
  const lines = wrapped(chosen, 6);
  return {
    familyKey: 'words-with-letter',
    variantKey,
    variant: `${variantKey}:${value}:${chosen.join('-')}`,
    value,
    prompt: `كم كلمة من هذي فيها حرف ${named.ar}؟`,
    slider: { mode: 'numeric-range', min: 0, max: 18, step: 1, unit: 'كلمة' },
    altText: 'قائمة كلمات عربية مرتبة في صفوف',
    concept: 'Count the words of a short list that hold one named letter.',
    strategy: 'Read along each row and mark every word the letter shows up in.',
    domainDescription: 'words holding the letter, 0 to 18',
    factualClaim: `${value} of the ${WORDS_SHOWN} words hold the letter ${named.letter}.`,
    svg: frame(
      text(`كم كلمة من هذي فيها حرف ${named.ar}؟`, W / 2, 118, 42) +
        lines
          .map((line, index) => text(line, W / 2, 260 + index * 118, 48, BLUE))
          .join(''),
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
    case 'letters-in-sentence':
      return composeLetters(seed, chosen);
    case 'letter-repeats':
      return composeRepeats(seed, chosen);
    case 'words-with-letter':
      return composeWordsWith(seed, chosen);
    default:
      return composeOddWord(seed, chosen);
  }
}

void GOLD;
