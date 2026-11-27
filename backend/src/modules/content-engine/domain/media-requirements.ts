import { createHash } from 'crypto';
import {
  BOMB_SLUG,
  EKSHIFNI_SLUG,
  FIRST_NOTE_SLUG,
  MOVING_XO_SLUG,
  ODD_PIECE_SLUG,
  FORWARD_PUZZLE_SCOPE_SLUGS,
  VISUAL_PUZZLE_SCOPE_SLUGS,
} from '../../world-content/domain/world-content.constants';

/**
 * Canonical media requirements for Content Engine candidates (roadmap §30.22).
 *
 * This registry — never a candidate's own `mediaPlan` — decides which media
 * slots a candidate must satisfy. A candidate that simply omits a required slot
 * is therefore blocked, not exempted.
 *
 * Only fixed-cardinality slots whose draft location is unambiguous are listed.
 * Mechanics whose media is a variable-length list (القطها clues, ركّبها
 * segments, Marhala) are deliberately absent until they get an indexed slot
 * contract; listing them here with a guessed path would gate approval on a
 * check that cannot be right.
 *
 * القنبلة is listed although a Bomb *challenge* is a run of 10–15 pictures,
 * because each of those is its own ContentItem with exactly one image in
 * `media` (`bomb-content.policy.ts`). The engine authors items, not runs, so
 * the slot it governs is a single, fixed one.
 *
 * القنبلة is also the one mechanic here the engine can generate
 * (`MECHANIC_ANSWER_MODES`). `media-requirements.spec.ts` pins exactly that
 * set, so making another governed mechanic generatable — or governing one that
 * already is — stays a deliberate, reviewed decision rather than a silent
 * retroactive gate on existing candidates.
 */
export const MEDIA_CONTRACT_VERSION = 'media-contract-v1' as const;

export type MediaPurpose = 'gameplay' | 'decorative';
export type MediaSlotMediaType = 'image' | 'audio';
export type MediaAcquisition = 'retrieve' | 'generate' | 'edit' | 'upload';

export interface MediaSlotRequirement {
  /** Stable identity within one mechanic/scope contract. */
  slotKey: string;
  purpose: MediaPurpose;
  required: boolean;
  mediaType: MediaSlotMediaType;
  /**
   * Dot path to the `ContentItemMedia` inside the candidate draft that this
   * slot's approved asset must appear in.
   */
  targetPath: string;
  /** How the asset may be obtained. Ordered by preference. */
  acquisition: MediaAcquisition[];
  /**
   * Gameplay media keeps its native aspect ratio (§30.22 inv. 3). 16:9 belongs
   * to the World Question Fallback (Track A), never to a candidate slot.
   */
  aspectPolicy: 'native';
  /** Another slot this one is derived from, e.g. an edited image's original. */
  derivedFromSlot?: string;
  /**
   * Set when an Admin upload cannot yet produce a valid draft for this slot,
   * so the review UI shows the limitation instead of a control that fails.
   */
  uploadUnsupportedReason?:
    'AUDIO_UPLOAD_NOT_SUPPORTED' | 'ODD_PIECE_V2_IMAGE_FIELDS_NOT_SUPPORTED';
}

export interface MediaRequirementEntry {
  mechanicKey: string;
  /** Absent means every Scope of the mechanic. */
  scopeKeys?: readonly string[];
  /** Scopes the entry does not govern: another entry speaks for them. */
  exceptScopeKeys?: readonly string[];
  slots: readonly MediaSlotRequirement[];
}

/** القنبلة's one media slot. */
export const BOMB_IMAGE_SLOT = 'item-image';

export const MEDIA_REQUIREMENTS: readonly MediaRequirementEntry[] = [
  {
    // القنبلة: every item is one picture round. Required for every World and
    // every archetype, name completion included (Product decision 2026-11-22,
    // roadmap §23.4) — a text-only Bomb item is not authored.
    mechanicKey: BOMB_SLUG,
    exceptScopeKeys: FORWARD_PUZZLE_SCOPE_SLUGS,
    slots: [
      {
        slotKey: BOMB_IMAGE_SLOT,
        purpose: 'gameplay',
        required: true,
        mediaType: 'image',
        targetPath: 'media',
        // A real photograph, found or supplied. Never generated: the subject
        // is a real person, club or place, and a drawn likeness is not one.
        acquisition: ['retrieve', 'upload'],
        aspectPolicy: 'native',
      },
    ],
  },
  {
    // القنبلة in عالم الألغاز (owner decision 2026-11-27): the picture is a
    // puzzle the engine draws — a shadow, a cut-up drawing, dice — so it is
    // generated, never searched for.
    mechanicKey: BOMB_SLUG,
    scopeKeys: FORWARD_PUZZLE_SCOPE_SLUGS,
    slots: [
      {
        slotKey: BOMB_IMAGE_SLOT,
        purpose: 'gameplay',
        required: true,
        mediaType: 'image',
        targetPath: 'media',
        acquisition: ['upload', 'generate'],
        aspectPolicy: 'native',
      },
    ],
  },
  {
    // اكشفني: one canonical celebrity image under six reveal regions.
    mechanicKey: EKSHIFNI_SLUG,
    slots: [
      {
        slotKey: 'subject-image',
        purpose: 'gameplay',
        required: true,
        mediaType: 'image',
        targetPath: 'media',
        acquisition: ['retrieve', 'upload'],
        aspectPolicy: 'native',
      },
    ],
  },
  {
    // من أول نغمة: exactly one playable audio asset.
    mechanicKey: FIRST_NOTE_SLUG,
    slots: [
      {
        slotKey: 'song-audio',
        purpose: 'gameplay',
        required: true,
        mediaType: 'audio',
        targetPath: 'media',
        acquisition: ['retrieve', 'upload'],
        aspectPolicy: 'native',
        // Ingestion and storage handle images only.
        uploadUnsupportedReason: 'AUDIO_UPLOAD_NOT_SUPPORTED',
      },
    ],
  },
  {
    // Cars Signature V2: an authentic original and its modified twin. The
    // hotspot polygon stays in `mechanicPayload`; it is geometry, not media.
    mechanicKey: ODD_PIECE_SLUG,
    slots: [
      {
        slotKey: 'original-image',
        purpose: 'gameplay',
        required: true,
        mediaType: 'image',
        targetPath: 'mechanicPayload.originalImage.media',
        acquisition: ['retrieve', 'upload'],
        aspectPolicy: 'native',
        // V2 also needs width, height, orientation and provenance beside the
        // media; an upload that writes only the media cannot make a valid draft.
        uploadUnsupportedReason: 'ODD_PIECE_V2_IMAGE_FIELDS_NOT_SUPPORTED',
      },
      {
        slotKey: 'modified-image',
        purpose: 'gameplay',
        required: true,
        mediaType: 'image',
        targetPath: 'mechanicPayload.modifiedImage.media',
        acquisition: ['edit', 'upload'],
        aspectPolicy: 'native',
        derivedFromSlot: 'original-image',
        uploadUnsupportedReason: 'ODD_PIECE_V2_IMAGE_FIELDS_NOT_SUPPORTED',
      },
    ],
  },
  {
    // The three definitionally visual Puzzles Scopes, mirroring the canonical
    // PUZZLE_SCOPE_REQUIRES_MEDIA rule for Moving XO.
    mechanicKey: MOVING_XO_SLUG,
    scopeKeys: VISUAL_PUZZLE_SCOPE_SLUGS,
    slots: [
      {
        slotKey: 'puzzle-image',
        purpose: 'gameplay',
        required: true,
        mediaType: 'image',
        targetPath: 'media',
        acquisition: ['upload', 'generate'],
        aspectPolicy: 'native',
      },
    ],
  },
];

/**
 * The slots that govern a candidate's target. Scope-specific entries and
 * mechanic-wide entries both apply; a slot key declared twice is a registry
 * error and fails loudly rather than letting one silently shadow the other.
 */
export function resolveMediaRequirements(
  target: { mechanicKey?: string | null; scopeKey?: string | null },
  registry: readonly MediaRequirementEntry[] = MEDIA_REQUIREMENTS,
): MediaSlotRequirement[] {
  if (!target.mechanicKey) return [];
  const slots: MediaSlotRequirement[] = [];
  const seen = new Set<string>();
  for (const entry of registry) {
    if (entry.mechanicKey !== target.mechanicKey) continue;
    if (
      entry.scopeKeys &&
      !(target.scopeKey && entry.scopeKeys.includes(target.scopeKey))
    ) {
      continue;
    }
    if (
      entry.exceptScopeKeys &&
      target.scopeKey &&
      entry.exceptScopeKeys.includes(target.scopeKey)
    ) {
      continue;
    }
    for (const slot of entry.slots) {
      if (seen.has(slot.slotKey)) {
        throw new Error(
          `MEDIA_REQUIREMENTS_DUPLICATE_SLOT: ${target.mechanicKey}/${slot.slotKey}`,
        );
      }
      seen.add(slot.slotKey);
      slots.push(slot);
    }
  }
  return slots;
}

/** Stable digest of the slots that applied, for recording what was enforced. */
export function mediaRequirementsDigest(
  slots: readonly MediaSlotRequirement[],
): string {
  const canonical = [...slots]
    .sort((a, b) => a.slotKey.localeCompare(b.slotKey))
    .map((slot) => [
      slot.slotKey,
      slot.purpose,
      slot.required,
      slot.mediaType,
      slot.targetPath,
      slot.derivedFromSlot ?? null,
    ]);
  return createHash('sha256')
    .update(JSON.stringify([MEDIA_CONTRACT_VERSION, canonical]))
    .digest('hex');
}
