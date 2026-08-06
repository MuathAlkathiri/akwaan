import type { PlayableBoardSlot, PlayableScope } from "../types";

/**
 * The mechanics that can actually be launched today.
 *
 * This mirrors the backend's challenge launcher registry. A configured mechanic
 * without a launcher is shown as locked rather than hidden, so a player can see
 * the whole World board and understand what is still coming.
 */
export const PLAYABLE_CHALLENGE_SLUGS = [
  "read-your-opponent",
  "top-10",
  "distributed-information",
];

export type ChallengeAvailability = "available" | "locked" | "completed";

export interface BoardChallenge {
  slot: PlayableBoardSlot;
  availability: ChallengeAvailability;
  /** Why it cannot be played, when it cannot. */
  lockedReason?: string;
}

export function isPlayableMechanic(slug: string): boolean {
  return PLAYABLE_CHALLENGE_SLUGS.includes(slug);
}

/**
 * Whether a Scope may be picked for an occurrence.
 *
 * Playability is a board question, not a stock question: a Scope with usable
 * board positions can supply a challenge. The ready-item count is shown to the
 * player, but it never decides on its own — and the compatibility *readiness*
 * label is not part of the player payload at all, so nothing here reads it.
 */
export function isSelectableScope(scope: PlayableScope): boolean {
  return scope.usableSlots.length > 0;
}

/**
 * The board of one World occurrence.
 *
 * The board belongs to the occurrence and its configured ChallengeTypes, not to
 * any one Scope: a position is playable when *any* Scope in the four-Scope pool
 * can supply it, and locked only when none of them can.
 *
 * Order carries no meaning — the player picks any available challenge — so the
 * board is returned in the World's own board order purely for stable layout.
 */
export function buildOccurrenceBoard(
  pool: PlayableScope[],
  completedSlotKeys: string[] = [],
): BoardChallenge[] {
  const usableByKey = new Map<string, PlayableBoardSlot>();
  for (const scope of pool) {
    for (const slot of scope.usableSlots) {
      usableByKey.set(slot.slotKey, slot);
    }
  }
  const usable = [...usableByKey.values()];

  const challenges: BoardChallenge[] = [
    ...usable.map((slot) => ({
      slot,
      availability: isPlayableMechanic(slot.challengeTypeSlug)
        ? ("available" as const)
        : ("locked" as const),
      ...(isPlayableMechanic(slot.challengeTypeSlug)
        ? {}
        : { lockedReason: "قريباً" }),
    })),
  ];

  return challenges
    .map((challenge) =>
      completedSlotKeys.includes(challenge.slot.slotKey)
        ? { ...challenge, availability: "completed" as const }
        : challenge,
    )
    .sort((left, right) => left.slot.sortOrder - right.slot.sortOrder);
}

export function countAvailable(challenges: BoardChallenge[]): number {
  return challenges.filter(
    (challenge) => challenge.availability === "available",
  ).length;
}
