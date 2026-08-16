"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Bomb, Loader2, Mic, Send, SkipForward, Square } from "lucide-react";
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

function BombItemImage({
  url,
  altText,
}: {
  url: string;
  altText: string;
}) {
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

const VOICE_MESSAGES: Partial<Record<BombVoiceState, string>> = {
  listening: "أستمع الآن… تكلّم بوضوح",
  processing: "جارٍ التعرّف على الإجابة…",
  recognized: "تم التعرّف على الإجابة وإرسالها",
  "no-speech": "لم أسمع إجابة. اضغط الميكروفون وحاول مرة أخرى.",
  "permission-denied":
    "لم يتم السماح باستخدام الميكروفون. فعّل الإذن أو استخدم الكتابة.",
  unsupported: "التعرّف الصوتي غير مدعوم في هذا المتصفح. استخدم الكتابة.",
  reconnecting: "جارٍ إعادة الاتصال. سيتاح الميكروفون بعد الاتصال.",
  error: "تعذر تشغيل الميكروفون. حاول مرة أخرى أو استخدم الكتابة.",
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

  // No expiration is sent from here, deliberately.
  //
  // This countdown is a projection of the team clock the server already owns:
  // it is anchored to `serverTimestamp` and ticks locally between snapshots, so
  // a backgrounded tab, a throttled timer or a skewed device clock all move it.
  // Deciding that the clock is spent is therefore not something this component
  // can be trusted with, and it no longer tries — `GameplayDeadlineScheduler`
  // derives the same instant from persisted state and expires the team from the
  // server. `clock.expired` is still read below to stop offering an answer
  // input for a clock that has visibly run out, which is presentation.

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
  const currentItemImage = {
    url: getMediaUrl(
      runtime.currentItem?.image.url ??
        String(round.modeState.imageUrl ?? ""),
    ),
    altText:
      runtime.currentItem?.image.altText?.trim() ||
      String(round.modeState.altText ?? "").trim() ||
      prompt,
  };
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
        <p className="text-sm text-muted-foreground">
          Item {Math.min(itemIndex + 1, itemCount)} of {itemCount}
        </p>
      </header>
      <div className="space-y-2 text-center">
        <p className="text-2xl font-bold">{prompt}</p>
        <p className="text-sm text-muted-foreground">
          Active team: {activeTeam?.name ?? "—"}
        </p>
      </div>
      {phase === "presenting" ? (
        <BombItemImage
          key={currentItemImage.url}
          url={currentItemImage.url}
          altText={currentItemImage.altText}
        />
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
                variant={voice.state === "listening" ? "destructive" : "default"}
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
                <p className="text-lg font-semibold" dir="rtl" aria-live="polite">
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
