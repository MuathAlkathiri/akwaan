"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveSessionConnectionState } from "../model";

export type BombVoiceState =
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

const SKIP_WORDS = new Set(["تخطي", "تجاوز", "عدي"]);

function normalizeVoiceCommand(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

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
  const [state, setState] = useState<BombVoiceState>("idle");
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<SpeechRecognitionLike>();
  const finalHandledRef = useRef(false);
  const clearTimerRef = useRef<number>();
  const callbacksRef = useRef({ onAnswer, onSkip });

  useEffect(() => {
    callbacksRef.current = { onAnswer, onSkip };
  }, [onAnswer, onSkip]);

  const clearTimer = useCallback(() => {
    if (clearTimerRef.current) {
      window.clearTimeout(clearTimerRef.current);
      clearTimerRef.current = undefined;
    }
  }, []);

  const stop = useCallback(
    (nextState: BombVoiceState = "idle") => {
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
    recognition.lang = "ar-SA";
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
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
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
        if (SKIP_WORDS.has(normalizeVoiceCommand(finalTranscript))) {
          callbacksRef.current.onSkip();
        } else {
          callbacksRef.current.onAnswer(finalTranscript);
        }
        clearTimerRef.current = window.setTimeout(() => {
          setTranscript("");
          setState("idle");
          clearTimerRef.current = undefined;
        }, 1_200);
      }, 150);
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
  }, [connection, enabled, stop]);

  return { state, transcript, start, stop };
}
