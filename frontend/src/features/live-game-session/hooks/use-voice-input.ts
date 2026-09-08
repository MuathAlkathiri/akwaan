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

export const DEFAULT_VOICE_LANG = "ar-SA";

export function useVoiceInput({
  enabled,
  connection,
  lifecycleKey,
  lang = DEFAULT_VOICE_LANG,
  onFinalTranscript,
}: {
  /** The caller's own rule for "may this surface listen right now". */
  enabled: boolean;
  connection: LiveSessionConnectionState;
  /** Changes when the turn, item or question does; resets everything. */
  lifecycleKey: string;
  lang?: string;
  /** Called once per listening session, with the finalised text. */
  onFinalTranscript: (transcript: string) => void;
}): {
  state: VoiceInputState;
  transcript: string;
  start: () => void;
  stop: (nextState?: VoiceInputState) => void;
} {
  const [state, setState] = useState<VoiceInputState>("idle");
  const [transcript, setTranscript] = useState("");
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
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;
    finalHandledRef.current = false;
    setTranscript("");
    setState("listening");

    recognition.onresult = (event) => {
      let latestTranscript = "";
      let finalTranscript = "";
      for (
        let index = event.resultIndex;
        index < event.results.length;
        index += 1
      ) {
        const result = event.results[index];
        const value = result?.[0]?.transcript?.trim() ?? "";
        if (!value) continue;
        latestTranscript = value;
        if (result.isFinal) finalTranscript = value;
      }
      if (latestTranscript) setTranscript(latestTranscript);
      if (!finalTranscript || finalHandledRef.current) return;

      finalHandledRef.current = true;
      setTranscript(finalTranscript);
      setState("processing");
      recognition.stop();
      clearTimerRef.current = window.setTimeout(() => {
        setState("recognized");
        callbackRef.current(finalTranscript);
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
        setState((current) => (current === "listening" ? "no-speech" : current));
      }
    };

    try {
      recognition.start();
    } catch {
      recognitionRef.current = undefined;
      setState("error");
    }
  }, [connection, enabled, lang, stop]);

  return { state, transcript, start, stop };
}
