/**
 * What picture a candidate needs, stated by whoever authored it.
 *
 * An intent is a request, not an asset: it names a real subject to look for and
 * what the picture must not give away. It lives in the candidate's authoring
 * metadata, beside the draft and never inside it — the draft becomes a
 * `CreateContentItemDto`, and nothing about how an image was chosen belongs in
 * canonical content.
 */

export const BOMB_IMAGE_KINDS = [
  'person',
  'club-or-brand-mark',
  'place',
  'vehicle',
  'object',
  'work-or-scene',
  'other',
] as const;

export type BombImageKind = (typeof BOMB_IMAGE_KINDS)[number];

export interface CandidateMediaIntent {
  /** The media slot this intent is for, as named in `MEDIA_REQUIREMENTS`. */
  slotKey: string;
  /** The subject's catalogue name, in Latin script — the phrase to search. */
  subject: string;
  subjectAr?: string;
  kind: BombImageKind;
  /** What would answer the question if it were readable in the picture. */
  mustNotShow: string[];
  /** A description that does not state the answer. */
  altText?: string;
}

/** The intent recorded for a slot, if the authoring metadata carries one. */
export function mediaIntentOf(
  authoring: unknown,
  slotKey: string,
): CandidateMediaIntent | null {
  const intent = (authoring as { mediaIntent?: unknown } | null | undefined)
    ?.mediaIntent as Partial<CandidateMediaIntent> | undefined;
  if (!intent || typeof intent !== 'object') return null;
  if (intent.slotKey !== slotKey) return null;
  if (typeof intent.subject !== 'string' || !intent.subject.trim()) return null;
  return {
    slotKey,
    subject: intent.subject.trim(),
    ...(typeof intent.subjectAr === 'string' && intent.subjectAr.trim()
      ? { subjectAr: intent.subjectAr.trim() }
      : {}),
    kind: (BOMB_IMAGE_KINDS as readonly string[]).includes(String(intent.kind))
      ? (intent.kind as BombImageKind)
      : 'other',
    mustNotShow: Array.isArray(intent.mustNotShow)
      ? intent.mustNotShow.filter(
          (entry): entry is string =>
            typeof entry === 'string' && Boolean(entry.trim()),
        )
      : [],
    ...(typeof intent.altText === 'string' && intent.altText.trim()
      ? { altText: intent.altText.trim() }
      : {}),
  };
}
