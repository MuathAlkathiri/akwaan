/**
 * Counted nouns, in Arabic.
 *
 * Arabic does not pluralise the way the interpolation `{n} {noun}` assumes, and
 * the result of assuming it is text a native speaker reads as broken: "3 عالم"
 * instead of "3 عوالم", "4 تحدٍ" instead of "4 تحديات". The rules are fixed and
 * small, so they belong in one place rather than in each template.
 *
 *   1        → singular, no numeral ("عالم واحد")
 *   2        → dual ("عالمان")
 *   3–10     → plural of paucity ("3 عوالم")
 *   11+      → singular accusative ("12 عالمًا")
 *   0        → plural ("لا عوالم" reads better than "0 عالم")
 *
 * The numeral itself is kept in Western digits: the product shows scores and
 * counters in them everywhere, and mixing digit systems inside one screen is
 * harder to read than either alone.
 */

export interface ArabicNounForms {
  /** One of them: "عالم". */
  one: string;
  /** Two of them: "عالمان". */
  two: string;
  /** Three to ten: "عوالم". */
  few: string;
  /** Eleven and above, singular accusative: "عالمًا". */
  many: string;
}

export const ARABIC_NOUNS = {
  world: { one: "عالم", two: "عالمان", few: "عوالم", many: "عالمًا" },
  scope: { one: "نطاق", two: "نطاقان", few: "نطاقات", many: "نطاقًا" },
  challenge: { one: "تحدٍّ", two: "تحدّيان", few: "تحدّيات", many: "تحدّيًا" },
  player: { one: "لاعب", two: "لاعبان", few: "لاعبين", many: "لاعبًا" },
  card: { one: "بطاقة", two: "بطاقتان", few: "بطاقات", many: "بطاقة" },
} as const satisfies Record<string, ArabicNounForms>;

/** The noun alone, in the form the count requires. */
export function arabicNoun(count: number, forms: ArabicNounForms): string {
  if (count === 1) return forms.one;
  if (count === 2) return forms.two;
  if (count >= 3 && count <= 10) return forms.few;
  return forms.many;
}

/**
 * The whole phrase: numeral and noun, agreeing.
 *
 * One and two carry no numeral — "عالم واحد" and "عالمان" already say how many,
 * and printing the digit as well is the tell of a translated interface.
 */
export function arabicCount(count: number, forms: ArabicNounForms): string {
  if (count === 1) return `${forms.one} واحد`;
  if (count === 2) return forms.two;
  return `${count} ${arabicNoun(count, forms)}`;
}

/**
 * The Arabic ل- prefix, which merges with a following definite article.
 *
 * "ل" + "العالم الأول" is "للعالم الأول", never "لـالعالم الأول" — and the
 * broken form is exactly what string concatenation produces.
 */
export function withLamPrefix(phrase: string): string {
  const trimmed = phrase.trim();
  return trimmed.startsWith("ال") ? `ل${trimmed.slice(1)}` : `لـ${trimmed}`;
}
