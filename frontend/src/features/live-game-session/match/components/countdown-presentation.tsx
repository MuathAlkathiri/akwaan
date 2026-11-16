"use client";

import { createContext, useContext, useEffect, useRef } from "react";
import {
  countdownCueForStep,
  type CountdownThresholds,
} from "./countdown-urgency";
import {
  playCountdownCue,
  useCountdownSoundPreference,
} from "./countdown-sound";

/**
 * Where a countdown is being drawn.
 *
 * `stage` is the room's screen — the controller or the shared screen, read from
 * across a majlis — where the timer is large and may sound. `compact` is
 * everything else: phones, previews, the how-to-play page. The default is
 * compact, so nothing outside a Match stage changes.
 */
export type CountdownSurface = "stage" | "compact";

const CountdownSurfaceContext = createContext<CountdownSurface>("compact");

export function CountdownSurfaceProvider({
  surface,
  children,
}: {
  surface: CountdownSurface;
  children: React.ReactNode;
}) {
  return (
    <CountdownSurfaceContext.Provider value={surface}>
      {children}
    </CountdownSurfaceContext.Provider>
  );
}

export function useCountdownSurface(): CountdownSurface {
  return useContext(CountdownSurfaceContext);
}

/**
 * Sound the countdown's cues as the authoritative seconds move.
 *
 * Only on the stage, only when this device opted in *and* a gesture on this
 * page unlocked audio, only while the tab is visible, and only for steps
 * actually seen — the baseline is dropped whenever the page is hidden, so
 * coming back never replays the seconds it missed. The cue is chosen by
 * `countdownCueForStep`; this hook only decides whether it may be heard.
 *
 * Two duplicates it rules out:
 *  - `resetKey` names whose clock this is (Bomb passes the active team). A
 *    different key is a different clock, so the first second after a handoff
 *    is first sight — team A's 11 followed by team B's 10 is not a step.
 *  - A second already announced is never announced again. A snapshot with a
 *    different latency can move the display N → N+1 → N; only a lower second
 *    sounds. A jump of more than one second upward is a new countdown.
 */
export function useCountdownCues(
  seconds: number,
  thresholds: CountdownThresholds,
  allowed: boolean,
  resetKey?: string,
) {
  const [enabled] = useCountdownSoundPreference();
  const previous = useRef<number | undefined>(undefined);
  const lowestAnnounced = useRef<number | undefined>(undefined);
  const clock = useRef(resetKey);
  const active = allowed && enabled;

  useEffect(() => {
    const forget = () => {
      if (document.hidden) previous.current = undefined;
    };
    document.addEventListener("visibilitychange", forget);
    return () => document.removeEventListener("visibilitychange", forget);
  }, []);

  useEffect(() => {
    if (clock.current !== resetKey) {
      clock.current = resetKey;
      previous.current = undefined;
      lowestAnnounced.current = undefined;
    }
    const before = previous.current;
    previous.current =
      typeof document !== "undefined" && document.hidden ? undefined : seconds;
    if (before !== undefined && seconds > before + 1) {
      lowestAnnounced.current = undefined;
    }
    if (!active) return;
    const cue = countdownCueForStep(before, seconds, thresholds);
    if (!cue) return;
    if (
      lowestAnnounced.current !== undefined &&
      seconds >= lowestAnnounced.current
    ) {
      return;
    }
    lowestAnnounced.current = seconds;
    playCountdownCue(cue);
  }, [active, seconds, thresholds, resetKey]);
}
