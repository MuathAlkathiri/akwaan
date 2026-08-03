/**
 * The single ScoreEvent contract for the new system (roadmap 8).
 *
 * Deltas are signed and stored unclamped. Display clamping is a read-time
 * concern and must never rewrite the ledger, because the post-match stat card
 * needs the real values.
 */

/**
 * Module-private brand. A ScoreEvent can only be minted by the central scoring
 * module, so no mechanic can hand-roll one and push it into a ledger.
 */
const SCORE_EVENT_BRAND: unique symbol = Symbol('score-event');

export interface ScoreEvent {
  readonly id: string;
  readonly matchId: string;
  readonly teamId: string;
  readonly challengeSessionId: string;
  readonly scoringRuleId: string;
  /** Signed. Negative values are valid (a failed RYO steal costs a point). */
  readonly delta: number;
  readonly reason: string;
  readonly metadata?: Record<string, unknown>;
  readonly createdAt: Date;
  readonly [SCORE_EVENT_BRAND]: true;
}

/** What a scoring rule returns; the engine stamps identity and provenance. */
export interface ScoreEventDraft {
  teamId: string;
  delta: number;
  reason: string;
  metadata?: Record<string, unknown>;
}

export interface ScoreEventIdentity {
  id: string;
  matchId: string;
  challengeSessionId: string;
  scoringRuleId: string;
  createdAt: Date;
}

/** Internal to the scoring module — do not export through the module barrel. */
export function mintScoreEvent(
  draft: ScoreEventDraft,
  identity: ScoreEventIdentity,
): ScoreEvent {
  return {
    ...identity,
    teamId: draft.teamId,
    delta: draft.delta,
    reason: draft.reason,
    ...(draft.metadata ? { metadata: draft.metadata } : {}),
    [SCORE_EVENT_BRAND]: true,
  };
}

export function isScoreEvent(value: unknown): value is ScoreEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<PropertyKey, unknown>)[SCORE_EVENT_BRAND] === true
  );
}

/** Lowest score a team can be shown. The stored total may be lower. */
export const SCORE_DISPLAY_FLOOR = 0;

export function clampScoreForDisplay(signedTotal: number): number {
  return Math.max(SCORE_DISPLAY_FLOOR, signedTotal);
}
