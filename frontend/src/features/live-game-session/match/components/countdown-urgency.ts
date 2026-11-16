/**
 * How urgent a countdown looks, and which cue it may sound — read only from the
 * authoritative remaining time a mechanic already derives from its server
 * deadline. Presentation only: nothing here can move, extend or end a deadline.
 */

export type CountdownUrgency = "calm" | "warning" | "critical" | "expired";

export interface CountdownThresholds {
  /** At or below this many whole seconds the timer is a warning. */
  readonly warningSeconds: number;
  /** At or below this many whole seconds it is critical. */
  readonly criticalSeconds: number;
}

/**
 * The default presentation thresholds — initial UX values, not balance rules.
 * Ten seconds of warning and five of critical suit every window of roughly
 * twenty seconds and up.
 */
export const DEFAULT_COUNTDOWN_THRESHOLDS: CountdownThresholds = Object.freeze({
  warningSeconds: 10,
  criticalSeconds: 5,
});

/**
 * Thresholds for a window shorter than the defaults can serve.
 *
 * A fixed ten-second warning on a ten-second window is amber from its first
 * frame — the countdown never has a calm state to escalate from (observed on
 * RYO's blind window). So a short window warns from its second half and turns
 * critical in its final third, and never later than the defaults.
 */
export function countdownThresholdsForWindow(
  windowSeconds: number,
): CountdownThresholds {
  return {
    warningSeconds: Math.min(
      DEFAULT_COUNTDOWN_THRESHOLDS.warningSeconds,
      Math.floor(windowSeconds / 2),
    ),
    criticalSeconds: Math.min(
      DEFAULT_COUNTDOWN_THRESHOLDS.criticalSeconds,
      Math.floor(windowSeconds / 3),
    ),
  };
}

/** Whole seconds shown for a remaining time, never negative. */
export function countdownSeconds(remainingMs: number): number {
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

export function countdownUrgency(
  seconds: number,
  thresholds: CountdownThresholds = DEFAULT_COUNTDOWN_THRESHOLDS,
): CountdownUrgency {
  if (seconds <= 0) return "expired";
  if (seconds <= thresholds.criticalSeconds) return "critical";
  if (seconds <= thresholds.warningSeconds) return "warning";
  return "calm";
}

/** A short audible cue. Each has a visual equivalent on the timer itself. */
export type CountdownCue = "warning" | "tick" | "final-tick" | "expired";

/**
 * The cue for one observed step of the countdown, or none.
 *
 * Deterministic from two consecutive *observed* seconds. A cue sounds only when
 * the countdown is seen to move by exactly one second — so a first render, a
 * reconnect, a tab coming back from the background or a jump of several seconds
 * never replays what it missed. Each second can produce at most one cue.
 *
 *  - entering warning: one soft cue, then silence through the warning;
 *  - critical: a tick each second, a stronger one for the final three;
 *  - reaching zero: one resolution cue.
 */
export function countdownCueForStep(
  previousSeconds: number | undefined,
  seconds: number,
  thresholds: CountdownThresholds = DEFAULT_COUNTDOWN_THRESHOLDS,
): CountdownCue | null {
  if (previousSeconds === undefined || previousSeconds - seconds !== 1) {
    return null;
  }
  const urgency = countdownUrgency(seconds, thresholds);
  if (urgency === "expired") return "expired";
  if (urgency === "critical") return seconds <= 3 ? "final-tick" : "tick";
  if (
    urgency === "warning" &&
    countdownUrgency(previousSeconds, thresholds) === "calm"
  ) {
    return "warning";
  }
  return null;
}
