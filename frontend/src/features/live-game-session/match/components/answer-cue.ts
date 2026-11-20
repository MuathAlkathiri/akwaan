"use client";

import { useEffect, useRef } from "react";
import { playCountdownCue } from "./countdown-sound";
import { useCountdownSurface } from "./countdown-presentation";

/**
 * Sound an answer the moment it resolves, once.
 *
 * `correct` is the server's verdict, or undefined while nothing has resolved.
 * The cue fires on the transition into a verdict and never again for the same
 * one, so a re-render, a reconnect or a snapshot arriving twice stays silent.
 *
 * Only on the room's stage, like every other sound here: a correct answer that
 * chimes on five phones at once says nothing the shared screen has not already
 * said, and buries it. It also rides the same opt-in and the same unlocked
 * audio context as the countdown, so one switch governs all of the room's
 * sound rather than two that can disagree.
 */
export function useAnswerCue(correct: boolean | undefined, key: string) {
  const surface = useCountdownSurface();
  const sounded = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (surface !== "stage" || correct === undefined) return;
    const signature = `${key}:${correct}`;
    if (sounded.current === signature) return;
    sounded.current = signature;
    playCountdownCue(correct ? "answer-correct" : "answer-wrong");
  }, [correct, key, surface]);
}
