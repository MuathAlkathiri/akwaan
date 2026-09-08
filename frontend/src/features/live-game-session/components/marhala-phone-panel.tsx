"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Mic, Send, Square } from "lucide-react";

import { BidiText } from "@/components/akwaan/bidi-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ChallengeCountdown } from "../match/components/challenge-countdown";
import { useInteractionDeadline } from "../hooks/use-interaction-deadline";
import { useLiveSession } from "../hooks/live-session-context";
import {
  MARHALA_DIFFICULTY_LABEL,
  marhalaBandPreviews,
  marhalaPositionOf,
  marhalaPromptText,
  readMarhalaView,
  type MarhalaBandRisk,
  type MarhalaDifficulty,
  type MarhalaView,
} from "../match/marhala.presentation";
import { MarhalaQuestionAudio, MarhalaQuestionImage } from "./marhala-screen";
import { useVoiceInput } from "../hooks/use-voice-input";
import { voiceInputPolicy } from "../hooks/voice-eligibility";
import { ChallengeFrame } from "../match/components/challenge-frame";
import { useWaitingForNextQuestion } from "../hooks/use-recurring-question-transition";
import { MobileActionArea } from "../match/components/mobile-action-area";
import type { GameplayRuntimeSnapshot } from "../model";

/**
 * "المرحلة" on a player's phone — an input surface, not a small board.
 *
 * The board is on the shared screen and the room is looking at it; a phone that
 * tried to redraw sixteen tiles would compete with it and lose. So a phone shows
 * exactly what its holder must decide or type, plus the one number they need — the
 * tile they are standing on.
 *
 * Authorization is the server's. Every control here exists only when the actor's
 * own `availableActions` contains the command, which is a projection of what the
 * runtime would actually accept from this actor — the opposing team is not merely
 * shown disabled buttons, it is sent none.
 */
export function MarhalaPhonePanel({
  runtime,
}: {
  runtime: GameplayRuntimeSnapshot;
}) {
  const { gameplayCommand, connection } = useLiveSession();
  const [answer, setAnswer] = useState("");
  // Presentational only, as in every other controller: `gameplayCommand` is
  // fire-and-forget, so this closes the double-tap window. It is released by the
  // authoritative turn/phase moving on — the runtime publishes no "submitted"
  // field, so none is invented here.
  const [sending, setSending] = useState<"choice" | "answer" | undefined>();
  const answerInput = useRef<HTMLInputElement>(null);
  const view = useMemo(
    () => readMarhalaView(runtime.modeState),
    [runtime.modeState],
  );
  const round = runtime.activeRound;
  const remainingMs = useInteractionDeadline(
    view.deadlineAt,
    view.phase === "completed",
  );
  // The shell, the header and the team identity all stay; only this region is
  // between two questions, and nothing answerable may survive into it.
  const waitingForNext = useWaitingForNextQuestion();
  const live = connection === "connected";
  const can = (action: string) =>
    runtime.availableActions.includes(`mode:${action}`);
  // Two independent gates, both the server's: the action must be offered to this
  // actor at all, and the server must consider this actor's team the one playing.
  const mayChoose = can("choose-marhala-difficulty") && view.isActiveTeam;
  const mayAnswer = can("submit-marhala-answer") && view.isActiveTeam;

  // A typed answer — and a pending guard — must never survive into the next
  // question. Any authoritative move releases both.
  useEffect(() => {
    setAnswer("");
    setSending(undefined);
  }, [runtime.runtimeId, round?.id, view.turnNumber, view.phase]);
  useEffect(() => {
    if (mayAnswer && view.phase === "question") answerInput.current?.focus();
  }, [mayAnswer, view.phase, view.turnNumber]);

  // Speech fills the field and stops there: المرحلة is `transcript`, never
  // `auto-submit`. The player reads what was heard and presses the same button
  // they would have pressed after typing.
  // Eligibility is declared per mechanic, never inferred from the input type.
  const voiceAllowed = voiceInputPolicy(runtime.mode.key) === "transcript";
  const voice = useVoiceInput({
    enabled: voiceAllowed && mayAnswer && view.phase === "question" && !sending,
    connection,
    lifecycleKey: `${runtime.runtimeId}:${round?.id ?? ""}:${view.turnNumber}:${view.phase}`,
    onFinalTranscript: (text) => {
      // Replaces rather than appends: concatenating speech onto half-typed text
      // produces something the player did not intend and cannot easily undo.
      setAnswer(text);
      answerInput.current?.focus();
    },
  });

  const send = (
    commandType: string,
    payload: Record<string, string | number | boolean | null> = {},
  ) =>
    gameplayCommand("gameplay-command", {
      roundId: round?.id,
      commandType,
      payload,
    });

  const choose = (difficulty: MarhalaDifficulty) => {
    if (!live || sending) return;
    setSending("choice");
    send("choose-marhala-difficulty", { difficulty });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!answer.trim() || !live || !mayAnswer || sending) return;
    setSending("answer");
    send("submit-marhala-answer", { answer: answer.trim() });
    setAnswer("");
  };

  return (
    <ChallengeFrame
      compact
      title={`مربّعكم الحالي ${marhalaPositionOf(view, view.actorTeamId ?? "")}`}
      aside={
        !waitingForNext &&
        remainingMs !== undefined &&
        view.phase === "question" ? (
          <ChallengeCountdown remainingMs={remainingMs} />
        ) : null
      }
      className="flex min-h-0 flex-1 flex-col"
    >
      <section
        dir="rtl"
        data-testid="marhala-phone"
        data-marhala-phase={view.phase}
        className="flex min-h-0 w-full flex-1 flex-col gap-3"
      >
        {waitingForNext && (
          <div
            className="surface-card flex items-center gap-2 p-4"
            data-testid="marhala-phone-next-question"
            role="status"
            aria-live="polite"
          >
            <span
              aria-hidden
              className="size-2 animate-pulse rounded-full bg-brand-gold motion-reduce:animate-none"
            />
            <p className="text-sm font-black text-muted-foreground">
              السؤال التالي بعد لحظة…
            </p>
          </div>
        )}

        {!waitingForNext &&
          view.phase === "difficulty-choice" &&
          (mayChoose ? (
            <BandChoices view={view} onChoose={choose} disabled={!live} />
          ) : (
            <WaitingCard
              title="دور الفريق الآخر"
              body="شوفوا الشاشة — بيختارون مستوى الخطر الحين."
            />
          ))}

        {!waitingForNext && view.phase === "question-pending" && (
          <div
            className="surface-card flex items-center gap-2 p-4"
            data-testid="marhala-phone-pending"
            role="status"
          >
            <Loader2
              className="size-4 animate-spin text-muted-foreground"
              aria-hidden
            />
            <p className="text-sm font-black text-foreground">
              جارٍ تجهيز السؤال…
            </p>
          </div>
        )}

        {!waitingForNext &&
          view.phase === "question" &&
          (mayAnswer ? (
            sending === "answer" ? (
              <div
                className="flex flex-1 flex-col items-center justify-center gap-2 text-center"
                data-testid="marhala-phone-submitted"
              >
                <span
                  aria-hidden
                  className="grid size-14 place-items-center rounded-full border border-brand-gold/40 bg-brand-gold/10"
                >
                  <Check className="size-7 text-brand-gold" />
                </span>
                <p className="text-base font-black text-foreground">
                  تم إرسال إجابتكم
                </p>
                <p className="text-sm font-bold text-muted-foreground">
                  تابعوا الحركة على الشاشة.
                </p>
              </div>
            ) : (
              <form
                onSubmit={submit}
                className="flex min-h-0 flex-1 flex-col"
                data-testid="marhala-answer-form"
              >
                {/* The media stays on the phone, against the usual "spectacle lives
                on the shared screen" rule, because for المرحلة it is not
                spectacle: an image question reads "من هذه الشخصية؟", so the
                picture *is* the question and the person typing cannot answer
                without it. Sized for a controller, not for the room. */}
                <div className="flex flex-1 flex-col justify-center gap-3">
                  {view.media?.type === "image" && view.media.url && (
                    <MarhalaQuestionImage
                      url={view.media.url}
                      altText={view.media.altText}
                    />
                  )}
                  {view.media?.type === "audio" && view.media.url && (
                    <MarhalaQuestionAudio url={view.media.url} />
                  )}
                  <p className="text-center text-base font-black leading-snug text-foreground">
                    <BidiText>{marhalaPromptText(view)}</BidiText>
                  </p>
                  <Input
                    ref={answerInput}
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    placeholder="اكتب الإجابة"
                    aria-label="الإجابة"
                    autoComplete="off"
                    className="h-16 rounded-[var(--radius)] border-2 text-center text-xl font-black focus-visible:border-brand-gold"
                  />
                </div>
                <MobileActionArea>
                  <div className="flex items-center gap-2">
                    <Button
                      type="submit"
                      size="lg"
                      disabled={!answer.trim() || !live || Boolean(sending)}
                      className="h-14 flex-1 text-base font-black"
                      data-testid="marhala-answer-submit"
                    >
                      <Send className="size-4" aria-hidden />
                      أرسل الإجابة
                    </Button>
                    {/* Secondary, exactly as in القنبلة: typing is the primary path
                    and stays usable whatever the microphone is doing. */}
                    {voiceAllowed && voice.state !== "unsupported" && (
                      <Button
                        type="button"
                        variant={
                          voice.state === "listening"
                            ? "destructive"
                            : "outline"
                        }
                        disabled={
                          !live ||
                          Boolean(sending) ||
                          voice.state === "processing" ||
                          voice.state === "permission-denied"
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
                        data-testid="marhala-voice"
                        className="size-14 shrink-0 rounded-full"
                      >
                        {voice.state === "listening" ? (
                          <Square className="size-5 fill-current" aria-hidden />
                        ) : voice.state === "processing" ? (
                          <Loader2
                            className="size-5 animate-spin"
                            aria-hidden
                          />
                        ) : (
                          <Mic className="size-5" aria-hidden />
                        )}
                      </Button>
                    )}
                  </div>
                  {voiceAllowed && VOICE_NOTE[voice.state] && (
                    <p
                      role="status"
                      data-testid="marhala-voice-state"
                      className="text-center text-xs font-bold text-muted-foreground"
                    >
                      {VOICE_NOTE[voice.state]}
                    </p>
                  )}
                </MobileActionArea>
              </form>
            )
          ) : (
            <WaitingCard
              title="الفريق الآخر يجيب"
              body="لا تتدخّلون — دوركم بعد هذا السؤال."
            />
          ))}

        {!waitingForNext && view.phase === "completed" && (
          <WaitingCard
            title="انتهى السباق"
            body="النتيجة على الشاشة المشتركة."
          />
        )}
      </section>
    </ChallengeFrame>
  );
}

/**
 * The three bands as large tap targets, each with what it could reach.
 *
 * A band the server has no unseen content for is rendered as a disabled, labelled
 * card rather than removed: the player who was about to press صعب needs to know why
 * it is gone. It also cannot be pressed — and if it somehow were, the runtime
 * refuses the choice, which is the guarantee that matters.
 */
function BandChoices({
  view,
  onChoose,
  disabled,
}: {
  view: MarhalaView;
  onChoose: (difficulty: MarhalaDifficulty) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-2" data-testid="marhala-band-choices">
      <p className="px-1 text-sm font-black text-foreground">
        اختاروا مستوى الخطر
      </p>
      {marhalaBandPreviews(view).map((band) => (
        <button
          key={band.difficulty}
          type="button"
          disabled={!band.available || disabled}
          onClick={() => onChoose(band.difficulty)}
          data-testid={`marhala-choose-${band.difficulty}`}
          data-band-available={band.available ? "true" : "false"}
          className={cn(
            "flex w-full items-center justify-between gap-3 rounded-[var(--radius)] border p-4 text-start transition-colors duration-fast ease-akwaan",
            band.available
              ? "border-border bg-card active:bg-muted"
              : "border-dashed border-border bg-muted/40 text-muted-foreground",
          )}
        >
          <span className="min-w-0">
            <span className="block text-lg font-black text-foreground">
              {MARHALA_DIFFICULTY_LABEL[band.difficulty]}
            </span>
            <span className="akwaan-numeral block text-xs font-bold text-muted-foreground">
              {band.range.min}–{band.range.max}
            </span>
          </span>
          {/* The band's risk, never the tiles it could reach: the deciding phone
              must not hold information the room has just been denied, or the
              uncertainty the choice is built on only moves into someone's hand. */}
          {band.available ? (
            <span
              data-testid={`marhala-phone-risk-${band.difficulty}`}
              data-band-risk={band.risk}
              className={cn(
                "shrink-0 text-xs font-black",
                band.risk === "bold"
                  ? "text-brand-gold"
                  : band.risk === "balanced"
                    ? "text-foreground"
                    : "text-muted-foreground",
              )}
            >
              {PHONE_BAND_RISK[band.risk]}
            </span>
          ) : (
            <span className="shrink-0 text-xs font-black">لا أسئلة جديدة</span>
          )}
        </button>
      ))}
    </div>
  );
}

/**
 * One short line per speech state, never a blocking explanation.
 * `idle`, `recognized` and `unsupported` say nothing at all: the first two need
 * no words, and an unsupported browser simply has no microphone button.
 */
const VOICE_NOTE: Partial<Record<string, string>> = {
  listening: "نسمعك…",
  processing: "جارٍ التعرّف…",
  "no-speech": "ما سمعنا شيء — جرّبوا مرة ثانية أو اكتبوا.",
  "permission-denied": "الميكروفون مرفوض — اكتبوا الإجابة.",
  error: "تعذّر الاستماع — اكتبوا الإجابة.",
};

/** The same three words the shared screen uses, so the room and the hand agree. */
const PHONE_BAND_RISK: Record<MarhalaBandRisk, string> = {
  steady: "تقدّم مضمون",
  balanced: "متوازن",
  bold: "مخاطرة عالية",
};

function WaitingCard({ title, body }: { title: string; body: string }) {
  return (
    <div
      className="surface-card space-y-1 p-5 text-center"
      data-testid="marhala-phone-waiting"
      role="status"
    >
      <p className="text-base font-black text-foreground">{title}</p>
      <p className="text-sm font-bold text-muted-foreground">{body}</p>
    </div>
  );
}
