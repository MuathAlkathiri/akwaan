import { MalformedScoreEventError } from './scoring.errors';

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

/**
 * A ScoreEvent as it survives JSON persistence: same fields, no brand, and
 * `createdAt` reduced to a string. Mechanics persist their minted events inside
 * their gameplay runtime state, so this is the shape that comes back out.
 */
export interface PersistedScoreEvent {
  id: string;
  matchId: string;
  teamId: string;
  challengeSessionId: string;
  scoringRuleId: string;
  delta: number;
  reason: string;
  metadata?: Record<string, unknown>;
  createdAt: string | Date;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Validates a persisted event and re-brands it.
 *
 * Restoring is the one other way a branded event comes into existence, and it
 * stays inside this module for the same reason minting does: nothing outside the
 * scoring module can fabricate an event the ledger will accept. `matchId` is
 * carried through untouched — historically it holds the live-session id, which is
 * provenance, not identity. Correlation is by `challengeSessionId`.
 */
export function restoreScoreEvent(value: unknown): ScoreEvent {
  if (isScoreEvent(value)) return value;
  const candidate = value as Partial<PersistedScoreEvent> | null;
  if (!candidate || typeof candidate !== 'object') {
    throw new MalformedScoreEventError('a persisted event was not an object');
  }
  for (const field of [
    'id',
    'matchId',
    'teamId',
    'challengeSessionId',
    'scoringRuleId',
    'reason',
  ] as const) {
    if (!isNonEmptyString(candidate[field])) {
      throw new MalformedScoreEventError(`"${field}" is missing`);
    }
  }
  if (!Number.isInteger(candidate.delta)) {
    throw new MalformedScoreEventError('"delta" must be a whole number');
  }
  const createdAt = new Date(candidate.createdAt as string | Date);
  if (Number.isNaN(createdAt.getTime())) {
    throw new MalformedScoreEventError('"createdAt" is not a valid timestamp');
  }
  return {
    id: candidate.id as string,
    matchId: candidate.matchId as string,
    teamId: candidate.teamId as string,
    challengeSessionId: candidate.challengeSessionId as string,
    scoringRuleId: candidate.scoringRuleId as string,
    delta: candidate.delta as number,
    reason: candidate.reason as string,
    ...(candidate.metadata ? { metadata: candidate.metadata } : {}),
    createdAt,
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
