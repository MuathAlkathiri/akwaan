/**
 * The difficulty vocabulary, owned by World Content.
 *
 * It lives here rather than in the gameplay domain because it *is* content
 * metadata: an author picks it, the catalog stores it, and the runtime only reads
 * it. Keeping it here also keeps the dependency arrow pointing the way every other
 * mechanic's does — gameplay reads World Content, never the reverse.
 */
export const MARHALA_DIFFICULTIES = ['easy', 'medium', 'hard'] as const;

export type MarhalaDifficulty = (typeof MARHALA_DIFFICULTIES)[number];

/**
 * "المرحلة" authored content, in the canonical World Content model.
 *
 * Marhala needs exactly one thing no shared field carries: **how risky a question
 * is**, because the team chooses a difficulty before the question is drawn and the
 * difficulty decides the movement range. It lives in
 * `mechanicPayload.marhalaDifficulty`, owned by this mechanic.
 *
 * Deliberately **not** `comboStage`. A Combo stage is a position in a fixed
 * four-question progression; a Marhala difficulty is a risk band a team elects,
 * with no order and no progression. Sharing the field would let one mechanic's
 * rebalance silently change the other's gameplay.
 *
 * Equally deliberately **not** a shared `ContentItem.difficulty`. `difficulty` is a
 * REJECTED_LEGACY_CONTENT_FIELD — the World Content domain carries no points and no
 * difficulty — and Marhala is not entitled to reintroduce that vocabulary for every
 * other mechanic.
 *
 * Scope and difficulty stay independent dimensions: a Scope answers *what the
 * question is about*, the difficulty answers *how much movement it can buy*. GTA
 * legitimately holds easy, medium and hard questions, and nothing may map a Scope
 * to a difficulty.
 */

/** Author-facing labels, in ascending risk order. */
export const MARHALA_DIFFICULTY_LABELS: Readonly<
  Record<MarhalaDifficulty, string>
> = {
  easy: 'سهل',
  medium: 'متوسط',
  hard: 'صعب',
};

/**
 * Whether a value is an authored Marhala difficulty.
 *
 * The single home of the rule. Authoring-time validation and runtime selection
 * both ask this, so an item the admin form accepted can never be one the draw
 * refuses.
 */
export function isMarhalaDifficulty(
  value: unknown,
): value is MarhalaDifficulty {
  return (
    typeof value === 'string' &&
    (MARHALA_DIFFICULTIES as readonly string[]).includes(value)
  );
}

/** The difficulty on a persisted item, or undefined when it carries none. */
export function marhalaDifficultyOf(
  mechanicPayload: unknown,
): MarhalaDifficulty | undefined {
  const raw = (mechanicPayload as { marhalaDifficulty?: unknown } | undefined)
    ?.marhalaDifficulty;
  return isMarhalaDifficulty(raw) ? raw : undefined;
}

export interface MarhalaRuntimeMedia {
  type: 'none' | 'image' | 'audio';
  url?: string;
  altText?: string;
}

/**
 * Normalizes ContentItem media into the runtime presentation shape for Marhala.
 * Supported types: 'none', 'image', 'audio'.
 * Malformed or missing URLs fall back safely to { type: 'none' }.
 */
export function normalizeMarhalaMedia(media: unknown): MarhalaRuntimeMedia {
  if (!media || typeof media !== 'object') {
    return { type: 'none' };
  }
  const raw = media as {
    type?: string;
    assets?: Array<{ url?: string; altText?: string }>;
    url?: string;
    altText?: string;
    imageUrl?: string;
  };
  const type = (raw.type ?? (raw.imageUrl ? 'image' : 'none')).toLowerCase();

  if (type === 'image') {
    const asset = Array.isArray(raw.assets) ? raw.assets[0] : undefined;
    const url = (asset?.url ?? raw.url ?? raw.imageUrl ?? '').trim();
    const altText = (asset?.altText ?? raw.altText ?? '').trim();
    if (url) {
      return {
        type: 'image',
        url,
        ...(altText ? { altText } : {}),
      };
    }
    return { type: 'none' };
  }

  if (type === 'audio') {
    const asset = Array.isArray(raw.assets) ? raw.assets[0] : undefined;
    const url = (asset?.url ?? raw.url ?? '').trim();
    const altText = (asset?.altText ?? raw.altText ?? '').trim();
    if (url) {
      return {
        type: 'audio',
        url,
        ...(altText ? { altText } : {}),
      };
    }
    return { type: 'none' };
  }

  return { type: 'none' };
}

