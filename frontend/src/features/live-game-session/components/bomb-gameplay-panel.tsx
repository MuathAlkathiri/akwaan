"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  Bomb,
  Loader2,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Send,
  SkipForward,
  Square,
  Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMediaUrl } from "@/lib/api/media-url";
import { useLiveSession } from "../hooks/live-session-context";
import {
  type BombVoiceState,
  useBombVoiceInput,
} from "../hooks/use-bomb-voice-input";
import { useTeamClockDisplay } from "../hooks/use-team-clock-display";
import type { GameplayRuntimeSnapshot } from "../model";

function BombItemImage({ url, altText }: { url: string; altText: string }) {
  const [state, setState] = useState<"loading" | "loaded" | "unavailable">(
    url ? "loading" : "unavailable",
  );

  return (
    <div className="relative mx-auto flex aspect-video w-full max-w-2xl items-center justify-center overflow-hidden rounded-[var(--radius)] bg-muted">
      {state === "loading" && (
        <div
          role="status"
          className="absolute inset-0 flex animate-pulse items-center justify-center text-sm text-muted-foreground"
        >
          Loading image…
        </div>
      )}
      {url && state !== "unavailable" && (
        // The backend serves managed game media directly; bypassing Next's
        // optimizer keeps the resolved API-origin URL identical for all clients.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={altText}
          className={`h-full w-full object-contain transition-opacity ${
            state === "loaded" ? "opacity-100" : "opacity-0"
          }`}
          onLoad={() => setState("loaded")}
          onError={() => setState("unavailable")}
        />
      )}
      {state === "unavailable" && (
        <p role="status" className="p-6 text-center text-muted-foreground">
          The image for this Bomb item is unavailable.
        </p>
      )}
    </div>
  );
}

function BombItemAudio({ url }: { url: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setIsPlaying(false);
    setHasError(false);
    if (!audioRef.current || !url) return;

    try {
      if (typeof audioRef.current.load === "function") {
        audioRef.current.load();
      }
      if (typeof audioRef.current.play === "function") {
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => setIsPlaying(true))
            .catch(() => {
              // Autoplay blocked by browser policy - user can press play manually
              setIsPlaying(false);
            });
        }
      }
    } catch {
      // Audio element not supported in test environment or error loading
    }
  }, [url]);

  const togglePlay = () => {
    if (!audioRef.current || hasError) return;
    if (isPlaying) {
      if (typeof audioRef.current.pause === "function") {
        audioRef.current.pause();
      }
      setIsPlaying(false);
    } else {
      if (typeof audioRef.current.play === "function") {
        try {
          const playPromise = audioRef.current.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => setIsPlaying(true))
              .catch(() => setIsPlaying(false));
          }
        } catch {
          setIsPlaying(false);
        }
      }
    }
  };

  const restartAudio = () => {
    if (!audioRef.current || hasError) return;
    try {
      audioRef.current.currentTime = 0;
      if (typeof audioRef.current.play === "function") {
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => setIsPlaying(true))
            .catch(() => setIsPlaying(false));
        }
      }
    } catch {
      setIsPlaying(false);
    }
  };

  return (
    <div className="relative mx-auto flex w-full max-w-2xl flex-col items-center justify-center gap-4 rounded-[var(--radius)] border border-primary/20 bg-primary/5 p-8 text-center">
      <audio
        ref={audioRef}
        src={url}
        preload="auto"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onError={() => setHasError(true)}
      />

      <div className="flex items-center justify-center gap-4">
        <Button
          type="button"
          size="lg"
          variant={isPlaying ? "default" : "outline"}
          className="size-20 rounded-full shadow-md"
          onClick={togglePlay}
          disabled={hasError || !url}
          aria-label={isPlaying ? "إيقاف الصوت" : "تشغيل الصوت"}
        >
          {isPlaying ? (
            <Pause className="size-8" aria-hidden />
          ) : (
            <Play className="size-8 fill-current" aria-hidden />
          )}
        </Button>

        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-12 rounded-full"
          onClick={restartAudio}
          disabled={hasError || !url}
          aria-label="إعادة تشغيل الصوت"
        >
          <RotateCcw className="size-5" aria-hidden />
        </Button>
      </div>

      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Volume2
          className={`size-5 ${isPlaying ? "animate-pulse text-primary" : ""}`}
          aria-hidden
        />
        <span>{isPlaying ? "جارٍ تشغيل المقطع الصوتي…" : "اضغط للتشغيل أو الاستماع مجددًا"}</span>
      </div>

      {hasError && (
        <p role="alert" className="text-xs text-destructive">
          تعذر تشغيل المقطع الصوتي. يمكنك كتابة الإجابة أو تخطي السؤال.
        </p>
      )}
    </div>
  );
}

function BombItemText({ prompt }: { prompt: string }) {
  return (
    <div className="relative mx-auto flex min-h-[140px] w-full max-w-2xl items-center justify-center rounded-[var(--radius)] border border-muted bg-muted/40 p-6 text-center shadow-inner">
      <p className="text-2xl font-black leading-snug tracking-tight text-foreground sm:text-3xl">
        {prompt}
      </p>
    </div>
  );
}

const VOICE_MESSAGES: Partial<Record<BombVoiceState, string>> = {
  listening: "أستمع الآن… تكلّم بوضوح",
  processing: "جارٍ التعرّف على الإجابة…",
  recognized: "تم التعرّف على الإجابة وإرسالها",
  "no-speech": "ما سمعت إجابة. اضغط المايك وجرّب مرة ثانية.",
  "permission-denied":
    "لم يتم السماح باستخدام الميكروفون. فعّل الإذن أو استخدم الكتابة.",
  unsupported: "التعرّف الصوتي غير مدعوم في هذا المتصفح. استخدم الكتابة.",
  reconnecting: "جارٍ إعادة الاتصال. سيتاح الميكروفون بعد الاتصال.",
  error: "ما قدرت أشغّل المايك. جرّب مرة ثانية أو اكتب الإجابة.",
};

export function BombGameplayPanel({
  runtime,
}: {
  runtime: GameplayRuntimeSnapshot;
}) {
  const { snapshot, gameplayCommand, connection } = useLiveSession();
  const [answer, setAnswer] = useState("");
  const answerInputRef = useRef<HTMLInputElement>(null);
  const round = runtime.activeRound;
  const activeTeamId = runtime.activeTeamId ?? round?.activeTeamId;
  const clock = useTeamClockDisplay(activeTeamId ?? "");
  const canSubmit = runtime.availableActions.includes("mode:submit-answer");
  const canSkip = runtime.availableActions.includes("mode:skip");
  const phase = String(round?.modeState.phase ?? "");
  const resolvingExpiration =
    Boolean(round && activeTeamId) &&
    clock.expired &&
    phase === "presenting" &&
    !snapshot?.bombResult;
  const answerEnabled =
    canSubmit &&
    connection === "connected" &&
    phase === "presenting" &&
    snapshot?.status === "active" &&
    !resolvingExpiration;
  const roundId = round?.id ?? "";
  const itemIndex =
    runtime.currentItem?.index ?? Number(round?.modeState.itemIndex ?? 0);

  useEffect(() => {
    if (answerEnabled) {
      answerInputRef.current?.focus();
    }
  }, [answerEnabled, activeTeamId]);

  const submitAnswer = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed || !answerEnabled) return;
      gameplayCommand("gameplay-command", {
        roundId,
        commandType: "submit-answer",
        payload: { answer: trimmed },
      });
      setAnswer("");
    },
    [answerEnabled, gameplayCommand, roundId],
  );

  const skipItem = useCallback(() => {
    if (!canSkip || connection !== "connected") return;
    gameplayCommand("gameplay-command", {
      roundId,
      commandType: "skip",
      payload: {},
    });
  }, [canSkip, connection, gameplayCommand, roundId]);

  const voice = useBombVoiceInput({
    enabled: answerEnabled,
    connection,
    lifecycleKey: `${roundId}:${activeTeamId ?? ""}:${itemIndex}:${phase}`,
    onAnswer: submitAnswer,
    onSkip: skipItem,
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    submitAnswer(answer);
  }

  function skip() {
    voice.stop("idle");
    skipItem();
  }

  if (!round) return null;
  if (snapshot?.bombResult) return null;
  const prompt = runtime.prompt ?? String(round.modeState.prompt ?? "");

  const mediaType =
    runtime.currentItem?.media?.type ??
    (round.modeState.mediaType as "none" | "image" | "audio" | undefined) ??
    (runtime.currentItem?.image?.url || round.modeState.imageUrl
      ? "image"
      : "none");

  const rawMediaUrl =
    runtime.currentItem?.media?.url ||
    (round.modeState.mediaUrl as string) ||
    runtime.currentItem?.image?.url ||
    (round.modeState.imageUrl as string) ||
    "";

  const altText =
    runtime.currentItem?.media?.altText?.trim() ||
    runtime.currentItem?.image?.altText?.trim() ||
    String(round.modeState.altText ?? "").trim() ||
    prompt;

  const itemCount =
    runtime.currentItem?.totalItems ?? Number(round.modeState.itemCount ?? 0);
  const activeTeam = snapshot?.teams.find((team) => team.id === activeTeamId);

  return (
    <section className="space-y-5 rounded-[var(--radius)] border bg-card p-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-xl font-semibold">
          <Bomb className="size-5 text-destructive" aria-hidden />
          Bomb
        </h3>
        <output
          className="akwaan-numeral inline-flex items-center gap-2 rounded-full border border-destructive/30 bg-destructive/10 px-5 py-2 text-3xl font-black tabular-nums text-destructive"
          aria-label={`${activeTeam?.name ?? "Active team"} remaining Bomb time`}
          aria-live="off"
        >
          <Bomb className="size-7" aria-hidden />
          {clock.formatted}
        </output>
        <p className="text-sm text-muted-foreground">
          Item {Math.min(itemIndex + 1, itemCount)} of {itemCount}
        </p>
      </header>

      {phase === "presenting" ? (
        mediaType === "image" && rawMediaUrl ? (
          <div className="space-y-4">
            <div className="space-y-1 text-center">
              <p className="text-2xl font-bold">{prompt}</p>
              <p className="text-sm text-muted-foreground">
                Active team: {activeTeam?.name ?? "—"}
              </p>
            </div>
            <BombItemImage
              key={rawMediaUrl}
              url={getMediaUrl(rawMediaUrl)}
              altText={altText}
            />
          </div>
        ) : mediaType === "audio" && rawMediaUrl ? (
          <div className="space-y-4">
            <div className="space-y-1 text-center">
              <p className="text-2xl font-bold">{prompt}</p>
              <p className="text-sm text-muted-foreground">
                Active team: {activeTeam?.name ?? "—"}
              </p>
            </div>
            <BombItemAudio
              key={rawMediaUrl}
              url={getMediaUrl(rawMediaUrl)}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">
                Active team: {activeTeam?.name ?? "—"}
              </p>
            </div>
            <BombItemText
              key={prompt}
              prompt={prompt}
            />
          </div>
        )
      ) : (
        <p className="rounded-lg bg-muted p-6 text-center font-medium">
          This Bomb question is complete. The host can complete the round and
          start the next question.
        </p>
      )}
      {resolvingExpiration && (
        <p
          role="status"
          className="rounded-lg bg-muted p-4 text-center font-medium"
        >
          Time is up. Resolving the Bomb result…
        </p>
      )}
      {(canSubmit || canSkip) &&
        phase === "presenting" &&
        !resolvingExpiration &&
        snapshot?.status === "active" && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3 rounded-[var(--radius)] bg-muted/60 p-4 text-center">
              <Button
                type="button"
                size="lg"
                className="size-20 rounded-full"
                variant={
                  voice.state === "listening" ? "destructive" : "default"
                }
                disabled={
                  !answerEnabled ||
                  voice.state === "processing" ||
                  voice.state === "unsupported"
                }
                onClick={() =>
                  voice.state === "listening"
                    ? voice.stop("idle")
                    : voice.start()
                }
                aria-label={
                  voice.state === "listening"
                    ? "إيقاف الاستماع"
                    : "الإجابة بالصوت"
                }
              >
                {voice.state === "listening" ? (
                  <Square className="size-8 fill-current" aria-hidden />
                ) : voice.state === "processing" ? (
                  <Loader2 className="size-9 animate-spin" aria-hidden />
                ) : (
                  <Mic className="size-9" aria-hidden />
                )}
              </Button>
              {voice.state === "listening" && (
                <span
                  className="inline-flex items-center gap-2 font-medium text-destructive"
                  role="status"
                >
                  <span className="size-3 animate-pulse rounded-full bg-destructive" />
                  {VOICE_MESSAGES.listening}
                </span>
              )}
              {voice.transcript && (
                <p
                  className="text-lg font-semibold"
                  dir="rtl"
                  aria-live="polite"
                >
                  «{voice.transcript}»
                </p>
              )}
              {voice.state !== "idle" && voice.state !== "listening" && (
                <p
                  className={
                    voice.state === "recognized"
                      ? "text-sm text-primary"
                      : "text-sm text-muted-foreground"
                  }
                  role="status"
                >
                  {VOICE_MESSAGES[voice.state]}
                </p>
              )}
            </div>
            <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
              <Input
                ref={answerInputRef}
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder="اكتب إجابتك"
                aria-label="Bomb answer"
                autoComplete="off"
                disabled={!answerEnabled}
              />
              <Button
                type="submit"
                disabled={
                  !canSubmit || !answer.trim() || connection !== "connected"
                }
              >
                <Send className="size-4" aria-hidden />
                Submit
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!canSkip || connection !== "connected"}
                onClick={skip}
              >
                <SkipForward className="size-4" aria-hidden />
                Skip (-5s)
              </Button>
            </form>
          </div>
        )}
    </section>
  );
}
