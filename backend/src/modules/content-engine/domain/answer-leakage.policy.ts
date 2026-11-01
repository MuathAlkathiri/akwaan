import { normalizeAnswer } from '../../../common/utils/answer-normalization.util';
import { contentTokens, entityTokens } from './library-copy-detector';

/**
 * Roadmap §5.6: a player who does not know the fact must not be able to derive
 * the answer from the wording alone.
 *
 * Everything here is deterministic, so it reads form, not meaning. A clue that
 * names the answer in other words needs world knowledge no rule has, and stays
 * with the reviewer. Signals split by how sure they can be: a certain form of
 * the answer blocks, and a resemblance only warns.
 */

export interface LeakageSignal {
  certainty: 'certain' | 'possible';
  code:
    | 'ANSWER_LEAKAGE'
    | 'ANSWER_DERIVABLE'
    | 'POSSIBLE_ANSWER_LEAKAGE'
    | 'GRAMMAR_NARROWS_OPTIONS';
  message: string;
}

const YEAR_MIN = 1500;
const YEAR_MAX = 2099;

const westernDigits = (value: string): string =>
  value
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/٫/g, '.');

const ATTACHED_ARTICLE = /^[وف]?(?:بال|كال|لل|ال)/;
/** No `ك`: it starts too many names, and `كريم` is not `ريم` with a prefix. */
const SINGLE_PROCLITIC = /^[وفبل]/;
const NISBA = /(?:ي|يه|يون|يين|يات)$/;
const LONG_VOWELS = /[اويى]/g;

/**
 * `normalizeAnswer` drops a leading article, which is right for an answer and
 * wrong for a sentence: it would turn an opening `ألف` into `ف`. The leading
 * word here absorbs that step and is then discarded.
 */
const tokensOf = (text: string): string[] =>
  normalizeAnswer(`و ${westernDigits(text)}`)
    .split(/[^\p{L}\p{N}]+/gu)
    .filter(Boolean)
    .slice(1);

/** `بالأسد` and `والأسد` are the word itself with a particle attached. */
export const withoutAttachedArticle = (token: string): string => {
  const stripped = token.replace(ATTACHED_ARTICLE, '');
  return stripped.length >= 3 ? stripped : token;
};

const UNITS: Readonly<Record<string, number>> = {
  واحد: 1,
  واحده: 1,
  اثنان: 2,
  اثنين: 2,
  اثنتان: 2,
  اثنتين: 2,
  ثلاث: 3,
  ثلاثه: 3,
  اربع: 4,
  اربعه: 4,
  خمس: 5,
  خمسه: 5,
  ست: 6,
  سته: 6,
  سبع: 7,
  سبعه: 7,
  ثمان: 8,
  ثماني: 8,
  ثمانيه: 8,
  تسع: 9,
  تسعه: 9,
  عشر: 10,
  عشره: 10,
  احد: 1,
  احدي: 1,
  اثني: 2,
  اثنتي: 2,
};
const TENS: Readonly<Record<string, number>> = {
  عشرون: 20,
  عشرين: 20,
  ثلاثون: 30,
  ثلاثين: 30,
  اربعون: 40,
  اربعين: 40,
  خمسون: 50,
  خمسين: 50,
  ستون: 60,
  ستين: 60,
  سبعون: 70,
  سبعين: 70,
  ثمانون: 80,
  ثمانين: 80,
  تسعون: 90,
  تسعين: 90,
};
/** Spelled as `normalizeAnswer` leaves them, which folds `ئ` to `ي`. */
const HUNDREDS: Readonly<Record<string, number>> = {
  ميه: 100,
  مايه: 100,
  ميتان: 200,
  ميتين: 200,
  مايتان: 200,
  مايتين: 200,
  ثلاثميه: 300,
  ثلاثمايه: 300,
  اربعميه: 400,
  اربعمايه: 400,
  خمسميه: 500,
  خمسمايه: 500,
  ستميه: 600,
  ستمايه: 600,
  سبعميه: 700,
  سبعمايه: 700,
  ثمانميه: 800,
  ثمانمايه: 800,
  تسعميه: 900,
  تسعمايه: 900,
};
const THOUSAND_WORDS = new Set(['الف', 'الاف']);
const DUAL_THOUSAND = new Set(['الفان', 'الفين']);

const wordValue = (token: string): number | undefined =>
  UNITS[token] ?? TENS[token] ?? HUNDREDS[token];

/** Reads one written-out number, `ألف وأربعة وعشرون` as 1024. */
const parseNumberWords = (tokens: string[]): number[] => {
  const found: number[] = [];
  let total = 0;
  let group = 0;
  let open = false;
  const close = () => {
    if (open) found.push(total + group);
    total = 0;
    group = 0;
    open = false;
  };
  for (const raw of tokens) {
    const joined = raw.startsWith('و') && raw.length > 2;
    const token = joined ? raw.slice(1) : raw;
    const multiplies = THOUSAND_WORDS.has(token) && group > 0;
    if (open && !joined && !multiplies) close();
    if (DUAL_THOUSAND.has(token)) {
      total += 2000;
      open = true;
    } else if (THOUSAND_WORDS.has(token)) {
      total += (group || 1) * 1000;
      group = 0;
      open = true;
    } else {
      const value = wordValue(token);
      if (value === undefined) {
        close();
        continue;
      }
      group += value;
      open = true;
    }
  }
  close();
  return found;
};

const DIGIT_NUMBER =
  /(?<![\d.])\d{1,3}(?:[,،٬]\d{3})+(?:\.\d+)?(?![\d])|(?<![\d.])\d+(?:\.\d+)?(?![\d])/g;

const digitNumbers = (prompt: string): number[] =>
  (westernDigits(prompt).match(DIGIT_NUMBER) ?? []).map((value) =>
    Number(value.replace(/[,،٬]/g, '')),
  );

const wordNumbers = (prompt: string): number[] =>
  parseNumberWords(tokensOf(prompt));

/** Every number the question states, in digits or in words. */
export const numbersInPrompt = (prompt: string): number[] => [
  ...digitNumbers(prompt),
  ...wordNumbers(prompt),
];

const isYear = (value: number): boolean =>
  Number.isInteger(value) && value >= YEAR_MIN && value <= YEAR_MAX;

/**
 * Word-only numbers this small are ordinary Arabic: `أول خمس نسخ` does not leak
 * an answer of 5.
 */
const AMBIGUOUS_WORD_NUMBER_LIMIT = 10;

/** Past this many numbers, some pair adds up to anything. */
const MAX_NUMBERS_FOR_COINCIDENCE = 3;

const OPERATION_WORDS = new Set([
  'مجموع',
  'حاصل',
  'ناتج',
  'الفرق',
  'اضرب',
  'اجمع',
  'اطرح',
  'اجمالي',
  'لكل',
  'مرات',
  'بمعدل',
]);
const OPERATION_PHRASES = ['في كل', 'كل واحد'];
const OPERATOR_SYMBOL = /\d\s*[×÷*+]\s*\d/;

const namesAnOperation = (prompt: string): boolean => {
  const text = westernDigits(prompt);
  const tokens = tokensOf(text);
  const joined = ` ${tokens.join(' ')} `;
  return (
    OPERATOR_SYMBOL.test(text) ||
    tokens.some((token) => OPERATION_WORDS.has(token)) ||
    OPERATION_PHRASES.some((phrase) => joined.includes(` ${phrase} `))
  );
};

const FRACTION_CUES: ReadonlyArray<readonly [string, number]> = [
  ['ضعف', 2],
  ['نصف', 0.5],
  ['ثلث', 1 / 3],
  ['ربع', 0.25],
];

const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9;

const pairResults = (a: number, b: number): number[] => [
  a + b,
  a * b,
  Math.abs(a - b),
  ...(b ? [a / b] : []),
  ...(a ? [b / a] : []),
];

/**
 * Can the stated numbers alone produce the target? A coincidence needs no cue,
 * so it only warns. An operation word beside them is the worksheet §30.20 refuses.
 */
const derivationSignals = (
  prompt: string,
  target: number,
  reasoning: boolean,
): LeakageSignal[] => {
  const usable = numbersInPrompt(prompt).filter(
    (value) => !isYear(value) && !near(value, target) && value > 1,
  );
  const folded = normalizeAnswer(prompt);
  // Reasoning items are meant to be worked out, so computing one is the game.
  const certain = namesAnOperation(prompt) && !reasoning;
  if (!certain && usable.length > MAX_NUMBERS_FOR_COINCIDENCE) return [];

  for (const [cue, factor] of FRACTION_CUES) {
    if (
      tokensOf(folded).includes(cue) &&
      usable.some((value) => near(value * factor, target))
    ) {
      return [
        reasoning
          ? {
              certainty: 'possible',
              code: 'POSSIBLE_ANSWER_LEAKAGE',
              message: `the target ${target} is ${cue} a number in the prompt`,
            }
          : {
              certainty: 'certain',
              code: 'ANSWER_DERIVABLE',
              message: `the target ${target} is ${cue} a number in the prompt`,
            },
      ];
    }
  }
  for (let i = 0; i < usable.length; i += 1) {
    for (let j = i + 1; j < usable.length; j += 1) {
      if (pairResults(usable[i], usable[j]).some((r) => near(r, target))) {
        return [
          certain
            ? {
                certainty: 'certain',
                code: 'ANSWER_DERIVABLE',
                message: `${usable[i]} and ${usable[j]} in the prompt give the target ${target}`,
              }
            : {
                certainty: 'possible',
                code: 'POSSIBLE_ANSWER_LEAKAGE',
                message: `${usable[i]} and ${usable[j]} in the prompt combine to ${target}`,
              },
        ];
      }
    }
  }
  return [];
};

/** Numeric leakage for any answer that is a number. */
export const numericLeakageSignals = (
  prompt: string,
  target: number,
  options: { reasoning?: boolean } = {},
): LeakageSignal[] => {
  const inDigits = digitNumbers(prompt).some((value) => near(value, target));
  const inWords = wordNumbers(prompt).some((value) => near(value, target));
  if (inDigits || (inWords && target > AMBIGUOUS_WORD_NUMBER_LIMIT)) {
    return [
      {
        certainty: 'certain',
        code: 'ANSWER_LEAKAGE',
        message: `the target ${target} appears in the prompt text`,
      },
    ];
  }
  if (inWords) {
    return [
      {
        certainty: 'possible',
        code: 'POSSIBLE_ANSWER_LEAKAGE',
        message: `the number ${target} is written out in the prompt`,
      },
    ];
  }
  return derivationSignals(prompt, target, options.reasoning ?? false);
};

/** Only the correct option echoes the question, which points straight at it. */
const echoedWord = (
  prompt: string,
  correct: string,
  others: readonly string[],
): string | null => {
  const asked = new Set(contentTokens(prompt));
  const elsewhere = new Set(others.flatMap(contentTokens));
  return (
    entityTokens(correct).find(
      (token) => asked.has(token) && !elsewhere.has(token),
    ) ?? null
  );
};

const resemblance = (promptTokens: string[], answer: string): string | null => {
  const base = withoutAttachedArticle(answer);
  if (base.length < 3) return null;
  const skeleton = base.replace(LONG_VOWELS, '');
  return (
    promptTokens.find((raw) => {
      const token = withoutAttachedArticle(raw);
      if (token === base) return false;
      const bare = raw.replace(SINGLE_PROCLITIC, '');
      if (bare === base) return true;
      if (token.startsWith(base) && NISBA.test(token.slice(base.length))) {
        return true;
      }
      return (
        skeleton.length >= 2 &&
        token.length >= 3 &&
        token.replace(LONG_VOWELS, '') === skeleton
      );
    }) ?? null
  );
};

const NUMERIC_LABEL = /^\s*[\d٠-٩][\d٠-٩,،٬.]*\s*$/;

/** Signals for a multiple-choice candidate beyond exact and article forms. */
export const optionLeakageSignals = (
  prompt: string,
  correct: string,
  others: readonly string[],
): LeakageSignal[] => {
  if (NUMERIC_LABEL.test(correct)) {
    const value = Number(westernDigits(correct).replace(/[,،٬]/g, ''));
    return Number.isFinite(value) ? numericLeakageSignals(prompt, value) : [];
  }

  const signals: LeakageSignal[] = [];
  const answerTokens = tokensOf(correct);
  if (answerTokens.length === 1) {
    const similar = resemblance(tokensOf(prompt), answerTokens[0]);
    if (similar) {
      signals.push({
        certainty: 'possible',
        code: 'POSSIBLE_ANSWER_LEAKAGE',
        message: `"${similar}" in the prompt resembles the answer`,
      });
    }
  }
  const echoed = echoedWord(prompt, correct, others);
  if (echoed) {
    signals.push({
      certainty: 'possible',
      code: 'POSSIBLE_ANSWER_LEAKAGE',
      message: `only the correct option shares "${echoed}" with the prompt`,
    });
  }

  const feminine = /(?:^|\s)(?:التي|هي)(?:\s|$)/.test(normalizeAnswer(prompt));
  const endsFeminine = (label: string) =>
    /ه$/.test(tokensOf(label).at(-1) ?? '');
  if (
    feminine &&
    others.length >= 2 &&
    endsFeminine(correct) &&
    !others.some(endsFeminine)
  ) {
    signals.push({
      certainty: 'possible',
      code: 'GRAMMAR_NARROWS_OPTIONS',
      message: 'the prompt is feminine and only the correct option agrees',
    });
  }
  return signals;
};
