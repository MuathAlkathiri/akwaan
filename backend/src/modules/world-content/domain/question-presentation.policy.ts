import { ContentMediaType } from './world-content.constants';
import type { ContentAssetRef, ContentItemMedia } from './world-content.types';

/**
 * Question visual presentation precedence (roadmap §30.22 Track A).
 *
 * One rule decides what the shared screen shows behind and inside a question:
 *
 *   Required Gameplay Media  →  Approved Decorative Media  →  World Question Fallback
 *
 * The invariants this exists to protect (§30.22 decisions 1, 3 and 5):
 *
 * - **Non-substitution.** A World Question Fallback is never a stand-in for
 *   required gameplay media. When a mechanic cannot be played without its own
 *   asset and that asset is not resolved, this returns *nothing* to paint and a
 *   blocking defect — a calm backdrop that makes a broken question look finished
 *   is worse than an obviously empty stage.
 * - **Native aspect ratio for gameplay media.** 16:9 and `object-cover` belong to
 *   the World's own artwork alone. A FIFA card, a car part, a puzzle diagram or a
 *   celebrity photograph is shown whole, at its own ratio, never cropped to fit.
 * - **Audio-visual coexistence.** An audio question has no visual of its own, so
 *   the World artwork may sit behind it. It is a backdrop and nothing else: it
 *   carries no media element, so it cannot touch playback, readiness probing,
 *   server-authoritative replay or phone redaction.
 * - **Zero duplication.** The fallback is read from the World; it is never copied
 *   into a ContentItem, and this policy never writes anything.
 *
 * The decision is taken on the server and sent to the screen, so the host, the
 * phones and any replay agree on what was shown.
 */

/** What fills the question's own visual area. */
export type QuestionStageSource =
  'gameplay-media' | 'decorative-media' | 'none';

/** What may sit behind it. */
export type QuestionBackdropSource = 'world-fallback' | 'none';

/**
 * How an asset is fitted. `native` shows it whole at its own ratio; `cover-16x9`
 * is the World artwork's own treatment and is never applied to anything else.
 */
export type QuestionVisualFit = 'native' | 'cover-16x9';

export type QuestionPresentationDefectCode =
  /** The mechanic needs its own asset and none is resolved. */
  | 'GAMEPLAY_MEDIA_MISSING'
  /** Nothing at all can be shown: this World has no fallback artwork yet. */
  | 'WORLD_FALLBACK_MISSING';

export interface QuestionPresentationDefect {
  code: QuestionPresentationDefectCode;
  /** `blocking` means the question must not be presented as if it were whole. */
  severity: 'blocking' | 'advisory';
  message: string;
}

export interface QuestionPresentation {
  stage: {
    source: QuestionStageSource;
    asset: ContentAssetRef | null;
    /** Always native: everything the question owns keeps its own ratio. */
    fit: 'native';
    /** Audio gameplay media plays with no visual of its own. */
    mediaType: ContentMediaType | null;
  };
  backdrop: {
    source: QuestionBackdropSource;
    asset: ContentAssetRef | null;
    fit: 'cover-16x9';
  };
  defects: QuestionPresentationDefect[];
}

export interface QuestionPresentationInput {
  /** The item's own media, as stored. */
  itemMedia?: ContentItemMedia | null;
  /**
   * Whether this item's mechanic cannot be played without its own media.
   *
   * The caller owns this answer. The mechanic policies already decide it at
   * READY — `EKSHIFNI_IMAGE_INVALID`, `PUZZLE_SCOPE_REQUIRES_MEDIA`, the Odd
   * Piece V2 twins, First Note's audio — and restating that list here would
   * give it a second home to drift from.
   */
  gameplayMediaRequired?: boolean;
  /**
   * An approved decorative asset for this item, when one exists. Nothing
   * produces one today; media enrichment will, and it already has its place.
   */
  decorativeAsset?: ContentAssetRef | null;
  /** The World's one fallback artwork (`World.questionFallback`). */
  worldQuestionFallback?: ContentAssetRef | null;
}

const resolvedAsset = (
  media: ContentItemMedia | null | undefined,
): ContentAssetRef | null => {
  if (!media || media.type === ContentMediaType.NONE) return null;
  const asset = (media.assets ?? []).find(
    (candidate) => typeof candidate?.url === 'string' && candidate.url.trim(),
  );
  return asset ?? null;
};

const usableAsset = (
  asset: ContentAssetRef | null | undefined,
): ContentAssetRef | null =>
  asset && typeof asset.url === 'string' && asset.url.trim() ? asset : null;

const EMPTY_BACKDROP = {
  source: 'none',
  asset: null,
  fit: 'cover-16x9',
} as const;

/**
 * Resolves what one question shows. Pure: it reads the item, the World and the
 * mechanic's own requirement, and returns a decision plus whatever is wrong
 * with it.
 */
export function resolveQuestionPresentation(
  input: QuestionPresentationInput,
): QuestionPresentation {
  const gameplay = resolvedAsset(input.itemMedia);
  const defects: QuestionPresentationDefect[] = [];

  if (gameplay) {
    const mediaType = input.itemMedia?.type ?? null;
    const audioOnly = mediaType === ContentMediaType.AUDIO;
    // An audio question occupies no pixels, so the World artwork may sit behind
    // it. A visual one gets the screen to itself: artwork behind a photograph a
    // team is trying to read is a distraction at best and a clue at worst.
    const backdrop = audioOnly
      ? backdropFor(input.worldQuestionFallback, defects)
      : EMPTY_BACKDROP;
    return {
      stage: {
        source: 'gameplay-media',
        asset: gameplay,
        fit: 'native',
        mediaType,
      },
      backdrop,
      defects,
    };
  }

  if (input.gameplayMediaRequired) {
    // The non-substitution invariant. Nothing is painted, and the defect is
    // blocking: whoever presents this must show that the question is incomplete
    // rather than quietly dressing it in the World's artwork.
    defects.push({
      code: 'GAMEPLAY_MEDIA_MISSING',
      severity: 'blocking',
      message:
        'This mechanic requires its own media and none is resolved; the World Question Fallback cannot substitute for it.',
    });
    return {
      stage: { source: 'none', asset: null, fit: 'native', mediaType: null },
      backdrop: EMPTY_BACKDROP,
      defects,
    };
  }

  const decorative = usableAsset(input.decorativeAsset);
  if (decorative) {
    // Item artwork is the question's own illustration, so it keeps its ratio and
    // takes precedence over the World's. Painting both would be noise.
    return {
      stage: {
        source: 'decorative-media',
        asset: decorative,
        fit: 'native',
        mediaType: ContentMediaType.IMAGE,
      },
      backdrop: EMPTY_BACKDROP,
      defects,
    };
  }

  return {
    stage: { source: 'none', asset: null, fit: 'native', mediaType: null },
    backdrop: backdropFor(input.worldQuestionFallback, defects),
    defects,
  };
}

/**
 * The graceful downgrade (§30.22 decision 5): a World with no artwork yet is a
 * finding for whoever authors it, never a failure for the team playing.
 */
function backdropFor(
  fallback: ContentAssetRef | null | undefined,
  defects: QuestionPresentationDefect[],
): QuestionPresentation['backdrop'] {
  const asset = usableAsset(fallback);
  if (!asset) {
    defects.push({
      code: 'WORLD_FALLBACK_MISSING',
      severity: 'advisory',
      message:
        'This World has no question fallback artwork; the question is presented without a backdrop.',
    });
    return EMPTY_BACKDROP;
  }
  return { source: 'world-fallback', asset, fit: 'cover-16x9' };
}
