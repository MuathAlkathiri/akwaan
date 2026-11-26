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
import { cn } from "@/lib/utils";
import {
  useLiveSession,
  type GameplayCommandDelivery,
} from "../hooks/live-session-context";
import {
  type BombVoiceState,
  useBombVoiceInput,
} from "../hooks/use-bomb-voice-input";
import { useTeamClockDisplay } from "../hooks/use-team-clock-display";
import {
  countdownSeconds,
  countdownUrgency,
  DEFAULT_COUNTDOWN_THRESHOLDS,
} from "../match/components/countdown-urgency";
import {
  useCountdownCues,
  useCountdownSurface,
} from "../match/components/countdown-presentation";
import { CountdownSoundToggle } from "../match/components/challenge-countdown";
import { ChallengeFrame } from "../match/components/challenge-frame";
import {
  AnswerEntry,
  AnswerListeningPill,
  AnswerNote,
} from "../match/components/answer-entry";
import {
  ChallengeContextStrip,
  useChallengeContext,
} from "../match/components/challenge-context-strip";
import { BidiText } from "@/components/akwaan/bidi-text";
import { teamIdentityOf } from "@/lib/team-identity";
import { MobileActionArea } from "../match/components/mobile-action-area";
import { useMobileSurface } from "../match/components/mobile-gameplay-shell";
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
          نحمّل الصورة…
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
        <span>
          {isPlaying
            ? "جارٍ تشغيل المقطع الصوتي…"
            : "اضغط للتشغيل أو الاستماع مجددًا"}
        </span>
      </div>

      {hasError && (
        <p role="alert" className="text-xs text-foreground">
          تعذر تشغيل المقطع الصوتي. يمكنك كتابة الإجابة أو تخطي السؤال.
        </p>
      )}
    </div>
  );
}

const VOICE_MESSAGES: Partial<Record<BombVoiceState, string>> = {
  listening: "أستمع الآن… تكلّم بوضوح",
  processing: "جارٍ التعرّف على الإجابة…",
  // Recognition only. Whether the answer reached the server, and what it said,
  // is the send button's and the answer notice's to tell — never this line's.
  recognized: "تعرّفت على إجابتك.",
  "no-speech": "ما سمعت إجابة. اضغط المايك وجرّب مرة ثانية.",
  "permission-denied":
    "لم يتم السماح باستخدام الميكروفون. فعّل الإذن أو استخدم الكتابة.",
  unsupported: "التعرّف الصوتي غير مدعوم في هذا المتصفح. استخدم الكتابة.",
  reconnecting: "جارٍ إعادة الاتصال. سيتاح الميكروفون بعد الاتصال.",
  error: "ما قدرت أشغّل المايك. جرّب مرة ثانية أو اكتب الإجابة.",
};

/** The voice line, which says "sending" only while a send is actually open. */
function voiceMessage(state: BombVoiceState, sending: boolean) {
  if (state === "recognized" && sending) {
    return "تعرّفت على إجابتك. جارٍ الإرسال…";
  }
  return VOICE_MESSAGES[state];
}

/** Why the answer field is showing a line under it. Each is the server's word. */
type AnswerNotice = "incorrect" | "rejected" | "not-sent" | "unknown";

const ANSWER_NOTICES: Record<AnswerNotice, string> = {
  incorrect: "غلط! جرّب إجابة ثانية.",
  rejected: "ما انقبلت إجابتك. جرّب مرة ثانية.",
  "not-sent": "ما انرسلت إجابتك. تأكد من الاتصال وأرسلها مرة ثانية.",
  unknown: "ما وصلنا رد على إجابتك. إذا السؤال ما تغيّر، أرسلها مرة ثانية.",
};

interface PendingCommand {
  /** Identity of this send, so an answer to an older one is never read as its. */
  token: object;
  kind: "answer" | "skip";
  text?: string;
  /** The runtime revision this phone held when it sent. */
  revision: number;
  /** The revision the server answered with, once it has. */
  ackRevision?: number;
}

export function BombGameplayPanel({
  runtime,
}: {
  runtime: GameplayRuntimeSnapshot;
}) {
  const { snapshot, gameplayCommand, connection } = useLiveSession();
  // Which surface is rendering this, from the shell that mounted it. The shared
  // screen reads `false` and keeps its existing room presentation untouched.
  const phone = useMobileSurface();
  const context = useChallengeContext();
  const [answer, setAnswer] = useState("");
  // One guard for every answer path. Typing, Enter and a final voice transcript
  // all converge on `submitAnswer`, so closing the window there closes it for
  // all three at once — no second guard in the voice hook.
  const [sending, setSending] = useState(false);
  const answerInputRef = useRef<HTMLInputElement>(null);
  const sendingRef = useRef(false);
  // The one command in flight. Its verdict comes from its own acknowledgement,
  // never from whatever else the session happens to report meanwhile.
  const pendingRef = useRef<PendingCommand>();
  const [acknowledged, setAcknowledged] = useState(0);
  const [notice, setNotice] = useState<AnswerNotice>();
  const round = runtime.activeRound;
  const activeTeamId = runtime.activeTeamId ?? round?.activeTeamId;
  const clock = useTeamClockDisplay(activeTeamId ?? "");
  // The same urgency every countdown uses, read from the one TeamClock. Bomb's
  // clock is continuous and thirty seconds a team, so the default thresholds
  // apply; it is never turned into a per-question timer here.
  const clockSeconds = countdownSeconds(clock.remainingMs);
  const clockUrgency = activeTeamId ? countdownUrgency(clockSeconds) : "calm";
  const countdownSurface = useCountdownSurface();
  const canSubmit = runtime.availableActions.includes("mode:submit-answer");
  const canSkip = runtime.availableActions.includes("mode:skip");
  const phase = String(round?.modeState.phase ?? "");
  // The wall's clock may sound; a phone's never does — and never over an
  // audio item, whose clip is the question.
  const audioItem =
    (runtime.currentItem?.media?.type ??
      (round?.modeState.mediaType as string | undefined)) === "audio";
  useCountdownCues(
    clockSeconds,
    DEFAULT_COUNTDOWN_THRESHOLDS,
    countdownSurface === "stage" &&
      !phone &&
      !audioItem &&
      Boolean(activeTeamId) &&
      phase === "presenting",
    // Each team's clock is its own: a handoff is first sight, not a step.
    activeTeamId ?? undefined,
  );
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

  // Any authoritative move releases the guard: a new item, the turn passing to
  // the other team, the phase changing, or this phone losing the right to act
  // (a reassignment after disconnect). The server decides when this phone may
  // send again — never a timer here.
  useEffect(() => {
    sendingRef.current = false;
    pendingRef.current = undefined;
    setSending(false);
    setNotice(undefined);
  }, [itemIndex, activeTeamId, phase, canSubmit, canSkip, roundId]);

  // An answer handed back for another try belongs to the question it was
  // typed for. A new question, or the turn coming round again, starts empty.
  useEffect(() => {
    setAnswer("");
  }, [itemIndex, activeTeamId, roundId]);

  const release = useCallback((outcome?: AnswerNotice) => {
    const pending = pendingRef.current;
    pendingRef.current = undefined;
    sendingRef.current = false;
    setSending(false);
    setNotice(outcome);
    // An answer that was refused, never left, or went unanswered is handed
    // back rather than lost with the keyboard.
    if (
      (outcome === "rejected" ||
        outcome === "not-sent" ||
        outcome === "unknown") &&
      pending?.text
    ) {
      setAnswer((current) => current || pending.text!);
    }
    // Disabling the field closed the phone keyboard; a player who has to
    // try again should not have to tap the field to get it back.
    if (outcome) window.setTimeout(() => answerInputRef.current?.focus(), 0);
  }, []);

  // The server processed the command and answered at `ackRevision`. A wrong
  // answer moves nothing the reset effect above watches — the item and the turn
  // stay, and `bomb-answer-incorrect` is recorded — so the verdict is read here,
  // once this phone holds the state the server answered with. Only a wrong
  // answer recorded between this send and that answer is this send's, which is
  // what keeps an older command's verdict from opening a newer one.
  const transitions = runtime.transitions;
  const runtimeRevision = runtime.revision;
  useEffect(() => {
    const pending = pendingRef.current;
    if (pending?.ackRevision === undefined) return;
    if (runtimeRevision < pending.ackRevision) return;
    const judgedWrong =
      pending.kind === "answer" &&
      (transitions ?? []).some(
        (transition) =>
          transition.type === "bomb-answer-incorrect" &&
          transition.revision > pending.revision &&
          transition.revision <= pending.ackRevision! &&
          (!transition.roundId || transition.roundId === roundId),
      );
    release(judgedWrong ? "incorrect" : undefined);
  }, [acknowledged, transitions, runtimeRevision, roundId, release]);

  /** Follows one send to the server's answer, and only that send. */
  const follow = useCallback(
    (kind: "answer" | "skip", text?: string): GameplayCommandDelivery => {
      const token = {};
      const sentRoundId = roundId;
      const sentItemIndex = itemIndex;
      const sentTeamId = activeTeamId;
      const action = kind === "answer" ? "mode:submit-answer" : "mode:skip";
      pendingRef.current = {
        token,
        kind,
        ...(text ? { text } : {}),
        revision: runtime.revision,
      };
      return {
        onOutcome: (outcome) => {
          const pending = pendingRef.current;
          // An answer to a send this phone has already moved past.
          if (pending?.token !== token) return;
          if (outcome.status === "accepted") {
            if (outcome.runtimeRevision === undefined) {
              release();
              return;
            }
            pending.ackRevision = outcome.runtimeRevision;
            setAcknowledged((count) => count + 1);
          } else if (outcome.status === "rejected") {
            release("rejected");
          } else if (outcome.status === "unknown") {
            release("unknown");
          } else {
            // The question moved on before a resend; the snapshot says how.
            release();
          }
        },
        // A resend goes only to the question it was made for: same round, same
        // item, same team, still this phone's to act on, and still being
        // asked. Past the deadline the round is no longer presenting, and the
        // server refuses a late answer regardless.
        canResend: (latest) => {
          const gameplay = latest.gameplay;
          const active = gameplay?.activeRound;
          if (!gameplay || !active || latest.status !== "active") return false;
          const latestItem =
            gameplay.currentItem?.index ??
            Number(active.modeState.itemIndex ?? 0);
          return (
            active.id === sentRoundId &&
            String(active.modeState.phase ?? "") === "presenting" &&
            latestItem === sentItemIndex &&
            (gameplay.activeTeamId ?? active.activeTeamId) === sentTeamId &&
            gameplay.availableActions.includes(action)
          );
        },
      };
    },
    [activeTeamId, itemIndex, release, roundId, runtime.revision],
  );

  const submitAnswer = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed || !answerEnabled || sendingRef.current) return;
      sendingRef.current = true;
      setSending(true);
      setNotice(undefined);
      try {
        gameplayCommand(
          "gameplay-command",
          {
            roundId,
            commandType: "submit-answer",
            payload: { answer: trimmed },
          },
          follow("answer", trimmed),
        );
      } catch {
        // The connection refuses to send while it is down, and says so by
        // throwing. The answer never left, so it stays in the field.
        release("not-sent");
        return;
      }
      setAnswer("");
    },
    [answerEnabled, follow, gameplayCommand, roundId, release],
  );

  const skipItem = useCallback(() => {
    if (!canSkip || connection !== "connected" || sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    setNotice(undefined);
    try {
      gameplayCommand(
        "gameplay-command",
        { roundId, commandType: "skip", payload: {} },
        follow("skip"),
      );
    } catch {
      release("not-sent");
    }
  }, [canSkip, connection, follow, gameplayCommand, roundId, release]);

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

  // ── The phone ────────────────────────────────────────────────────────────
  //
  // A phone is a controller, and in Bomb only one phone in the room is holding
  // one: `mode:submit-answer` is authorised per *participant* against the
  // runtime's `activeParticipantId`, so this flag is the server's own answer to
  // "is this the phone that may act", not a team comparison. When the runtime
  // reassigns the owner after a disconnect, the two phones swap roles on the
  // next snapshot with nothing remounting.
  const isActor = canSubmit || canSkip;

  if (phone && !isActor) {
    // Everyone else waits, and waits *empty*: no question, no image, and above
    // all no clock. The exact remaining time is the acting player's instrument
    // and the room's drama — a teammate reading it off their own screen would be
    // playing a different game from the one on the wall.
    const waitingForTeammate =
      Boolean(activeTeamId) &&
      snapshot?.participants.find(
        (person) => person.id === round?.activeParticipantId,
      );
    return (
      <section
        dir="rtl"
        data-testid="bomb-phone-waiting"
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-center"
      >
        <span
          aria-hidden
          className="grid size-14 place-items-center rounded-full border border-border bg-muted/50"
        >
          <Bomb className="size-7 text-muted-foreground" />
        </span>
        <p className="text-base font-black text-foreground">
          {waitingForTeammate
            ? `${waitingForTeammate.displayName} يجاوب الآن`
            : "الدور على الفريق الآخر"}
        </p>
        <p className="text-sm font-bold text-muted-foreground">
          تابعوا الشاشة.
        </p>
      </section>
    );
  }

  if (phone) {
    const opponentTeamId = snapshot?.teams.find(
      (team) => team.active && team.id !== activeTeamId,
    )?.id;
    const rejected = notice === "incorrect" || notice === "rejected";
    return (
      <ChallengeFrame
        compact
        title="القنبلة عندك!"
        aside={
          // The one authoritative clock, from the session's own TeamClock,
          // worn on the bomb. Neither surface counts locally.
          <output
            data-testid="bomb-phone-clock"
            data-urgency={clockUrgency}
            aria-label={`باقي ${clockSeconds} ثانية على القنبلة`}
            className={cn(
              "relative block size-24 shrink-0 transition-transform duration-base ease-akwaan",
              clockUrgency === "critical" && "scale-110",
            )}
          >
            <BombGraphic
              urgency={clockUrgency}
              className="absolute inset-0 size-full"
            />
            <span
              className={cn(
                "akwaan-numeral absolute inset-x-0 top-[36%] text-center text-[29px] font-bold leading-none text-white",
                clockUrgency === "critical" && "akwaan-countdown-beat",
              )}
            >
              {clockSeconds}
            </span>
          </output>
        }
        className="flex min-h-0 flex-1 flex-col"
      >
        <div dir="rtl" className="flex min-h-0 flex-1 flex-col gap-3">
          <p className="-mt-2 text-[13px] text-brand-slate">
            ساعتك تمشي
            {opponentTeamId && (
              <>
                {" "}
                · خصمك باقي له <OpponentSeconds teamId={opponentTeamId} /> ث
              </>
            )}
          </p>
          {mediaType === "image" && rawMediaUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={getMediaUrl(rawMediaUrl)}
              alt={altText}
              data-testid="bomb-phone-image"
              className="h-[170px] w-full shrink-0 rounded-[14px] border-2 border-[hsl(var(--brand-navy))] bg-brand-wash object-contain"
            />
          )}
          <p
            data-testid="bomb-phone-prompt"
            className="shrink-0 text-center font-display text-xl font-extrabold leading-relaxed"
          >
            {prompt}
          </p>

          {resolvingExpiration ? (
            <p
              role="status"
              className="flex flex-1 items-center justify-center text-center text-lg font-bold text-brand-plum"
            >
              انتهى وقتكم. نحسب النتيجة…
            </p>
          ) : (
            <form
              onSubmit={submit}
              className="flex min-h-0 flex-1 flex-col gap-3"
              data-testid="bomb-phone-controls"
            >
              {/* Under the picture and small: listening never takes its place. */}
              {voice.state === "listening" && <AnswerListeningPill />}
              {notice && (
                <AnswerNote
                  tone={rejected ? "rejected" : "info"}
                  data-testid="bomb-phone-answer-notice"
                >
                  {ANSWER_NOTICES[notice]}
                </AnswerNote>
              )}
              {voice.state !== "idle" && voice.state !== "listening" && (
                <AnswerNote tone="info" data-testid="bomb-phone-voice-state">
                  {voice.transcript ? `«${voice.transcript}» · ` : ""}
                  {voiceMessage(voice.state, sending)}
                </AnswerNote>
              )}
              <div className="flex-1" />

              <MobileActionArea>
                <AnswerEntry
                  inputRef={answerInputRef}
                  value={answer}
                  onChange={(value) => {
                    setAnswer(value);
                    setNotice(undefined);
                  }}
                  disabled={!answerEnabled || sending}
                  mic={
                    voice.state === "listening"
                      ? "listening"
                      : voice.state === "processing"
                        ? "processing"
                        : voice.state === "unsupported"
                          ? "unsupported"
                          : "idle"
                  }
                  onMic={() =>
                    voice.state === "listening"
                      ? voice.stop("idle")
                      : voice.start()
                  }
                  micDisabled={!answerEnabled || sending}
                  inputTestId="bomb-phone-answer"
                  micTestId="bomb-phone-voice"
                />
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    disabled={!canSkip || sending || connection !== "connected"}
                    onClick={skip}
                    data-testid="bomb-phone-skip"
                    className="min-h-[62px] shrink-0 rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-white px-4 text-[15px] font-bold disabled:opacity-60"
                  >
                    تخطي <bdi dir="ltr">−5</bdi> ث
                  </button>
                  <button
                    type="submit"
                    disabled={
                      !canSubmit ||
                      sending ||
                      !answer.trim() ||
                      connection !== "connected"
                    }
                    aria-busy={sending}
                    data-testid="bomb-phone-submit"
                    className={cn(
                      "min-h-[62px] flex-1 rounded-full border-[3px] border-[hsl(var(--brand-navy))] font-display text-xl font-extrabold",
                      // Gold once there is something to send; lavender until then.
                      answer.trim()
                        ? "bg-[hsl(var(--brand-gold))]"
                        : "bg-brand-wash text-brand-plum",
                      answer.trim() &&
                        !sending &&
                        "shadow-[4px_5px_0_hsl(var(--brand-navy))]",
                    )}
                  >
                    {sending ? "نرسلها…" : "إرسال"}
                  </button>
                </div>
              </MobileActionArea>
            </form>
          )}
        </div>
      </ChallengeFrame>
    );
  }

  const question =
    mediaType === "image" && rawMediaUrl ? (
      <BombItemImage
        key={rawMediaUrl}
        url={getMediaUrl(rawMediaUrl)}
        altText={altText}
      />
    ) : mediaType === "audio" && rawMediaUrl ? (
      <BombItemAudio key={rawMediaUrl} url={getMediaUrl(rawMediaUrl)} />
    ) : null;

  // Who plays for each side: the holder the team chose, when the server says.
  const holders = readBombHolders(runtime.modeState);
  const playerOf = (teamId: string) => {
    const id =
      teamId === activeTeamId && round?.activeParticipantId
        ? round.activeParticipantId
        : holders[teamId];
    return snapshot?.participants.find((person) => person.id === id)
      ?.displayName;
  };
  const stageTeams = (snapshot?.teams ?? []).filter((team) => team.active);
  const activePlayer = activeTeamId ? playerOf(activeTeamId) : undefined;

  return (
    <section
      dir="rtl"
      data-testid="bomb-stage"
      className="flex flex-col gap-[18px] text-[hsl(var(--brand-navy))]"
    >
      <ChallengeContextStrip
        {...(context.eyebrow ? { eyebrow: context.eyebrow } : {})}
        title={context.title ?? "القنبلة"}
        aside={
          <span className="text-base font-bold lg:text-lg">
            اللي تخلص ساعته والقنبلة عنده يخسر
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)_minmax(0,300px)]">
        {stageTeams.map((team, index) => (
          <BombSide
            key={team.id}
            teamId={team.id}
            teamName={team.name}
            dotClass={teamIdentityOf(team.id, snapshot?.teams ?? []).dot}
            {...(playerOf(team.id) ? { playerName: playerOf(team.id)! } : {})}
            holding={team.id === activeTeamId}
            className={index === 0 ? "lg:order-1" : "lg:order-3"}
          />
        ))}

        <main className="flex min-h-[360px] flex-col items-center gap-6 rounded-[28px] border-[3px] border-[hsl(var(--brand-navy))] bg-brand-paper px-7 py-[22px] lg:order-2 lg:flex-row">
          {phase === "presenting" && question && (
            <div className="w-full shrink-0 lg:w-[300px]">{question}</div>
          )}
          <div className="flex min-w-0 flex-1 flex-col items-center gap-[18px] text-center">
            <div className="relative inline-flex items-center gap-2">
              <output
                data-testid="bomb-stage-clock"
                data-urgency={clockUrgency}
                aria-label={`الوقت المتبقي لـ${activeTeam?.name ?? "الفريق"}`}
                aria-live="off"
                className="relative block size-[180px] shrink-0 lg:size-[220px]"
              >
                <BombGraphic
                  urgency={clockUrgency}
                  className="absolute inset-0 size-full"
                />
                <span
                  className={cn(
                    "akwaan-numeral absolute inset-x-0 top-[36%] text-center text-5xl font-bold leading-none text-white lg:text-[66px]",
                    clockUrgency === "critical" && "akwaan-countdown-beat",
                  )}
                >
                  {clockSeconds}
                </span>
                {/* The exact minutes and seconds, for anybody reading it aloud. */}
                <span className="sr-only">{clock.formatted}</span>
              </output>
              {/* The room's only clock in Bomb, so the room's sound switch
                  lives here too. */}
              {countdownSurface === "stage" && <CountdownSoundToggle />}
            </div>
            {phase === "presenting" ? (
              <h1
                data-testid="bomb-stage-prompt"
                className="font-display text-3xl font-extrabold leading-normal lg:text-4xl lg:leading-normal"
              >
                <BidiText>{prompt}</BidiText>
              </h1>
            ) : (
              <p className="rounded-[18px] border-[3px] border-dashed border-brand-dash bg-white px-6 py-4 text-xl font-bold text-brand-plum">
                خلص هذا السؤال. نجهّز اللي بعده…
              </p>
            )}
            {resolvingExpiration && (
              <p
                role="status"
                className="rounded-[18px] border-[3px] border-dashed border-brand-dash bg-white px-6 py-3 text-xl font-bold text-brand-plum"
              >
                انتهى الوقت. نحسب النتيجة…
              </p>
            )}
            <p className="text-base font-semibold text-brand-slate">
              السؤال{" "}
              <span className="akwaan-numeral">
                {Math.min(itemIndex + 1, itemCount)}
              </span>{" "}
              من <span className="akwaan-numeral">{itemCount}</span>
            </p>
          </div>
        </main>
      </div>

      {activePlayer && phase === "presenting" && !resolvingExpiration && (
        <p className="text-[17px] font-semibold text-brand-slate">
          {activePlayer} يجاوب من جواله…
        </p>
      )}

      <div className="flex flex-col gap-6">
        {(canSubmit || canSkip) &&
          phase === "presenting" &&
          !resolvingExpiration &&
          snapshot?.status === "active" && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3 rounded-[18px] bg-brand-lavender p-4 text-center">
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
                    className="inline-flex items-center gap-2 font-medium text-foreground"
                    role="status"
                  >
                    <span className="size-3 animate-pulse rounded-full bg-destructive" />
                    {VOICE_MESSAGES.listening}
                  </span>
                )}
                {voice.transcript && (
                  <p className="text-lg font-semibold" aria-live="polite">
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
                    {voiceMessage(voice.state, sending)}
                  </p>
                )}
              </div>
              <form
                onSubmit={submit}
                className="flex flex-col gap-3 sm:flex-row"
              >
                <Input
                  ref={answerInputRef}
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  placeholder="اكتب إجابتك"
                  aria-label="إجابة القنبلة"
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
                  إرسال
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!canSkip || connection !== "connected"}
                  onClick={skip}
                >
                  <SkipForward className="size-4" aria-hidden />
                  تخطّي (-5 ثوان)
                </Button>
              </form>
            </div>
          )}
      </div>
    </section>
  );
}

/** The other side's remaining seconds, for the holder's own phone. */
function OpponentSeconds({ teamId }: { teamId: string }) {
  const clock = useTeamClockDisplay(teamId);
  return (
    <span className="akwaan-numeral">
      {countdownSeconds(clock.remainingMs)}
    </span>
  );
}

function readBombHolders(modeState: unknown): Record<string, string> {
  const raw = (modeState as { holderSetupJson?: unknown } | undefined)
    ?.holderSetupJson;
  if (typeof raw !== "string") return {};
  try {
    const parsed = JSON.parse(raw) as {
      teams?: Array<{ teamId?: string; holderParticipantId?: string | null }>;
    };
    return Object.fromEntries(
      (parsed.teams ?? [])
        .filter((team) => team.teamId && team.holderParticipantId)
        .map((team) => [team.teamId!, team.holderParticipantId!]),
    );
  } catch {
    return {};
  }
}

/**
 * One side of the Bomb: the player, their team, and that team's own clock.
 *
 * Each team's clock runs only while it holds the bomb and never resets, so both
 * are on the wall the whole time: the holder's in gold and moving, the other
 * side's white and standing still.
 */
function BombSide({
  teamId,
  teamName,
  dotClass,
  playerName,
  holding,
  className,
}: {
  teamId: string;
  teamName: string;
  dotClass: string;
  playerName?: string;
  holding: boolean;
  className?: string;
}) {
  const clock = useTeamClockDisplay(teamId);
  const seconds = countdownSeconds(clock.remainingMs);
  return (
    <div
      data-testid={`bomb-side-${teamId}`}
      data-holding={holding ? "true" : "false"}
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-[28px] border-[3px] border-[hsl(var(--brand-navy))] px-[18px] py-[22px]",
        holding
          ? "bg-[#FFFBF0] shadow-[7px_8px_0_hsl(var(--brand-navy))]"
          : "bg-brand-paper",
        className,
      )}
    >
      <svg aria-hidden viewBox="0 0 40 40" className="size-[84px] shrink-0">
        <circle
          cx="20"
          cy="20"
          r="16"
          fill={holding ? "hsl(var(--brand-gold))" : "#F1DCEC"}
          stroke="hsl(var(--brand-navy))"
          strokeWidth="3.5"
        />
        <ellipse
          cx="15"
          cy="18.5"
          rx="2.3"
          ry="3.4"
          fill="hsl(var(--brand-navy))"
        />
        <ellipse
          cx="25"
          cy="18.5"
          rx="2.3"
          ry="3.4"
          fill="hsl(var(--brand-navy))"
        />
        <path
          d="M16 25.5 Q20 28.5 24 25.5"
          fill="none"
          stroke="hsl(var(--brand-navy))"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
      {playerName && (
        <span className="font-display text-3xl font-black [overflow-wrap:anywhere]">
          {playerName}
        </span>
      )}
      <span
        className={cn(
          "inline-flex items-center gap-2 font-bold",
          playerName ? "text-[17px]" : "font-display text-2xl font-extrabold",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "size-3.5 flex-none rounded-full border-2 border-[hsl(var(--brand-navy))]",
            dotClass,
          )}
        />
        {teamName}
      </span>
      <div
        role="timer"
        data-testid={`bomb-team-clock-${teamId}`}
        aria-label={`ساعة ${teamName}: ${seconds} ثانية`}
        className={cn(
          "flex flex-col items-center rounded-[20px] border-[3px] border-[hsl(var(--brand-navy))] px-[22px] py-2",
          holding
            ? "bg-[hsl(var(--brand-gold))] shadow-[4px_5px_0_hsl(var(--brand-navy))]"
            : "bg-white",
        )}
      >
        <span
          dir="ltr"
          className="akwaan-numeral text-[54px] font-bold leading-[1.1]"
        >
          {seconds}
        </span>
        <span className="text-sm font-bold">
          {holding ? "ساعته تمشي" : "ساعته واقفة"}
        </span>
      </div>
      {holding ? (
        <span className="inline-flex min-h-10 -rotate-3 items-center rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))] px-[18px] text-lg font-extrabold">
          القنبلة عنده
        </span>
      ) : (
        <span className="inline-flex min-h-10 items-center rounded-full border-2 border-dashed border-brand-dash bg-white px-[18px] text-[17px] font-semibold text-brand-plum">
          ينتظر دوره
        </span>
      )}
    </div>
  );
}

/** The bomb itself, with the holder's remaining time as a ring on its face. */
function BombGraphic({
  urgency,
  className,
}: {
  urgency: "calm" | "warning" | "critical" | "expired";
  className?: string;
}) {
  const hot = urgency === "critical" || urgency === "expired";
  return (
    <svg aria-hidden viewBox="0 0 120 120" className={className}>
      <path
        d="M74 26 Q84 10 98 14"
        fill="none"
        stroke="hsl(var(--brand-navy))"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path
        d="M0 -10 Q1.8 -1.8 10 0 Q1.8 1.8 0 10 Q-1.8 1.8 -10 0 Q-1.8 -1.8 0 -10Z"
        transform="translate(102 13) scale(1.3)"
        fill={hot ? "hsl(var(--sem-error))" : "hsl(var(--brand-gold))"}
        stroke="hsl(var(--brand-navy))"
        strokeWidth="2"
      />
      <rect
        x="56"
        y="20"
        width="24"
        height="16"
        rx="5"
        fill="hsl(var(--brand-navy))"
      />
      <circle cx="62" cy="72" r="44" fill="hsl(var(--brand-navy))" />
      <circle
        cx="62"
        cy="72"
        r="35"
        fill="none"
        stroke={hot ? "hsl(var(--sem-error))" : "hsl(var(--brand-gold))"}
        strokeWidth="5"
        strokeDasharray="150 220"
        strokeLinecap="round"
        transform="rotate(-90 62 72)"
      />
    </svg>
  );
}

