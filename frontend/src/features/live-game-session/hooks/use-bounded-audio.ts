"use client";

import { useEffect, useRef } from "react";

/**
 * Play the first `seconds` of one canonical Master asset, and not a frame more.
 *
 * من أول نغمة auctions how few seconds a team needs, so the boundary *is* the
 * mechanic: at a winning bid of 1 second, the difference between stopping at
 * 1.00s and 1.25s is a quarter of everything the team bought. `timeupdate`
 * alone fires roughly four times a second, which is too coarse to settle that,
 * so the stop is watched three ways and whichever notices first wins:
 *
 *   - a `requestAnimationFrame` loop, the precise one (~16ms) while playing
 *   - `timeupdate`, which still fires when frames are throttled (hidden tab)
 *   - a defensive timer, in case both of the above stop arriving
 *
 * The asset is never cut. One Master is loaded once and the element simply
 * stops at the authorised offset, so no runtime clipping happens anywhere.
 *
 * **Replay is deliberately left alone.** The shared screen keeps its native
 * controls, and seeking back and pressing play is existing behaviour; this only
 * bounds where playback ends, and never forces a pause below the boundary.
 *
 * **One start per authorisation.** Auto-start is keyed on `src` + `seconds`, so
 * a re-render, a duplicate socket update or a reconnect that re-delivers the
 * same authoritative state does not restart the clip. A genuinely new
 * authorisation — the next song, or a different winning bid — is a new key.
 */
export function useBoundedAudio({
  src,
  seconds,
  enabled = true,
}: {
  /** The canonical Master URL, unchanged between bids and steals. */
  src?: string;
  /** The authorised prefix, which only ever comes from authoritative state. */
  seconds?: number;
  enabled?: boolean;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  // What the element is currently authorised to play. A change here, and only a
  // change here, starts playback.
  const startedFor = useRef<string | null>(null);

  const active =
    enabled && Boolean(src) && typeof seconds === "number" && seconds > 0;
  const key = active ? `${src}|${seconds}` : null;

  useEffect(() => {
    const element = ref.current;
    if (!element || !key || typeof seconds !== "number") {
      startedFor.current = null;
      return;
    }

    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const clearWatchers = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      if (timer) clearTimeout(timer);
      timer = undefined;
    };

    /** Land exactly on the boundary and stay there. */
    const stopAtBoundary = () => {
      if (stopped) return;
      stopped = true;
      clearWatchers();
      element.pause();
      // Clamp rather than rewind: the reader sees the clip ended where it was
      // bought, and pressing play again cannot walk past it.
      if (element.currentTime > seconds) element.currentTime = seconds;
    };

    const check = () => {
      if (element.currentTime >= seconds) stopAtBoundary();
    };

    const watch = () => {
      if (stopped) return;
      check();
      if (!stopped) frame = requestAnimationFrame(watch);
    };

    const onTimeUpdate = () => check();
    const onPlay = () => {
      // Any play — ours or the viewer's, via the shared screen's controls —
      // re-arms the boundary rather than being blocked.
      stopped = false;
      clearWatchers();
      const remaining = Math.max(0, seconds - element.currentTime);
      timer = setTimeout(stopAtBoundary, remaining * 1000 + 120);
      frame = requestAnimationFrame(watch);
    };

    element.addEventListener("timeupdate", onTimeUpdate);
    element.addEventListener("play", onPlay);

    if (startedFor.current !== key) {
      startedFor.current = key;
      element.currentTime = 0;
      // jsdom and autoplay-blocking browsers both reject here; neither is an
      // error worth surfacing — the viewer can still press play.
      try {
        void element.play()?.catch(() => {});
      } catch {
        /* playback unavailable in this environment */
      }
    }

    return () => {
      element.removeEventListener("timeupdate", onTimeUpdate);
      element.removeEventListener("play", onPlay);
      clearWatchers();
      // Leaving the answer window, the stage, or the challenge must never leave
      // audio running underneath the next screen.
      element.pause();
    };
  }, [key, seconds]);

  return ref;
}
