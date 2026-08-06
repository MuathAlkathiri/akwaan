import type { PlayableScope } from "../types";

/**
 * Whether a Scope has anything a board could be built from.
 *
 * A board question, not a stock question: a Scope with usable board positions can
 * supply a challenge. The ready-item count is shown to the player, but it never
 * decides on its own — and which mechanics are actually launchable is the Match's
 * answer to give, never this module's.
 */
export function isSelectableScope(scope: PlayableScope): boolean {
  return scope.usableSlots.length > 0;
}
