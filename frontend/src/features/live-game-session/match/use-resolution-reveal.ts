"use client";

import { useLiveSessionClock } from "../hooks/live-session-clock-context";
import { resolutionRevealMs } from "./resolution-pacing";

/**
 * Whether a resolved item's truth is still being shown.
 *
 * Derived from the server's own `resolvedAt` against the session clock, not
 * from a local timer. That is what makes it survive a reconnect honestly: a
 * phone that rejoins two seconds into a reveal sees the rest of it, and one that
 * rejoins a minute later sees none of it, because the answer is how long ago the
 * server resolved the item — not how long this component has been mounted.
 *
 * It starts no timer of its own. The session clock already ticks for every
 * countdown in the app, so the reveal simply reads it and rerenders with
 * everything else; there is no second scheduler here, and nothing about
 * gameplay, deadlines or scoring depends on the value.
 */
export function useResolutionReveal(input: {
  /** ISO instant the server resolved the item. Absent means nothing resolved. */
  resolvedAt?: string | null;
  /** The mechanic, so pacing comes from the one seam. */
  modeKey: string;
}): boolean {
  const nowMs = useLiveSessionClock();
  const windowMs = resolutionRevealMs(input.modeKey);
  if (windowMs <= 0 || !input.resolvedAt) return false;
  const resolvedMs = Date.parse(input.resolvedAt);
  if (Number.isNaN(resolvedMs)) return false;
  const elapsed = nowMs - resolvedMs;
  // A clock that has not caught up yet reads slightly behind the resolution;
  // treating that as "already over" would blink the reveal out of existence.
  return elapsed < windowMs;
}
