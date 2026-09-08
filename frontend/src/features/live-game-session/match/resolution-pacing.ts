/**
 * How long a resolved item's truth stays on screen before play moves on.
 *
 * Presentation pacing and nothing else. It never starts or resets a deadline,
 * never scores, and never decides when a question is over — the server has
 * already resolved the item before any of this is rendered. A client that
 * mis-paces a reveal shows the room the truth for slightly too long; it cannot
 * change what happened.
 *
 * One seam rather than a timer per component: eleven mechanics reading their own
 * hard-coded 3000 was how the previous reveal experiments drifted apart, and a
 * mechanic that legitimately needs a different beat should say so here where the
 * difference is visible next to every other mechanic's.
 */

/** The default beat, where a mechanic has no reason to differ. */
export const RESOLUTION_REVEAL_MS = 3_000;

/**
 * Mechanics whose pacing is already owned elsewhere.
 *
 * `0` means "this mechanic does not run a timed per-item reveal at all", which
 * is a Product decision rather than a duration: القنبلة and ركّبها resolve into
 * a single terminal recap, and pausing either mid-run would change how the game
 * is played — القنبلة runs one continuous team clock, and ركّبها is a race
 * whose two teams meet the puzzles in different orders.
 */
const MECHANIC_REVEAL_MS: Readonly<Record<string, number>> = {
  bomb: 0,
  rakkibha: 0,
};

/**
 * The reveal beat for one mechanic, in milliseconds.
 *
 * `0` means the mechanic reveals nothing per item; callers must treat that as
 * "no reveal step", not as "reveal instantly".
 */
export function resolutionRevealMs(modeKey: string): number {
  return MECHANIC_REVEAL_MS[modeKey] ?? RESOLUTION_REVEAL_MS;
}

/** Whether this mechanic shows a per-item reveal between questions at all. */
export function hasPerItemReveal(modeKey: string): boolean {
  return resolutionRevealMs(modeKey) > 0;
}
