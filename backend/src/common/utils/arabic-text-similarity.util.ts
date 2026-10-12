/**
 * Arabic-aware text comparison, shared by every "is this the same question?"
 * check in the system.
 *
 * Extracted from `QuestionDuplicateDetectionService`, which still uses it, so
 * that a second caller — the tutorial/competitive overlap guard — compares
 * strings exactly the way the authoring pipeline already does. Two different
 * notions of "the same question" would be worse than none: one of them would be
 * the one that quietly lets a competitive answer through.
 *
 * The normalization folds the differences Arabic authors do not intend to be
 * meaningful: diacritics, the alef and yaa families, taa marbuta, Arabic-Indic
 * digits, punctuation and whitespace runs.
 */

/** Similarity at or above which two prompts are treated as the same question. */
export const ARABIC_DUPLICATE_THRESHOLD = 0.72;

export function normalizeArabicText(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('ar')
    .normalize('NFKC')
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/[ىئ]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ة/g, 'ه')
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function trigrams(value: string): Set<string> {
  const padded = `  ${value}  `;
  return new Set(
    Array.from({ length: Math.max(0, padded.length - 2) }, (_, index) =>
      padded.slice(index, index + 3),
    ),
  );
}

/** Jaccard overlap of trigrams, 0–1, on already-normalized strings. */
export function arabicTextSimilarity(left: string, right: string): number {
  if (left === right) return 1;
  const a = trigrams(left);
  const b = trigrams(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return Number((intersection / (a.size + b.size - intersection)).toFixed(4));
}
