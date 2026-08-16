import type { LiveSessionSnapshot } from "../model";

/**
 * The three independent revision counters a snapshot carries.
 *
 * They are separate authorities, not one number: a runtime command bumps the
 * runtime without touching the session, and Match reconciliation bumps the Match
 * without touching either. Comparing across them would be meaningless, so every
 * comparison here is per-dimension and a dimension the other side does not
 * mention is simply not evidence.
 */
export interface SnapshotRevisions {
  session?: number;
  runtime?: number;
  match?: number;
}

/** What a snapshot we have actually adopted says about each authority. */
export function revisionsOf(snapshot: LiveSessionSnapshot): SnapshotRevisions {
  const value = snapshot as unknown as {
    revision?: unknown;
    gameplay?: { revision?: unknown };
    match?: { revision?: unknown };
  };
  const result: SnapshotRevisions = {};
  if (typeof value.revision === "number") result.session = value.revision;
  if (typeof value.gameplay?.revision === "number") {
    result.runtime = value.gameplay.revision;
  }
  if (typeof value.match?.revision === "number") {
    result.match = value.match.revision;
  }
  return result;
}

/**
 * What a realtime event claims to have changed.
 *
 * Read from the payload rather than keyed by event name on purpose: the server
 * publishes through two helpers with slightly different shapes, and a mechanic
 * added later gets this for free instead of needing a case. An event that names
 * no revision at all — participant presence is the live example, since presence
 * is merged at read time and bumps nothing — yields `undefined`, which the
 * caller must treat as "cannot prove anything, go and look".
 */
export function claimedRevisions(
  payload: unknown,
): SnapshotRevisions | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const value = payload as Record<string, unknown>;
  const claim: SnapshotRevisions = {};
  // `revision` is the session counter as published by the generic transition
  // publisher; `sessionRevision` is the same number under the gameplay helper.
  const session = value.sessionRevision ?? value.revision;
  if (typeof session === "number") claim.session = session;
  if (typeof value.runtimeRevision === "number") {
    claim.runtime = value.runtimeRevision;
  }
  if (typeof value.matchRevision === "number") {
    claim.match = value.matchRevision;
  }
  return Object.keys(claim).length ? claim : undefined;
}

const DIMENSIONS = ["session", "runtime", "match"] as const;

/**
 * Whether an event tells us nothing we have not already adopted.
 *
 * Conservative by construction: a dimension we hold no value for is not
 * comparable, so it counts as news. Only an event whose every named revision we
 * already have is suppressed.
 */
export function isAlreadyAdopted(
  claim: SnapshotRevisions,
  adopted: SnapshotRevisions,
): boolean {
  let compared = 0;
  for (const dimension of DIMENSIONS) {
    const claimed = claim[dimension];
    if (claimed === undefined) continue;
    const held = adopted[dimension];
    if (held === undefined) return false;
    if (claimed > held) return false;
    compared += 1;
  }
  return compared > 0;
}

/**
 * Whether an arriving snapshot is older than the one already on screen.
 *
 * Two requests can be in flight across a reconnect, and their replies can land
 * in the wrong order; adopting the loser would visibly roll the game backwards.
 *
 * Equal is deliberately *not* a regression. Presence is projected onto the
 * session at read time and bumps no counter, so a snapshot that differs only by
 * who is connected carries exactly the revisions we already hold — refusing it
 * would freeze the lobby's connection dots.
 */
export function isRegression(
  next: SnapshotRevisions,
  adopted: SnapshotRevisions,
): boolean {
  let behind = false;
  for (const dimension of DIMENSIONS) {
    const incoming = next[dimension];
    const held = adopted[dimension];
    if (incoming === undefined || held === undefined) continue;
    if (incoming > held) return false;
    if (incoming < held) behind = true;
  }
  return behind;
}
