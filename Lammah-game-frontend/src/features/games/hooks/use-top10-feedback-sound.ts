"use client";

import { useCallback, useEffect, useRef } from "react";

type FeedbackSound = "correct" | "incorrect";

export function useTop10FeedbackSound() {
  const contextRef = useRef<AudioContext | undefined>(undefined);
  const activeOscillatorRef = useRef<OscillatorNode | undefined>(undefined);

  const prime = useCallback(() => {
    if (typeof window === "undefined" || !window.AudioContext) return;
    contextRef.current ??= new window.AudioContext();
    if (contextRef.current.state === "suspended")
      void contextRef.current.resume();
  }, []);

  const play = useCallback((sound: FeedbackSound) => {
    const context = contextRef.current;
    if (!context || context.state !== "running") return;
    try {
      activeOscillatorRef.current?.stop();
    } catch {
      // A sound that already ended needs no cleanup.
    }
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = sound === "correct" ? "sine" : "triangle";
    oscillator.frequency.setValueAtTime(
      sound === "correct" ? 660 : 180,
      now,
    );
    if (sound === "correct")
      oscillator.frequency.exponentialRampToValueAtTime(880, now + 0.12);
    else oscillator.frequency.exponentialRampToValueAtTime(120, now + 0.16);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.055, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.21);
    activeOscillatorRef.current = oscillator;
  }, []);

  useEffect(
    () => () => {
      try {
        activeOscillatorRef.current?.stop();
      } catch {
        // Already stopped.
      }
      void contextRef.current?.close();
    },
    [],
  );

  return { prime, play };
}
