/**
 * What the player journey knows about World Content.
 *
 * These mirror the backend's player projections (`GET /worlds`,
 * `GET /worlds/:worldId/scopes`) and are deliberately narrower than the admin
 * types: no readiness report, no authoring counts, no scoring or configuration
 * ids. A player screen must not depend on a field only an admin may read.
 */

export interface PlayerAsset {
  url: string;
  altText?: string;
}

export interface PlayableWorld {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: PlayerAsset;
  banner?: PlayerAsset;
  sortOrder: number;
  scopeCount: number;
  challengeConfigurationCount: number;
}

/** A board position as the player sees it. */
export interface PlayableBoardSlot {
  slotKey: string;
  challengeTypeId: string;
  challengeTypeSlug: string;
  family: string;
  displayName: string;
  description?: string;
  instructions?: string;
  itemStructure: string;
  answerMode: string;
  scoringRuleId: string;
  sortOrder: number;
}

export interface PlayableScope {
  id: string;
  worldId: string;
  name: string;
  slug: string;
  description?: string;
  image?: PlayerAsset;
  sortOrder: number;
  /** Shown to the player; never the sole playability decision. */
  readyContentItemCount: number;
  /** The playability signal: no usable slot means no board. */
  usableSlots: PlayableBoardSlot[];
}
