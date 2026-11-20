"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { CountdownCue } from "./countdown-urgency";

/**
 * The countdown's sound: short synthesized tones, no media files.
 *
 * The same technique the classic game's answer feedback uses (an oscillator
 * through a gain envelope), so no asset, CDN or media pipeline is involved. It
 * is the room's instrument only — phones never sound it — and it is *opt-in per
 * device*: switching it on is the user gesture browsers require before any
 * audio may play, and the choice is remembered on that device only.
 *
 * Nothing here can affect gameplay. A cue that cannot play (no Web Audio, a
 * suspended context, a hidden tab) is simply skipped.
 */

const STORAGE_KEY = "akwaan.countdownSound";

type Tone = {
  wave: OscillatorType;
  from: number;
  to: number;
  peak: number;
  seconds: number;
};

/** Quiet by design: the room should feel the clock, not be shouted at by it. */
const TONES: Record<CountdownCue, Tone> = {
  warning: { wave: "sine", from: 520, to: 620, peak: 0.05, seconds: 0.22 },
  tick: { wave: "triangle", from: 880, to: 880, peak: 0.045, seconds: 0.09 },
  // Rising and open for a right answer, falling and short for a wrong one, so
  // the two are told apart with eyes on something else.
  "answer-correct": {
    wave: "sine",
    from: 660,
    to: 990,
    peak: 0.07,
    seconds: 0.26,
  },
  "answer-wrong": {
    wave: "triangle",
    from: 400,
    to: 240,
    peak: 0.06,
    seconds: 0.22,
  },
  "final-tick": {
    wave: "triangle",
    from: 1040,
    to: 1040,
    peak: 0.07,
    seconds: 0.12,
  },
  expired: { wave: "sine", from: 440, to: 220, peak: 0.07, seconds: 0.5 },
};

let context: AudioContext | undefined;
let voice: OscillatorNode | undefined;
let lastCue: { cue: CountdownCue; at: number } | undefined;
/**
 * Whether an explicit gesture on this page has unlocked audio. A stored "on"
 * from an earlier visit is not enough: browsers lock playback again on every
 * load, and showing the switch as on while nothing can sound would be untrue.
 */
let unlocked = false;
/** This page's choice, used when storage is unavailable (private modes, policies). */
let memoryChoice: boolean | undefined;

function audioContextClass(): typeof AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  );
}

/** Create or resume the context. Must run inside a user gesture. */
export function primeCountdownSound(): boolean {
  const Context = audioContextClass();
  if (!Context) return false;
  try {
    context ??= new Context();
    if (context.state === "suspended") {
      context.resume().catch(() => {
        // Still locked; the switch stays truthful because nothing will sound.
      });
    }
    unlocked = true;
    return true;
  } catch {
    return false;
  }
}

/** Play one cue, replacing any cue still sounding. Never throws. */
export function playCountdownCue(cue: CountdownCue, nowMs = Date.now()) {
  if (!context || context.state !== "running") return false;
  if (typeof document !== "undefined" && document.hidden) return false;
  // Two countdowns on one screen reach the same second together: one cue.
  if (lastCue && lastCue.cue === cue && nowMs - lastCue.at < 400) return false;
  lastCue = { cue, at: nowMs };
  try {
    voice?.stop();
  } catch {
    // Already finished.
  }
  try {
    const tone = TONES[cue];
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime;
    oscillator.type = tone.wave;
    oscillator.frequency.setValueAtTime(tone.from, start);
    if (tone.to !== tone.from) {
      oscillator.frequency.exponentialRampToValueAtTime(
        tone.to,
        start + tone.seconds,
      );
    }
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(tone.peak, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.seconds);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + tone.seconds + 0.01);
    voice = oscillator;
    return true;
  } catch {
    return false;
  }
}

// ── The per-device preference, shared by every countdown on the page ──────

const listeners = new Set<() => void>();

/** The device's remembered choice — this page's own choice first. */
function readStoredChoice(): boolean {
  if (memoryChoice !== undefined) return memoryChoice;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "on";
  } catch {
    return false;
  }
}

/** On only when chosen *and* unlocked by a gesture on this page. */
function readEnabled(): boolean {
  return unlocked && readStoredChoice();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Whether this device wants countdown sound, and a way to change it. */
export function useCountdownSoundPreference(): [
  boolean,
  (on: boolean) => void,
] {
  const enabled = useSyncExternalStore(subscribe, readEnabled, () => false);
  const setEnabled = useCallback((on: boolean) => {
    // Switching on is the gesture that unlocks audio in the browser. Where
    // Web Audio is missing it cannot unlock, and the switch stays off.
    if (on && !primeCountdownSound()) {
      for (const listener of listeners) listener();
      return;
    }
    // Kept in memory first, so a storage-denied browser still honours the
    // choice for this page.
    memoryChoice = on;
    try {
      window.localStorage.setItem(STORAGE_KEY, on ? "on" : "off");
    } catch {
      // This page's choice above still holds.
    }
    for (const listener of listeners) listener();
  }, []);
  return [enabled, setEnabled];
}

/** Test seam: forget the audio context between tests. */
export function resetCountdownSoundForTests() {
  context = undefined;
  voice = undefined;
  lastCue = undefined;
  unlocked = false;
  memoryChoice = undefined;
}
