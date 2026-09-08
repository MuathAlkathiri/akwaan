"use client";

import { useCallback } from "react";
import type { LiveSessionConnectionState } from "../model";
import { useVoiceInput, type VoiceInputState } from "./use-voice-input";

/**
 * What speech *means* in القنبلة.
 *
 * Everything about listening — support, permission, states, transcripts, cleanup
 * — belongs to `useVoiceInput` and is shared. What stays here is the only part
 * that is Bomb's: a spoken "تخطي" is a command rather than an answer, and a
 * recognised answer submits immediately, because Bomb is played against a
 * 30-second clock and a confirmation tap would cost the team real time.
 *
 * That auto-submit policy is deliberately *not* in the shared hook. المرحلة uses
 * the same speech capability to fill a field the player then edits, which is the
 * right trade for a mechanic where a misheard word would waste a whole turn.
 */

/** Spoken words that mean "skip", not "this is my answer". */
const SKIP_WORDS = new Set(["تخطي", "تجاوز", "عدي"]);

function normalizeVoiceCommand(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

/** Kept as Bomb's own name so its callers and tests read unchanged. */
export type BombVoiceState = VoiceInputState;

export function useBombVoiceInput({
  enabled,
  connection,
  lifecycleKey,
  onAnswer,
  onSkip,
}: {
  enabled: boolean;
  connection: LiveSessionConnectionState;
  lifecycleKey: string;
  onAnswer: (answer: string) => void;
  onSkip: () => void;
}) {
  const onFinalTranscript = useCallback(
    (finalTranscript: string) => {
      if (SKIP_WORDS.has(normalizeVoiceCommand(finalTranscript))) {
        onSkip();
        return;
      }
      onAnswer(finalTranscript);
    },
    [onAnswer, onSkip],
  );

  return useVoiceInput({
    enabled,
    connection,
    lifecycleKey,
    onFinalTranscript,
  });
}
