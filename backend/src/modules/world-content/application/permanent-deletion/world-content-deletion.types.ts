import type { ClientSession } from 'mongoose';

/**
 * Admin permanent deletion (roadmap §19.1, approved 2026-11-09; implementation
 * approved by the Product Owner 2026-11-18).
 *
 * Every operation is planned by the server, previewed, and executed only when
 * the plan recomputed inside the deletion transaction still matches the one the
 * operator reviewed (the fingerprint). Nothing here trusts a client-side count.
 */

export type DeletionEntityKind =
  'world' | 'scope' | 'challengeType' | 'contentItem' | 'configuration';

/** `detach` removes an association only; `permanent_delete` removes records. */
export type DeletionOperation = 'permanent_delete' | 'detach';

export interface DeletionEntity {
  kind: DeletionEntityKind;
  id: string;
  name: string;
  /** Slug for Worlds, Scopes and ChallengeTypes; slot key for configurations. */
  key?: string;
  status?: string;
}

export interface DeletionBlocker {
  code: string;
  message: string;
  count: number;
  /** A few records to look at, never the full list. */
  sample?: Array<{ id: string; label: string }>;
  /**
   * True when ticking "remove disposable test history" clears this blocker.
   * A live, playable Match is never overridable.
   */
  clearedByHistoryPurge?: boolean;
}

/**
 * The ids a deletion will touch. The fingerprint is computed from this, so any
 * change between preview and execute (an item added, a slot rebound, a Match
 * created) changes it.
 */
export interface DeletionPlanIds {
  worlds: string[];
  scopes: string[];
  configurations: string[];
  tutorials: string[];
  contentItemsToDelete: string[];
  contentItemsToDetach: string[];
  scopesWithExclusion: string[];
  /** Worlds whose fence the deletion must bump (race guard against new Matches). */
  fencedWorlds: string[];
}

/** What one external module (Matches, content engine, legacy) reports. */
export interface DeletionParticipantImpact {
  source: string;
  counts: Record<string, number>;
  blockers: DeletionBlocker[];
  /** Ids that must be stable between preview and execute. */
  fingerprintIds?: string[];
}

export interface DeletionParticipantContext {
  entity: DeletionEntity;
  operation: DeletionOperation;
  ids: DeletionPlanIds;
  /** Slug of the ChallengeType being deleted, for slug-keyed records. */
  challengeTypeSlug?: string;
  /** World and Scope keys of everything deleted, for key-keyed records. */
  worldKeys: string[];
  scopeTargets: Array<{ worldKey: string; scopeKey: string; scopeId: string }>;
  session?: ClientSession;
}

export interface DeletionExecuteOptions {
  purgeDisposableHistory: boolean;
}

/**
 * Another module's part in a deletion. `describe` is read-only and runs both
 * for the preview and again inside the transaction; `apply` runs inside the
 * deletion transaction, after the plan has been re-verified.
 *
 * The dependency arrow points from the participant's module into world-content,
 * never the other way, exactly like `WorldContentReferenceGuard`.
 */
export interface WorldContentDeletionParticipant {
  readonly source: string;
  describe(
    context: DeletionParticipantContext,
  ): Promise<DeletionParticipantImpact>;
  apply?(
    context: DeletionParticipantContext & { session: ClientSession },
    options: DeletionExecuteOptions,
  ): Promise<Record<string, number>>;
}

export interface DeletionPreview {
  entity: DeletionEntity;
  operation: DeletionOperation;
  impact: {
    worlds: number;
    scopes: number;
    configurations: number;
    tutorials: number;
    scopeExclusions: number;
    content: {
      toDelete: number;
      toDeleteReady: number;
      sharedPreserved: number;
    };
    external: Record<string, Record<string, number>>;
    /** ACTIVE Worlds whose board this leaves incomplete (no longer selectable). */
    worldsBecomingIncomplete: Array<{ id: string; name: string }>;
  };
  blockers: DeletionBlocker[];
  /** Safe to execute without the history purge. */
  safe: boolean;
  /** Safe once disposable test history is purged in the same transaction. */
  safeWithHistoryPurge: boolean;
  requiresHistoryPurge: boolean;
  reversible: false;
  /** Whether the requesting operator is allowed to execute this operation. */
  actorMayExecute: boolean;
  fingerprint: string;
  generatedAt: string;
}

export interface DeletionResult {
  requestId: string;
  auditId: string;
  entity: DeletionEntity;
  operation: DeletionOperation;
  counts: Record<string, number>;
  /**
   * Media URLs the deleted records used that no remaining ContentItem uses.
   * Informational: content media is never deleted by this path.
   */
  unreferencedMediaCandidates: string[];
  /** True when this request id had already been executed. */
  replayed: boolean;
}
