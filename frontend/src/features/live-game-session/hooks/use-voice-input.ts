"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveSessionConnectionState } from "../model";

/**
 * Browser speech recognition, and nothing else.
 *
 * This hook knows how to listen and how to hand back one final transcript. It
 * knows nothing about mechanics: not what a transcript means, not whether it may
 * be submitted, not skip words, not commands, not teams, not fair-start. A caller
 * that wanted this hook to "answer" for it would be asking the wrong layer —
 * deciding what speech means is exactly the part that differs between القنبلة and
 * المرحلة, and it belongs with them.
 *
 * **No audio ever reaches Akwaan.** There is no `MediaRecorder`, no
 * `getUserMedia` pipeline, no upload, no persistence and no backend speech
 * service — only the browser's own `SpeechRecognition`. That is not the same as
 * "processed locally": a browser engine may send audio to its vendor's service to
 * recognise it. What is guaranteed here is that Akwaan neither receives nor
 * stores any of it.
 */

export type VoiceInputState =
  | "idle"
  | "listening"
  | "processing"
  | "recognized"
  | "no-speech"
  | "permission-denied"
  | "unsupported"
  | "reconnecting"
  | "error";

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

/** Long enough to read "تم"; short enough not to cost a player their turn. */
const RECOGNISED_DELAY_MS = 150;
const RESET_DELAY_MS = 1_200;
/**
 * How many of the engine's ranked guesses to keep.
 *
 * Recognition returns its best reading first and then its doubts. In a room
 * where eight people are talking the word the player said is often the second
 * one, so the caller gets the list and lets the server judge it. Three is where
 * the list stops being guesses about this sentence and starts being noise.
 */
const MAX_ALTERNATIVES = 3;
/** Long enough that a restart is not a busy loop, short enough to feel live. */
const RESTART_DELAY_MS = 250;

export const DEFAULT_VOICE_LANG = "ar-SA";

export function useVoiceInput({
  enabled,
  connection,
  lifecycleKey,
  lang = DEFAULT_VOICE_LANG,
  autoListen = false,
  onFinalTranscript,
}: {
  /** The caller's own rule for "may this surface listen right now". */
  enabled: boolean;
  connection: LiveSessionConnectionState;
  /** Changes when the turn, item or question does; resets everything. */
  lifecycleKey: string;
  lang?: string;
  /**
   * Listen for as long as the caller is `enabled`, restarting after every
   * utterance and every silence, until the player mutes it.
   *
   * Off by default. المرحلة asks for one sentence at a time and the player edits
   * it; القنبلة is a 30-second scramble where a second tap to speak again is a
   * second the team does not have.
   */
  autoListen?: boolean;
  /**
   * Called once per listening session, with the finalised text and whatever
   * else the engine ranked below it.
   */
  onFinalTranscript: (transcript: string, alternatives: string[]) => void;
}): {
  state: VoiceInputState;
  transcript: string;
  muted: boolean;
  start: () => void;
  stop: (nextState?: VoiceInputState) => void;
  toggleMute: () => void;
} {
  const [state, setState] = useState<VoiceInputState>("idle");
  const [transcript, setTranscript] = useState("");
  const [muted, setMuted] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike>();
  // One semantic result per session. Speech engines emit `isFinal` more than
  // once for the same utterance, and a caller that submitted twice because of it
  // would be sending two gameplay commands for one sentence.
  const finalHandledRef = useRef(false);
  const clearTimerRef = useRef<number>();
  const callbackRef = useRef(onFinalTranscript);

  useEffect(() => {
    callbackRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

  const clearTimer = useCallback(() => {
    if (clearTimerRef.current) {
      window.clearTimeout(clearTimerRef.current);
      clearTimerRef.current = undefined;
    }
  }, []);

  const stop = useCallback(
    (nextState: VoiceInputState = "idle") => {
      clearTimer();
      const recognition = recognitionRef.current;
      recognitionRef.current = undefined;
      if (recognition) {
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        recognition.abort();
      }
      finalHandledRef.current = false;
      setTranscript("");
      setState(nextState);
    },
    [clearTimer],
  );

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      !window.SpeechRecognition &&
      !window.webkitSpeechRecognition
    ) {
      setState("unsupported");
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      stop(connection === "connected" ? "idle" : "reconnecting");
    } else if (connection !== "connected") {
      stop(connection === "error" ? "error" : "reconnecting");
    } else if (state === "reconnecting" || state === "error") {
      setState("idle");
    }
  }, [connection, enabled, state, stop]);

  useEffect(() => {
    stop(connection === "connected" ? "idle" : "reconnecting");
    // The key changes when the turn or current item changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lifecycleKey]);

  useEffect(() => () => stop("idle"), [stop]);

  const start = useCallback(() => {
    if (!enabled || connection !== "connected") return;
    const Recognition =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setState("unsupported");
      return;
    }

    stop("idle");
    const recognition = new Recognition();
    recognition.lang = lang;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = MAX_ALTERNATIVES;
    recognitionRef.current = recognition;
    finalHandledRef.current = false;
    setTranscript("");
    setState("listening");

    recognition.onresult = (event) => {
      let latestTranscript = "";
      let finalTranscript = "";
      let finalAlternatives: string[] = [];
      for (
        let index = event.resultIndex;
        index < event.results.length;
        index += 1
      ) {
        const result = event.results[index];
        const value = result?.[0]?.transcript?.trim() ?? "";
        if (!value) continue;
        latestTranscript = value;
        if (!result.isFinal) continue;
        finalTranscript = value;
        // The engine's own runners-up for this same sentence.
        finalAlternatives = [];
        for (
          let rank = 1;
          rank < Math.min(result.length, MAX_ALTERNATIVES);
          rank += 1
        ) {
          const alternative = result[rank]?.transcript?.trim() ?? "";
          // The engine repeats itself when it is confident; one guess is one
          // guess however many times it is ranked.
          if (
            alternative &&
            alternative !== value &&
            !finalAlternatives.includes(alternative)
          ) {
            finalAlternatives.push(alternative);
          }
        }
      }
      if (latestTranscript) setTranscript(latestTranscript);
      if (!finalTranscript || finalHandledRef.current) return;

      finalHandledRef.current = true;
      setTranscript(finalTranscript);
      setState("processing");
      recognition.stop();
      clearTimerRef.current = window.setTimeout(() => {
        setState("recognized");
        callbackRef.current(finalTranscript, finalAlternatives);
        clearTimerRef.current = window.setTimeout(() => {
          setTranscript("");
          setState("idle");
          clearTimerRef.current = undefined;
        }, RESET_DELAY_MS);
      }, RECOGNISED_DELAY_MS);
    };

    recognition.onerror = (event) => {
      recognitionRef.current = undefined;
      finalHandledRef.current = false;
      if (event.error === "no-speech") {
        setState("no-speech");
      } else if (
        event.error === "not-allowed" ||
        event.error === "service-not-allowed"
      ) {
        setState("permission-denied");
      } else {
        setState("error");
      }
    };

    recognition.onend = () => {
      recognitionRef.current = undefined;
      if (!finalHandledRef.current) {
        setState((current) =>
          current === "listening" ? "no-speech" : current,
        );
      }
    };

    try {
      recognition.start();
    } catch {
      recognitionRef.current = undefined;
      setState("error");
    }
  }, [connection, enabled, lang, stop]);

  const startRef = useRef(start);
  useEffect(() => {
    startRef.current = start;
  }, [start]);

  const toggleMute = useCallback(() => {
    setMuted((current) => {
      if (!current) stop("idle");
      return !current;
    });
  }, [stop]);

  /**
   * Listening again by itself, for as long as it is this player's turn.
   *
   * One tap per answer was the real cost of the old shape: the engine stops
   * after every sentence and every pause, and القنبلة's clock does not. The
   * fairness this was protecting is structural and still holds — only the phone
   * holding the bomb is ever `enabled`, so a loud room cannot answer for anyone.
   * The mic button stays, with the opposite meaning: it mutes.
   */
  useEffect(() => {
    if (!autoListen || muted || !enabled || connection !== "connected") return;
    // Deliberately not after `permission-denied`, `unsupported` or `error`:
    // retrying those is how a page starts asking every quarter second.
    if (state !== "idle" && state !== "no-speech") return;
    // Through a ref, deliberately. This effect arms a timer, and القنبلة's panel
    // re-renders on every clock tick: if the restart depended on `start`'s
    // identity, any future change that made `start` churn would clear and
    // re-arm the timer faster than it could fire, and the mic would never open.
    const timer = window.setTimeout(() => startRef.current(), RESTART_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [autoListen, connection, enabled, muted, state]);

  // A new turn, item or question unmutes: silence is for the moment a player
  // asked for it, not for the rest of the challenge.
  useEffect(() => {
    setMuted(false);
  }, [lifecycleKey]);

  return { state, transcript, muted, start, stop, toggleMute };
}
