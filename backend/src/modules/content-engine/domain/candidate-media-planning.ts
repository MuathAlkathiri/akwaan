import {
  MEDIA_REQUIREMENTS,
  MediaRequirementEntry,
  MediaSlotRequirement,
  resolveMediaRequirements,
} from './media-requirements';
import type { CandidateMediaSlot } from './candidate-media-plan';
import type { EngineMediaFlags } from './engine-media-flags';

/**
 * The media planning stage of the engine pipeline (roadmap §30.22, decision 2,
 * lifecycle step 6).
 *
 * It runs after deterministic screening and quality judging, on the candidates
 * that survived, and before human review — the order is the point. Media is the
 * expensive part of authoring, so nothing is spent on a candidate that failed a
 * free check first.
 *
 * This module decides *what each slot needs* and records it. It fetches
 * nothing: acquisition is the next phase, and keeping the decision pure means
 * the record a reviewer reads is reproducible from the registry and the flags
 * alone.
 *
 * Two invariants shape everything here:
 *
 * - **A candidate outside the media contract is never given a plan.**
 *   `evaluateCandidateMedia` treats *any* plan entry as proof that a candidate
 *   is media-governed, so writing an empty courtesy plan onto a text question
 *   would gate its approval on media nobody requires. Ungoverned means
 *   untouched, byte for byte.
 * - **The pipeline never overwrites a human.** A slot that already carries an
 *   asset, a media decision or a rights acknowledgment is left exactly as it
 *   is. A job can be resumed or retried, and a retry that erased an Admin's
 *   uploaded image would be the worst kind of data loss: silent.
 */

/** Why a slot is still unfilled after the stage ran. */
export type MediaPlanningReason =
  /** The enrichment switch is off, so nothing was attempted. */
  | 'MEDIA_ENRICHMENT_DISABLED'
  /** Retrieval is wanted and enabled, but no provider is wired yet. */
  | 'MEDIA_RETRIEVAL_NOT_CONFIGURED'
  /** Generation is wanted and enabled, but no generator is wired yet. */
  | 'MEDIA_GENERATION_NOT_CONFIGURED'
  /** No acquisition route this engine can take: a human must supply it. */
  | 'MEDIA_ACQUISITION_UNSUPPORTED';

export interface MediaPlanningInput {
  mechanicKey?: string | null;
  scopeKey?: string | null;
  mediaPlan?: readonly CandidateMediaSlot[] | null;
  flags: EngineMediaFlags;
}

export interface MediaPlanningOutcome {
  /** Whether the media contract applies to this candidate at all. */
  governed: boolean;
  /**
   * The plan to store, or `null` when there is nothing to write — either the
   * candidate is ungoverned, or the stored plan already says this.
   */
  mediaPlan: CandidateMediaSlot[] | null;
  /** Required gameplay slots now recorded as awaited. */
  planned: string[];
  /** Decorative slots recorded as not coming. */
  skipped: string[];
  /** Slots left alone because a human or an earlier run settled them. */
  settled: string[];
}

/**
 * A slot nobody may overwrite: it holds an asset, a decision, or an
 * acknowledgment that was made about a specific asset.
 */
const isSettled = (slot: CandidateMediaSlot | undefined): boolean =>
  Boolean(
    slot &&
    (slot.status === 'resolved' ||
      slot.asset?.url?.trim() ||
      slot.review ||
      slot.rightsAcknowledgement),
  );

/**
 * What stops this slot from being filled automatically.
 *
 * Enrichment off is reported first and on its own: with the switch down no
 * acquisition was even considered, and saying anything about providers would
 * imply one was consulted.
 */
const reasonFor = (
  requirement: MediaSlotRequirement,
  flags: EngineMediaFlags,
): MediaPlanningReason => {
  if (!flags.enrichment) return 'MEDIA_ENRICHMENT_DISABLED';
  if (requirement.acquisition.includes('retrieve')) {
    return 'MEDIA_RETRIEVAL_NOT_CONFIGURED';
  }
  if (requirement.acquisition.includes('generate') && flags.imageGeneration) {
    return 'MEDIA_GENERATION_NOT_CONFIGURED';
  }
  return 'MEDIA_ACQUISITION_UNSUPPORTED';
};

export function planCandidateMedia(
  input: MediaPlanningInput,
  registry: readonly MediaRequirementEntry[] = MEDIA_REQUIREMENTS,
): MediaPlanningOutcome {
  const requirements = resolveMediaRequirements(
    { mechanicKey: input.mechanicKey, scopeKey: input.scopeKey },
    registry,
  );
  const stored = Array.isArray(input.mediaPlan) ? input.mediaPlan : [];

  if (requirements.length === 0) {
    // Ungoverned. Not "nothing to do" — nothing *may* be done.
    return {
      governed: false,
      mediaPlan: null,
      planned: [],
      skipped: [],
      settled: [],
    };
  }

  const bySlot = new Map<string, CandidateMediaSlot>();
  for (const slot of stored) {
    if (slot && typeof slot.slotKey === 'string')
      bySlot.set(slot.slotKey, slot);
  }

  const planned: string[] = [];
  const skipped: string[] = [];
  const settled: string[] = [];
  const next: CandidateMediaSlot[] = [];

  for (const requirement of requirements) {
    const existing = bySlot.get(requirement.slotKey);
    if (isSettled(existing)) {
      settled.push(requirement.slotKey);
      next.push(existing!);
      continue;
    }
    const reason = reasonFor(requirement, input.flags);
    // Decorative media is allowed to be absent: the World Question Fallback
    // covers the question, so `skipped` states the truth without pretending
    // something is still on its way. Required gameplay media is the opposite —
    // it stays `planned`, because the question is not whole without it and the
    // readiness gate must keep saying so.
    const decorative =
      requirement.purpose !== 'gameplay' || !requirement.required;
    if (decorative) skipped.push(requirement.slotKey);
    else planned.push(requirement.slotKey);
    next.push({
      slotKey: requirement.slotKey,
      purpose: requirement.purpose,
      required: requirement.required,
      status: decorative ? 'skipped' : 'planned',
      failureReason: reason,
    });
  }

  // Entries the contract does not declare are preserved untouched. The
  // evaluator already surfaces them as unregistered warnings; curating someone
  // else's record is not this stage's job.
  for (const slot of stored) {
    if (!slot || requirements.some((r) => r.slotKey === slot.slotKey)) continue;
    next.push(slot);
  }

  const unchanged = JSON.stringify(stored) === JSON.stringify(next);
  return {
    governed: true,
    mediaPlan: unchanged ? null : next,
    planned,
    skipped,
    settled,
  };
}
