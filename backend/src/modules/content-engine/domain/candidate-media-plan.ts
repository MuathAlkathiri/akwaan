import type { EffectiveStatus } from '../../media-rights/domain/media-rights.policy';
import {
  MEDIA_CONTRACT_VERSION,
  MediaAcquisition,
  MediaPurpose,
  MediaRequirementEntry,
  MediaSlotRequirement,
  mediaRequirementsDigest,
  resolveMediaRequirements,
} from './media-requirements';

/**
 * Candidate media state (roadmap §30.22 Track B, Phase 1).
 *
 * Lives beside the draft on `EngineCandidateDocument`, never inside it: the
 * draft becomes a `CreateContentItemDto` and is validated with
 * `forbidNonWhitelisted`. The asset a slot resolves to is written into the
 * draft separately; this plan is the evidence of where it came from and of the
 * human media decision about it.
 *
 * Media decisions are versioned by `mediaReviewRevision`, independently of the
 * text `reviewRevision`. Reviewing, replacing or rejecting an image therefore
 * never invalidates a factual or quality assessment, and a text edit never
 * silently re-approves an image.
 */

export type CandidateMediaSlotStatus =
  'planned' | 'resolved' | 'failed' | 'skipped';
export type CandidateMediaReviewStatus = 'pending' | 'approved' | 'rejected';
export type CandidateMediaRightsStatus = EffectiveStatus;

export interface CandidateMediaAsset {
  url: string;
  mimetype?: string;
  width?: number;
  height?: number;
  sha256?: string;
}

export interface CandidateMediaProvenance {
  acquisition: MediaAcquisition;
  provider: string;
  sourceUrl?: string;
  model?: string;
  licenceNote?: string;
  /** Ledger reservation that paid for it, when it cost anything. */
  reservationId?: string;
  derivedFromSlot?: string;
  /** Retrieval evidence (Phase 2): what was asked for and what answered. */
  requestedUrl?: string;
  finalUrl?: string;
  redirects?: string[];
  retrievedAt?: string;
  responseContentType?: string | null;
  byteSize?: number;
  /** The Admin who supplied the asset, for manual uploads. */
  actorId?: string;
}

/**
 * Rights as observed, never as decided by this plan. `media-rights` remains
 * the record of clearance; this is a snapshot for review.
 */
export interface CandidateMediaRights {
  status: CandidateMediaRightsStatus;
  source: 'media-rights' | 'provider' | 'unrecorded';
  licence?: string | null;
  rightsHolder?: string | null;
  observedAt?: string;
}

/** What the authoritative rights record says about one asset right now. */
export interface LiveMediaRights {
  status: CandidateMediaRightsStatus;
  licence?: string | null;
  rightsHolder?: string | null;
}

/**
 * An admin's explicit acceptance of an asset whose rights are not CLEARED.
 * It suppresses nothing and clears nothing: the rights status is unchanged,
 * and the warning is still reported, marked as acknowledged. It is bound to
 * one asset URL and one observed rights status, so a replaced asset or a
 * changed status needs a fresh acknowledgment.
 */
export interface CandidateMediaRightsAcknowledgement {
  assetUrl: string;
  rightsStatus: CandidateMediaRightsStatus;
  actorId: string;
  actorEmail: string;
  at: string;
  mediaReviewRevision: number;
  note: string;
}

/** The human media decision for one slot, bound to one asset and revision. */
export interface CandidateMediaReview {
  status: CandidateMediaReviewStatus;
  assetUrl: string;
  mediaReviewRevision: number;
  actorId: string;
  actorEmail: string;
  at: string;
  reasonCode?: string | null;
  explanation?: string | null;
}

export interface CandidateMediaSlot {
  slotKey: string;
  purpose: MediaPurpose;
  required: boolean;
  status: CandidateMediaSlotStatus;
  asset?: CandidateMediaAsset | null;
  provenance?: CandidateMediaProvenance | null;
  rights?: CandidateMediaRights | null;
  rightsAcknowledgement?: CandidateMediaRightsAcknowledgement | null;
  review?: CandidateMediaReview | null;
  failureReason?: string | null;
}

export type MediaFindingCode =
  | 'MEDIA_REQUIRED_SLOT_MISSING'
  | 'MEDIA_REQUIRED_SLOT_UNRESOLVED'
  | 'MEDIA_REVIEW_REQUIRED'
  | 'MEDIA_REVIEW_REJECTED'
  | 'MEDIA_REVIEW_STALE'
  | 'MEDIA_DRAFT_MISMATCH'
  | 'MEDIA_RIGHTS_BLOCKED'
  | 'MEDIA_RIGHTS_ACKNOWLEDGMENT_REQUIRED'
  | 'MEDIA_RIGHTS_NOT_CLEARED'
  | 'MEDIA_DECORATIVE_UNAVAILABLE'
  | 'MEDIA_SLOT_UNREGISTERED';

export interface MediaFinding {
  code: MediaFindingCode;
  slotKey: string;
  severity: 'blocking' | 'warning';
  message: string;
  /** Only on MEDIA_RIGHTS_NOT_CLEARED. */
  rightsStatus?: CandidateMediaRightsStatus;
  acknowledged?: boolean;
}

/** What the registry says about one slot, for the review surface. */
export interface CandidateMediaSlotDescriptor {
  slotKey: string;
  purpose: MediaPurpose;
  required: boolean;
  mediaType: 'image' | 'audio';
  /** Whether an Admin upload can fill this slot today. */
  uploadSupported: boolean;
  uploadUnsupportedReason: string | null;
}

export interface CandidateMediaReadiness {
  /** False for every candidate outside the media contract: nothing applies. */
  governed: boolean;
  /** Registry slots for the candidate's target, in registry order. */
  slots: CandidateMediaSlotDescriptor[];
  contractVersion: typeof MEDIA_CONTRACT_VERSION | null;
  requirementsDigest: string | null;
  mediaReviewRevision: number;
  requiredSlotKeys: string[];
  ready: boolean;
  blockers: MediaFinding[];
  warnings: MediaFinding[];
}

export interface CandidateMediaInput {
  mechanicKey?: string | null;
  scopeKey?: string | null;
  draft?: Record<string, unknown> | null;
  mediaPlan?: readonly CandidateMediaSlot[] | null;
  mediaReviewRevision?: number | null;
}

const assetUrlsAt = (
  draft: Record<string, unknown> | null | undefined,
  path: string,
): string[] => {
  let cursor: unknown = draft;
  for (const segment of path.split('.')) {
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) {
      return [];
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  const assets = (cursor as { assets?: unknown } | undefined)?.assets;
  if (!Array.isArray(assets)) return [];
  return assets
    .map((asset) => (asset as { url?: unknown })?.url)
    .filter((url): url is string => typeof url === 'string')
    .map((url) => url.trim())
    .filter(Boolean);
};

const resolvedUrl = (slot: CandidateMediaSlot | undefined): string | null => {
  const url = slot?.asset?.url?.trim();
  return slot?.status === 'resolved' && url ? url : null;
};

/**
 * Whether a candidate's media may be approved, and why not.
 *
 * Required slots come from the registry for the candidate's own target. The
 * plan only supplies evidence for them; a slot absent from the plan is
 * MEDIA_REQUIRED_SLOT_MISSING. Decorative media never blocks — the World
 * Question Fallback covers it — and rights never block unless explicitly
 * recorded as BLOCKED.
 */
export function evaluateCandidateMedia(
  input: CandidateMediaInput,
  registry?: readonly MediaRequirementEntry[],
): CandidateMediaReadiness {
  const requirements = resolveMediaRequirements(
    { mechanicKey: input.mechanicKey, scopeKey: input.scopeKey },
    registry,
  );
  const plan = Array.isArray(input.mediaPlan) ? input.mediaPlan : [];
  const mediaReviewRevision =
    typeof input.mediaReviewRevision === 'number'
      ? input.mediaReviewRevision
      : 0;
  const governed = requirements.length > 0 || plan.length > 0;
  const blockers: MediaFinding[] = [];
  const warnings: MediaFinding[] = [];

  const slots: CandidateMediaSlotDescriptor[] = requirements.map(
    (requirement) => {
      const unsupported =
        requirement.uploadUnsupportedReason ??
        (requirement.mediaType !== 'image'
          ? 'AUDIO_UPLOAD_NOT_SUPPORTED'
          : !requirement.acquisition.includes('upload')
            ? 'UPLOAD_NOT_ACCEPTED'
            : null);
      return {
        slotKey: requirement.slotKey,
        purpose: requirement.purpose,
        required: requirement.required,
        mediaType: requirement.mediaType,
        uploadSupported: unsupported === null,
        uploadUnsupportedReason: unsupported,
      };
    },
  );

  if (!governed) {
    return {
      governed: false,
      slots,
      contractVersion: null,
      requirementsDigest: null,
      mediaReviewRevision,
      requiredSlotKeys: [],
      ready: true,
      blockers,
      warnings,
    };
  }

  const bySlot = new Map<string, CandidateMediaSlot>();
  for (const slot of plan) {
    if (slot && typeof slot.slotKey === 'string') {
      bySlot.set(slot.slotKey, slot);
    }
  }
  const registered = new Set(requirements.map((slot) => slot.slotKey));

  for (const requirement of requirements) {
    const slot = bySlot.get(requirement.slotKey);
    if (requirement.purpose === 'gameplay' && requirement.required) {
      blockers.push(
        ...gameplayBlockers(
          requirement,
          slot,
          input.draft,
          mediaReviewRevision,
        ),
      );
    } else {
      warnings.push(...decorativeWarnings(requirement.slotKey, slot));
    }
    if (slot) {
      // Rights gate only what will actually ship: the asset at this slot's
      // draft path. Anything else about this slot is reported, not enforced.
      const url = resolvedUrl(slot);
      const includedInDraft = Boolean(
        url && assetUrlsAt(input.draft, requirement.targetPath).includes(url),
      );
      warnings.push(...rightsFindings(slot, blockers, includedInDraft));
    }
  }

  // Plan entries the contract does not know cannot satisfy or create a
  // requirement. They are surfaced so a reviewer sees them, and never block.
  for (const slot of plan) {
    if (!slot || registered.has(slot.slotKey)) continue;
    warnings.push({
      code: 'MEDIA_SLOT_UNREGISTERED',
      slotKey: String(slot.slotKey ?? ''),
      severity: 'warning',
      message:
        'Media slot is not part of the media contract for this target; it neither satisfies nor creates a requirement.',
    });
    if (slot.purpose === 'decorative') {
      warnings.push(...decorativeWarnings(slot.slotKey, slot));
    }
    warnings.push(...rightsFindings(slot, blockers, false));
  }

  return {
    governed: true,
    slots,
    contractVersion: MEDIA_CONTRACT_VERSION,
    requirementsDigest: requirements.length
      ? mediaRequirementsDigest(requirements)
      : null,
    mediaReviewRevision,
    requiredSlotKeys: requirements
      .filter((slot) => slot.purpose === 'gameplay' && slot.required)
      .map((slot) => slot.slotKey),
    ready: blockers.length === 0,
    blockers,
    warnings,
  };
}

function gameplayBlockers(
  requirement: MediaSlotRequirement,
  slot: CandidateMediaSlot | undefined,
  draft: Record<string, unknown> | null | undefined,
  mediaReviewRevision: number,
): MediaFinding[] {
  const blocking = (
    code: MediaFindingCode,
    message: string,
  ): MediaFinding[] => [
    { code, slotKey: requirement.slotKey, severity: 'blocking', message },
  ];
  if (!slot) {
    return blocking(
      'MEDIA_REQUIRED_SLOT_MISSING',
      'Required gameplay media has no plan entry; the World fallback cannot substitute for it.',
    );
  }
  const url = resolvedUrl(slot);
  if (!url) {
    return blocking(
      'MEDIA_REQUIRED_SLOT_UNRESOLVED',
      `Required gameplay media is ${slot.status}${slot.failureReason ? ` (${slot.failureReason})` : ''}; an asset must be resolved or provided manually.`,
    );
  }
  const review = slot.review;
  if (!review || review.status === 'pending') {
    return blocking(
      'MEDIA_REVIEW_REQUIRED',
      'Required gameplay media needs a human media approval.',
    );
  }
  // A decision is bound to the asset it saw. The media revision is a CAS token,
  // not a validity window: a later rights acknowledgment on the same asset
  // bumps it without staling the review. A decision claiming a revision the
  // candidate never reached is inconsistent and treated as stale.
  if (
    review.assetUrl?.trim() !== url ||
    typeof review.mediaReviewRevision !== 'number' ||
    review.mediaReviewRevision > mediaReviewRevision
  ) {
    return blocking(
      'MEDIA_REVIEW_STALE',
      'The media decision was made for a different asset or media revision; review the current asset.',
    );
  }
  if (review.status === 'rejected') {
    return blocking(
      'MEDIA_REVIEW_REJECTED',
      'Required gameplay media was rejected; replace it or provide one manually.',
    );
  }
  if (!assetUrlsAt(draft, requirement.targetPath).includes(url)) {
    return blocking(
      'MEDIA_DRAFT_MISMATCH',
      `The approved asset is not the one at draft.${requirement.targetPath}.`,
    );
  }
  return [];
}

function decorativeWarnings(
  slotKey: string,
  slot: CandidateMediaSlot | undefined,
): MediaFinding[] {
  const usable =
    resolvedUrl(slot) !== null && slot?.review?.status !== 'rejected';
  if (usable) return [];
  return [
    {
      code: 'MEDIA_DECORATIVE_UNAVAILABLE',
      slotKey,
      severity: 'warning',
      message:
        'Decorative media is unavailable; the World Question Fallback applies.',
    },
  ];
}

/**
 * The approved rights policy (§30.22 decision 6), for one resolved asset:
 *
 * - CLEARED: nothing to report;
 * - BLOCKED: a hard blocker, never acknowledgeable;
 * - UNKNOWN / PENDING / EXPIRED on an asset the canonical draft will carry:
 *   blocking until an Admin acknowledges this exact asset at this exact
 *   status, then a non-blocking warning marked acknowledged;
 * - the same statuses on an asset the draft will not carry: a warning only.
 *
 * Acknowledgment never changes the status itself.
 */
function rightsFindings(
  slot: CandidateMediaSlot,
  blockers: MediaFinding[],
  includedInDraft: boolean,
): MediaFinding[] {
  const url = resolvedUrl(slot);
  if (!url) return [];
  const status: CandidateMediaRightsStatus = slot.rights?.status ?? 'UNKNOWN';
  if (status === 'CLEARED') return [];
  if (status === 'BLOCKED') {
    blockers.push({
      code: 'MEDIA_RIGHTS_BLOCKED',
      slotKey: slot.slotKey,
      severity: 'blocking',
      rightsStatus: status,
      message:
        'Media rights are recorded as BLOCKED; this asset cannot be used.',
    });
    return [];
  }
  const ack = slot.rightsAcknowledgement;
  const acknowledged = Boolean(
    ack && ack.assetUrl?.trim() === url && ack.rightsStatus === status,
  );
  if (includedInDraft && !acknowledged) {
    blockers.push({
      code: 'MEDIA_RIGHTS_ACKNOWLEDGMENT_REQUIRED',
      slotKey: slot.slotKey,
      severity: 'blocking',
      rightsStatus: status,
      acknowledged: false,
      message: `Media rights are ${status}; an Admin must acknowledge this asset before approval or draft creation. Acknowledgment does not clear the rights.`,
    });
    return [];
  }
  return [
    {
      code: 'MEDIA_RIGHTS_NOT_CLEARED',
      slotKey: slot.slotKey,
      severity: 'warning',
      rightsStatus: status,
      acknowledged,
      message: acknowledged
        ? `Media rights are ${status}; an admin acknowledged this asset without clearing it.`
        : `Media rights are ${status}; an admin may acknowledge this asset, which does not clear it.`,
    },
  ];
}

export class CandidateMediaTransitionError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

interface MediaActor {
  actorId: string;
  actorEmail: string;
}

interface MediaState {
  mediaPlan?: readonly CandidateMediaSlot[] | null;
  mediaReviewRevision?: number | null;
}

const currentSlot = (state: MediaState, slotKey: string) => {
  const plan = Array.isArray(state.mediaPlan) ? state.mediaPlan : [];
  const index = plan.findIndex((slot) => slot.slotKey === slotKey);
  if (index === -1) {
    throw new CandidateMediaTransitionError(
      'MEDIA_SLOT_NOT_FOUND',
      `No media plan entry for slot "${slotKey}"`,
    );
  }
  return { plan, index, slot: plan[index] };
};

const revisionOf = (state: MediaState) =>
  typeof state.mediaReviewRevision === 'number' ? state.mediaReviewRevision : 0;

/**
 * Records a human media decision. Returns only media fields: the caller writes
 * them under a CAS on `mediaReviewRevision`, leaving `reviewRevision`,
 * `humanAssessment` and `reviewDecision` untouched.
 */
export function recordMediaReview(
  state: MediaState,
  input: MediaActor & {
    slotKey: string;
    expectedMediaReviewRevision: number;
    status: Exclude<CandidateMediaReviewStatus, 'pending'>;
    reasonCode?: string | null;
    explanation?: string | null;
    at: Date;
  },
): { mediaPlan: CandidateMediaSlot[]; mediaReviewRevision: number } {
  const revision = revisionOf(state);
  if (input.expectedMediaReviewRevision !== revision) {
    throw new CandidateMediaTransitionError(
      'MEDIA_REVISION_CONFLICT',
      'Candidate media changed; reload before reviewing',
    );
  }
  const { plan, index, slot } = currentSlot(state, input.slotKey);
  const url = resolvedUrl(slot);
  if (!url) {
    throw new CandidateMediaTransitionError(
      'MEDIA_SLOT_UNRESOLVED',
      'Only a resolved asset can be reviewed',
    );
  }
  if (input.status === 'rejected' && !input.explanation?.trim()) {
    throw new CandidateMediaTransitionError(
      'MEDIA_REJECTION_EXPLANATION_REQUIRED',
      'Rejecting media requires an explanation',
    );
  }
  const nextRevision = revision + 1;
  const next = [...plan];
  next[index] = {
    ...slot,
    review: {
      status: input.status,
      assetUrl: url,
      mediaReviewRevision: nextRevision,
      actorId: input.actorId,
      actorEmail: input.actorEmail,
      at: input.at.toISOString(),
      reasonCode: input.reasonCode ?? null,
      explanation: input.explanation?.trim() || null,
    },
  };
  return { mediaPlan: next, mediaReviewRevision: nextRevision };
}

/**
 * Acknowledges a non-CLEARED rights status for the slot's current asset. The
 * slot's `rights` snapshot is carried over untouched — acknowledgment is never
 * clearance.
 */
export function acknowledgeMediaRights(
  state: MediaState,
  input: MediaActor & {
    slotKey: string;
    expectedMediaReviewRevision: number;
    note: string;
    at: Date;
  },
): { mediaPlan: CandidateMediaSlot[]; mediaReviewRevision: number } {
  const revision = revisionOf(state);
  if (input.expectedMediaReviewRevision !== revision) {
    throw new CandidateMediaTransitionError(
      'MEDIA_REVISION_CONFLICT',
      'Candidate media changed; reload before acknowledging rights',
    );
  }
  const { plan, index, slot } = currentSlot(state, input.slotKey);
  const url = resolvedUrl(slot);
  if (!url) {
    throw new CandidateMediaTransitionError(
      'MEDIA_SLOT_UNRESOLVED',
      'Only a resolved asset can have its rights acknowledged',
    );
  }
  const status = slot.rights?.status ?? 'UNKNOWN';
  if (status === 'CLEARED') {
    throw new CandidateMediaTransitionError(
      'MEDIA_RIGHTS_ALREADY_CLEARED',
      'Cleared rights need no acknowledgment',
    );
  }
  if (status === 'BLOCKED') {
    throw new CandidateMediaTransitionError(
      'MEDIA_RIGHTS_BLOCKED',
      'BLOCKED rights cannot be acknowledged; change the rights record or replace the asset',
    );
  }
  if (!input.note?.trim()) {
    throw new CandidateMediaTransitionError(
      'MEDIA_RIGHTS_ACK_NOTE_REQUIRED',
      'A rights acknowledgment requires a note',
    );
  }
  const nextRevision = revision + 1;
  const next = [...plan];
  next[index] = {
    ...slot,
    rightsAcknowledgement: {
      assetUrl: url,
      rightsStatus: status,
      actorId: input.actorId,
      actorEmail: input.actorEmail,
      at: input.at.toISOString(),
      mediaReviewRevision: nextRevision,
      note: input.note.trim(),
    },
  };
  return { mediaPlan: next, mediaReviewRevision: nextRevision };
}

/** Append-only media history, kept apart from the text `reviewEvents`. */
export interface CandidateMediaEvent {
  action:
    | 'media_attached'
    | 'media_reviewed'
    | 'media_rights_acknowledged'
    | 'media_reviews_invalidated';
  slotKeys: string[];
  actorId: string;
  actorEmail: string;
  occurredAt: Date;
  /** The media revision this event produced. */
  mediaReviewRevision: number;
  /** The text revision at the time, for correlating with `reviewEvents`. */
  reviewRevision: number;
  details: Record<string, unknown>;
}

/**
 * Puts a new asset into a registry slot. The slot is rebuilt from the
 * requirement, so its purpose and required flag can only come from the
 * registry, and the previous media decision and rights acknowledgment are not
 * carried over — they were about a different asset.
 */
export function replaceMediaSlotAsset(
  state: MediaState,
  input: {
    requirement: Pick<MediaSlotRequirement, 'slotKey' | 'purpose' | 'required'>;
    expectedMediaReviewRevision: number;
    asset: CandidateMediaAsset;
    provenance: CandidateMediaProvenance;
    rights: CandidateMediaRights;
  },
): {
  mediaPlan: CandidateMediaSlot[];
  mediaReviewRevision: number;
  previous: CandidateMediaSlot | null;
} {
  const revision = revisionOf(state);
  if (input.expectedMediaReviewRevision !== revision) {
    throw new CandidateMediaTransitionError(
      'MEDIA_REVISION_CONFLICT',
      'Candidate media changed; reload before replacing the asset',
    );
  }
  if (!input.asset?.url?.trim()) {
    throw new CandidateMediaTransitionError(
      'MEDIA_ASSET_INVALID',
      'A replacement asset needs a stored URL',
    );
  }
  const plan = Array.isArray(state.mediaPlan) ? [...state.mediaPlan] : [];
  const index = plan.findIndex(
    (slot) => slot.slotKey === input.requirement.slotKey,
  );
  const next: CandidateMediaSlot = {
    slotKey: input.requirement.slotKey,
    purpose: input.requirement.purpose,
    required: input.requirement.required,
    status: 'resolved',
    asset: input.asset,
    provenance: input.provenance,
    rights: input.rights,
    rightsAcknowledgement: null,
    review: null,
    failureReason: null,
  };
  const previous = index === -1 ? null : plan[index];
  if (index === -1) plan.push(next);
  else plan[index] = next;
  return { mediaPlan: plan, mediaReviewRevision: revision + 1, previous };
}

/**
 * A material question edit can change what an image is supposed to show, so
 * every media decision made against the old question is withdrawn. Rights
 * acknowledgments stay: they concern the asset, not the question.
 * Returns null when there was nothing to withdraw.
 */
export function invalidateMediaReviews(state: MediaState): {
  mediaPlan: CandidateMediaSlot[];
  mediaReviewRevision: number;
  invalidated: Array<{ slotKey: string; review: CandidateMediaReview }>;
} | null {
  const plan = Array.isArray(state.mediaPlan) ? state.mediaPlan : [];
  const invalidated: Array<{ slotKey: string; review: CandidateMediaReview }> =
    [];
  const next = plan.map((slot) => {
    if (!slot.review || slot.review.status === 'pending') return slot;
    invalidated.push({ slotKey: slot.slotKey, review: slot.review });
    return { ...slot, review: null };
  });
  if (!invalidated.length) return null;
  return {
    mediaPlan: next,
    mediaReviewRevision: revisionOf(state) + 1,
    invalidated,
  };
}

/**
 * Replaces each resolved slot's rights snapshot with the current record.
 * The rights record is authoritative and can change after attachment (for
 * example to BLOCKED), so gates read it live rather than trusting a snapshot.
 * Assets without a live status keep their snapshot.
 */
export function withLiveRights(
  plan: readonly CandidateMediaSlot[] | null | undefined,
  liveByUrl: ReadonlyMap<string, CandidateMediaRightsStatus | LiveMediaRights>,
  observedAt: Date,
): CandidateMediaSlot[] {
  return (Array.isArray(plan) ? plan : []).map((slot) => {
    const url = slot?.asset?.url?.trim();
    const found = url ? liveByUrl.get(url) : undefined;
    if (!found) return slot;
    const live: LiveMediaRights =
      typeof found === 'string' ? { status: found } : found;
    return {
      ...slot,
      rights: {
        ...(slot.rights ?? {}),
        status: live.status,
        source: 'media-rights',
        // Only what the record actually holds; absent stays absent.
        ...(live.licence !== undefined ? { licence: live.licence } : {}),
        ...(live.rightsHolder !== undefined
          ? { rightsHolder: live.rightsHolder }
          : {}),
        observedAt: observedAt.toISOString(),
      },
    };
  });
}
