import { ContentMediaType } from '../../world-content/domain/world-content.constants';
import { ContentItemMedia } from '../../world-content/domain/world-content.types';

/**
 * The player-facing shape of one question's supplementary media: enough to
 * render it, nothing that identifies its storage. `path`/`filename`/`mimetype`/
 * `size` can carry answer-bearing names and never belong in a public
 * projection — only `url` and an optional caption do.
 */
export interface SafeQuestionMedia {
  type: 'image' | 'audio';
  url: string;
  altText?: string;
}

/**
 * Narrows a ContentItem's raw media to the safe public shape, or `null` for a
 * text-only question. Never throws: unsupported/malformed media (missing
 * asset, blank url, `none`/`video`) degrades to no media rather than failing
 * the projection — a question is never left unrenderable because one field
 * was authored oddly.
 *
 * The one canonical narrowing used by every mechanic whose question media is a
 * single generic `ContentItem.media` (RYO, Closest). Mechanics with their own
 * per-part media shape (Laqatha's per-clue ladder, First Note's mandatory
 * audio) keep their own narrower projection — this only reduces duplication
 * where the need is genuinely identical.
 */
export function toSafeQuestionMedia(
  media: ContentItemMedia | null | undefined,
): SafeQuestionMedia | null {
  if (!media) return null;
  if (
    media.type !== ContentMediaType.IMAGE &&
    media.type !== ContentMediaType.AUDIO
  ) {
    return null;
  }
  const url = media.assets?.[0]?.url?.trim();
  if (!url) return null;
  const altText = media.assets[0]?.altText?.trim();
  return {
    type: media.type === ContentMediaType.IMAGE ? 'image' : 'audio',
    url,
    ...(altText ? { altText } : {}),
  };
}
