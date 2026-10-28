"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";

/**
 * Drives a stepped explainer through one looping GSAP timeline.
 *
 * GSAP owns **choreography only**: it advances a step index on a schedule and
 * animates nothing about the data. React still renders every surface from that
 * index, so what a reader sees is ordinary component state and can be asserted
 * in tests without touching the animation engine.
 *
 * ## Playback precedence
 *
 * Exactly one rule decides whether the demo runs, evaluated top-down. There is
 * no second controller that could disagree with it:
 *
 * 1. **No timeline** (unmounted, or `stopped` because the real challenge is
 *    launching) → stopped.
 * 2. **Reduced motion** → never plays on its own; the explainer becomes a
 *    manual stepper.
 * 3. **User paused** → paused, and stays paused through scrolling and tab
 *    switches. A person's choice outranks every automatic signal.
 * 4. **Offscreen or tab hidden** → suspended. Nothing animates for a surface
 *    nobody is looking at.
 * 5. Otherwise → playing, and looping.
 *
 * `shouldPlay` below *is* that policy, and a single effect applies it to the
 * timeline. Adding a new signal means adding a term there, not another effect
 * that races the others.
 */

/** Seconds the final beat is held before the loop restarts. */
export const EXPLAINER_LOOP_HOLD_SECONDS = 2;

/** How much of the explainer must be on screen before it plays. */
export const EXPLAINER_VISIBILITY_THRESHOLD = 0.55;

export interface ExplainerTimelineStep {
  holdSeconds: number;
}

export interface ExplainerTimelineOptions {
  /** 0–1. Defaults to `EXPLAINER_VISIBILITY_THRESHOLD`. */
  visibilityThreshold?: number;
  /** Hard stop — the real challenge is starting. Outranks everything. */
  stopped?: boolean;
}

export interface ExplainerTimeline {
  /** The step currently on screen. */
  index: number;
  /** Normalized progress through the current step, driven by GSAP time. */
  stepProgress: number;
  /** True while the timeline is actually running. */
  playing: boolean;
  /** True while the final beat is the one on screen. */
  finished: boolean;
  /** True when the person paused it themselves. */
  userPaused: boolean;
  /** True while suspended because it is offscreen or the tab is hidden. */
  suspended: boolean;
  /** Restart from the first step and resume looping. */
  replay: () => void;
  /** Jump to the final beat and hold it there. */
  skip: () => void;
  /** Manual stepping, used by the reduced-motion controls. */
  goTo: (index: number) => void;
  /** Pause or resume. A pause survives scroll and tab changes. */
  toggle: () => void;
  /** True when the hook is in manual mode because motion is reduced. */
  reducedMotion: boolean;
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    if (query.addEventListener) {
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    }
    query.addListener(onChange);
    return () => query.removeListener(onChange);
  }, []);
  return reduced;
}

export function useExplainerTimeline(
  steps: readonly ExplainerTimelineStep[],
  scope: React.RefObject<HTMLElement | null>,
  options: ExplainerTimelineOptions = {},
): ExplainerTimeline {
  const { visibilityThreshold = EXPLAINER_VISIBILITY_THRESHOLD, stopped = false } =
    options;
  const reducedMotion = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [stepProgress, setStepProgress] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  // Starts visible, unconditionally. This value is rendered (the controls show a
  // suspended hint), so it must not be derived from anything that differs
  // between the server and the client — probing for `IntersectionObserver` here
  // hydrates as a mismatch, because the server never has one and the browser
  // always does. The observer below corrects it on its first callback, which
  // fires on the frame after it starts observing, long inside the first beat.
  const [onScreen, setOnScreen] = useState(true);
  const [tabHidden, setTabHidden] = useState(false);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  // Mirrors `timelineRef` as state. The ref alone cannot drive `playing`: it is
  // populated in an effect, and mutating a ref re-renders nothing, so the
  // controls would paint as paused for the whole first frame of playback.
  const [timelineReady, setTimelineReady] = useState(false);
  const last = steps.length - 1;

  // Stable across renders so the timeline is never rebuilt just because a
  // caller passed a fresh array literal.
  const holds = useMemo(() => steps.map((step) => step.holdSeconds), [steps]);

  const suspended = !onScreen || tabHidden;
  const shouldPlay = !reducedMotion && !stopped && !userPaused && !suspended;

  /** Build the one timeline. It loops; it is never recreated to replay. */
  useEffect(() => {
    if (reducedMotion || stopped || holds.length === 0) return;
    const element = scope.current;
    if (!element) return;

    const context = gsap.context(() => {
      const starts = holds.reduce<number[]>((positions, _hold, step) => {
        positions.push((positions[step - 1] ?? 0) + (step === 0 ? 0 : holds[step - 1]));
        return positions;
      }, []);
      const timeline = gsap.timeline({
        // One timeline for every loop. `repeat: -1` is what keeps a replay from
        // allocating a new one each cycle, and the trailing hold below is what
        // stops the payoff being yanked away the instant it lands.
        repeat: -1,
        paused: true,
        onUpdate: () => {
          const time = timeline.time();
          let step = last;
          for (let candidate = 0; candidate < starts.length; candidate += 1) {
            if (time < starts[candidate] + holds[candidate]) {
              step = candidate;
              break;
            }
          }
          const duration = holds[step] || 1;
          setIndex(step);
          setStepProgress(
            Math.min(1, Math.max(0, (time - starts[step]) / duration)),
          );
        },
      });
      holds.forEach((hold, step) => {
        timeline.call(() => setIndex(step), undefined, step === 0 ? 0 : ">");
        timeline.to({}, { duration: hold });
      });
      timeline.to({}, { duration: EXPLAINER_LOOP_HOLD_SECONDS });
      timelineRef.current = timeline;
    }, element);
    setTimelineReady(true);

    return () => {
      // Drop our handle before reverting, so a late callback cannot resurrect a
      // killed timeline. `revert()` also kills any tween the context spawned.
      timelineRef.current = null;
      setTimelineReady(false);
      context.revert();
    };
    // Deliberately narrow: `holds` is memoised from a module-constant step list
    // and `scope` is a ref, so this does not re-run when the surrounding screen
    // re-renders. A readiness or presence update must never restart playback
    // from the first beat under the host's eyes.
  }, [holds, last, reducedMotion, stopped, scope]);

  /** Apply the precedence policy. The single place playback starts or stops. */
  useEffect(() => {
    const timeline = timelineRef.current;
    if (!timeline) return;
    if (shouldPlay) timeline.play();
    else timeline.pause();
  }, [shouldPlay]);

  /** Visibility: only play what someone can actually see. */
  useEffect(() => {
    if (reducedMotion || typeof IntersectionObserver === "undefined") return;
    const element = scope.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (entry) setOnScreen(entry.intersectionRatio >= visibilityThreshold);
      },
      { threshold: [0, visibilityThreshold, 1] },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [reducedMotion, scope, visibilityThreshold]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => setTabHidden(document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const replay = useCallback(() => {
    setIndex(0);
    setStepProgress(0);
    setUserPaused(false);
    timelineRef.current?.restart(true);
  }, []);

  const skip = useCallback(() => {
    setIndex(last);
    setStepProgress(1);
    const timeline = timelineRef.current;
    if (!timeline) return;
    // Park on the final beat rather than rolling straight into the next loop:
    // "skip" means "show me the end", and a demo that immediately restarted
    // would hide the result it was asked to show. Recorded as a user pause so
    // the loop cannot override it, and so Play resumes from a known state.
    const total = timeline.duration();
    timeline.pause();
    timeline.time(Math.max(0, total - EXPLAINER_LOOP_HOLD_SECONDS));
    setUserPaused(true);
  }, [last]);

  const goTo = useCallback(
    (next: number) => {
      const clamped = Math.min(Math.max(next, 0), last);
      setIndex(clamped);
      setStepProgress(clamped === last ? 1 : 0);
    },
    [last],
  );

  const toggle = useCallback(() => setUserPaused((paused) => !paused), []);

  return {
    index,
    stepProgress,
    playing: shouldPlay && timelineReady,
    finished: index >= last,
    userPaused,
    suspended,
    replay,
    skip,
    goTo,
    toggle,
    reducedMotion,
  };
}
