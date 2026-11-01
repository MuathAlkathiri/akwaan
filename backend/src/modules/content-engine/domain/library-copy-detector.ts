import { ConfigService } from '@nestjs/config';
import { normalizeAnswer } from '../../../common/utils/answer-normalization.util';
import { LibrarySeed } from './library-sourcing';
import { answersRow, promptOf } from './structured-seed-binding';

/**
 * "A new question, not a copy" as a deterministic check. No model is involved,
 * so the same candidate always gets the same verdict.
 *
 * A candidate is a copy only when all three signals agree: it has the row's
 * answer, it names the row's entity, and its wording is close. Each alone is
 * legitimate. Sharing an answer is the point of a fact seed, and a different
 * question about the same fact has to survive.
 */

export const DEFAULT_LIBRARY_COPY_THRESHOLD = 0.5;
const CHAR_GRAM = 3;
/** Share of the row's entity tokens a candidate must repeat to name its entity. */
const ENTITY_OVERLAP = 0.5;

/** Question scaffolding: words that say nothing about the subject. */
const STOPWORDS = new Set(
  (
    'من ما ماذا لماذا متى اين كيف كم اي هل هو هي هم في على الي عن مع او ثم ' +
    'التي الذي الذين ان انه انها كان كانت يكون تكون هذا هذه ذلك تلك له لها به بها ' +
    'لم قبل بعد عند حتى اسم عدد مين وش ايش شو ايه قد كل بين منذ وهو وهي'
  ).split(' '),
);

/** Common nouns of the question genre. Sharing one names nothing in particular. */
const GENERIC_NOUNS = new Set(
  (
    'لاعب لاعبين نادي ناد فريق دوري كاس موسم مباراه هدف نقطه نقاط شخصيه طاقم ' +
    'ملك معركه سفينه مره مسيره مختلف اول رابع دور نهائي'
  ).split(' '),
);

/** The few synonyms a light rewrite reaches for first. */
const SYNONYMS: Readonly<Record<string, string>> = {
  ابو: 'والد',
  اب: 'والد',
  ابي: 'والد',
  مركب: 'سفينه',
  سفينته: 'سفينه',
  نادي: 'فريق',
  ناد: 'فريق',
  ناديا: 'فريق',
  انديه: 'فريق',
  احرز: 'سجل',
  سجله: 'سجل',
  ماتش: 'مباراه',
};

const westernDigits = (value: string): string =>
  value.replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));

/** Conjunctions, prepositions and the article. `بالدوري` compares as `دوري`. */
const withoutClitics = (token: string): string => {
  if (!/^[ء-ي]+$/.test(token)) return token;
  const stripped = token
    .replace(/^(?:و|ف)?(?:بال|كال|لل|ال)/, '')
    .replace(/^و(?=[\u0621-\u064A]{3})/, '');
  return stripped.length >= 3 ? stripped : token;
};

export const contentTokens = (text: string): string[] =>
  normalizeAnswer(westernDigits(text))
    .split(' ')
    .filter(Boolean)
    .filter((token) => !STOPWORDS.has(token))
    .map(withoutClitics)
    .filter((token) => !STOPWORDS.has(token))
    .map((token) => SYNONYMS[token] ?? token);

const grams = <T>(items: T[], size: number, join: (part: T[]) => string) =>
  new Set(
    Array.from({ length: Math.max(items.length - size + 1, 0) }, (_, index) =>
      join(items.slice(index, index + size)),
    ),
  );

const dice = (a: Set<string>, b: Set<string>): number => {
  if (!a.size || !b.size) return 0;
  const shared = [...a].filter((item) => b.has(item)).length;
  return (2 * shared) / (a.size + b.size);
};

const joinWords = (part: string[]): string => part.join(' ');

/** Word unigrams and bigrams together, so order counts but does not decide. */
export const wordSimilarity = (a: string[], b: string[]): number =>
  dice(
    new Set([...a, ...grams(a, 2, joinWords)]),
    new Set([...b, ...grams(b, 2, joinWords)]),
  );

/** Character trigrams, which forgive the affixes token matching misses. */
export const charSimilarity = (a: string[], b: string[]): number =>
  dice(
    grams([...` ${a.join(' ')} `], CHAR_GRAM, (part) => part.join('')),
    grams([...` ${b.join(' ')} `], CHAR_GRAM, (part) => part.join('')),
  );

export const textSimilarity = (a: string, b: string): number => {
  const left = contentTokens(a);
  const right = contentTokens(b);
  return Math.max(wordSimilarity(left, right), charSimilarity(left, right));
};

/** A parenthetical is a counting rule or a note, never the subject. */
export const entityTokens = (text: string): string[] =>
  [...new Set(contentTokens(text.replace(/\([^()]*\)/g, ' ')))].filter(
    (token) => !GENERIC_NOUNS.has(token) && !/^\d+$/.test(token),
  );

export const sharesEntity = (
  rowText: string,
  candidateText: string,
): boolean => {
  const entities = entityTokens(rowText);
  if (!entities.length) return false;
  const candidate = new Set(contentTokens(candidateText));
  const shared = entities.filter((token) => candidate.has(token)).length;
  return shared > 0 && shared / entities.length >= ENTITY_OVERLAP;
};

export interface LibrarySimilarity {
  libraryId: string;
  similarity: number;
}

/** The pinned row this draft copies, if any. */
export const findLibraryCopy = (
  draft: Record<string, unknown> | null,
  seeds: readonly LibrarySeed[],
  threshold: number,
): LibrarySimilarity | null => {
  const prompt = promptOf(draft);
  for (const seed of seeds) {
    if (!answersRow(draft, seed)) continue;
    if (!sharesEntity(seed.questionText, prompt)) continue;
    const similarity = textSimilarity(seed.questionText, prompt);
    if (similarity >= threshold) {
      return { libraryId: seed.libraryId, similarity };
    }
  }
  return null;
};

/**
 * The closest any pinned row comes to this question, whatever the verdict. A
 * reviewer reads this to judge a near miss the threshold let through.
 */
export const highestLibrarySimilarity = (
  draft: Record<string, unknown> | null,
  seeds: readonly LibrarySeed[],
): LibrarySimilarity | null => {
  const prompt = promptOf(draft);
  return seeds.reduce<LibrarySimilarity | null>((highest, seed) => {
    const similarity = textSimilarity(seed.questionText, prompt);
    return highest && highest.similarity >= similarity
      ? highest
      : { libraryId: seed.libraryId, similarity };
  }, null);
};

export const resolveLibraryCopyThreshold = (config?: ConfigService): number => {
  const raw = config?.get<string>('ENGINE_LIBRARY_COPY_THRESHOLD')?.trim();
  if (!raw) return DEFAULT_LIBRARY_COPY_THRESHOLD;
  const value = Number(raw);
  // Refused, not clamped: at 0 every same-answer question would be a copy.
  if (!Number.isFinite(value) || value <= 0 || value > 1) {
    throw new Error(
      'ENGINE_LIBRARY_COPY_THRESHOLD must be above 0 and at most 1',
    );
  }
  return value;
};
