"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Mic, Square } from "lucide-react";

import { BidiText } from "@/components/akwaan/bidi-text";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChallengeCountdown } from "../match/components/challenge-countdown";
import { useInteractionDeadline } from "../hooks/use-interaction-deadline";
import { useLiveSession } from "../hooks/live-session-context";
import {
  MARHALA_DIFFICULTY_LABEL,
  MARHALA_FINISH_POSITION,
  marhalaBandPreviews,
  marhalaPositionOf,
  marhalaPromptText,
  readMarhalaView,
  type MarhalaBandRisk,
  type MarhalaDifficulty,
  type MarhalaTurn,
  type MarhalaView,
} from "../match/marhala.presentation";
import { MarhalaQuestionAudio, MarhalaQuestionImage } from "./marhala-screen";
import { useVoiceInput } from "../hooks/use-voice-input";
import { voiceInputPolicy } from "../hooks/voice-eligibility";
import { MarhalaAnswerReveal } from "../match/components/marhala-answer-reveal";
import { MarhalaDie } from "../match/components/marhala-movement-roll";
import {
  useMarhalaTurnReplay,
  usePrefersReducedMotion,
} from "../hooks/use-marhala-turn-replay";
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
  const { gameplayCommand, connection, snapshot } = useLiveSession();
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
  // The same replay sequencer the shared screen runs, for its first beat only.
  // The phone draws no board, but reusing the one sequencer keeps both surfaces
  // on the same clock without inventing a second scheduler.
  const reducedMotion = usePrefersReducedMotion();
  const replay = useMarhalaTurnReplay({
    positions: view.positions,
    ...(view.lastTurn ? { lastTurn: view.lastTurn } : {}),
    reducedMotion,
  });
  const revealing = Boolean(replay.phase === "answer" && view.lastTurn);
  const live = connection === "connected";
  const can = (action: string) =>
    runtime.availableActions.includes(`mode:${action}`);
  // Three gates, all the server's: the action must be offered to this actor at
  // all, the server must consider this actor's team the one playing, and this
  // phone must be the one holding the turn — the lobby captain, or whoever the
  // rotation reached. A teammate is not shown dead buttons; they coach.
  const holdsTurn = view.isActiveTeam && view.isAssignedActor;
  const mayChoose = can("choose-marhala-difficulty") && holdsTurn;
  const mayAnswer = can("submit-marhala-answer") && holdsTurn;
  const coaching = view.isActiveTeam && !view.isAssignedActor;
  const holderName =
    snapshot?.participants.find(
      (participant) => participant.id === view.assignedParticipantId,
    )?.displayName ?? "زميلكم";

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
      payload: {
        ...payload,
        // Proves this phone still holds the turn it was handed: a phone the
        // turn moved away from during a disconnect is refused, not obeyed.
        ...(view.ownAssignmentSequence !== undefined
          ? { assignmentSequence: view.ownAssignmentSequence }
          : {}),
      },
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

  const ownPosition = marhalaPositionOf(view, view.actorTeamId ?? "");
  const teamNameOf = (id: string) =>
    snapshot?.teams.find((team) => team.id === id)?.name ?? "الفريق الآخر";
  // The die and the move, once the answer beat has passed: the same committed
  // turn the shared screen is walking, told to this phone in its own words.
  const rolled =
    !revealing && replay.replaying && view.lastTurn?.correct
      ? view.lastTurn
      : undefined;
  const calm = !revealing && !rolled && !waitingForNext;

  return (
    <section
      dir="rtl"
      data-testid="marhala-phone"
      data-marhala-phase={view.phase}
      className={cn(
        "flex min-h-0 w-full flex-1 flex-col gap-3.5 rounded-[22px] bg-brand-paper p-4",
        STICKER,
      )}
    >
      {revealing && view.lastTurn && (
        <MarhalaAnswerReveal
          compact
          turn={view.lastTurn}
          teamName={(id) =>
            id === view.actorTeamId ? "فريقكم" : "الفريق الآخر"
          }
        />
      )}

      {rolled && (
        <RollCard
          turn={rolled}
          own={rolled.teamId === view.actorTeamId}
          rolling={replay.phase === "reveal"}
          nextTeamName={
            view.phase === "completed"
              ? undefined
              : view.activeTeamId === view.actorTeamId
                ? "لكم"
                : `ل${teamNameOf(view.activeTeamId)}`
          }
        />
      )}

      {!revealing && !rolled && waitingForNext && (
        <div
          className="flex items-center justify-center gap-2 rounded-[14px] border-2 border-[hsl(var(--brand-navy))] bg-brand-lavender p-4"
          data-testid="marhala-phone-next-question"
          role="status"
          aria-live="polite"
        >
          <span
            aria-hidden
            className="size-2 animate-pulse rounded-full bg-[hsl(var(--brand-gold))] motion-reduce:animate-none"
          />
          <p className="text-sm font-bold text-brand-slate">
            السؤال الجاي بعد لحظة…
          </p>
        </div>
      )}

      {calm && view.phase !== "completed" && view.actorTeamId && (
        <p
          data-testid="marhala-phone-position"
          className="flex items-center justify-between gap-2 rounded-[14px] border-2 border-[hsl(var(--brand-navy))] bg-brand-lavender px-3.5 py-2.5 text-sm font-bold text-[hsl(var(--brand-navy))]"
        >
          <span>
            أنتم في المحطة <span className="akwaan-numeral">{ownPosition}</span>
          </span>
          <span className="font-semibold text-brand-slate">
            باقي{" "}
            <span className="akwaan-numeral">
              {Math.max(MARHALA_FINISH_POSITION - ownPosition, 0)}
            </span>{" "}
            للنهاية
          </span>
        </p>
      )}

      {calm &&
        view.phase === "difficulty-choice" &&
        (mayChoose ? (
          <BandChoices
            view={view}
            onChoose={choose}
            disabled={!live || Boolean(sending)}
          />
        ) : coaching ? (
          <div
            data-testid="marhala-phone-coaching"
            role="status"
            className="flex min-h-0 flex-1 flex-col gap-3.5"
          >
            <BandChoices view={view} readOnly holderName={holderName} />
          </div>
        ) : (
          <WaitingCard
            title="دور الفريق الآخر"
            body="شوفوا الشاشة، يختارون مستوى سؤالهم الحين."
          />
        ))}

      {calm && view.phase === "question-pending" && (
        <div
          className="flex items-center justify-center gap-2 rounded-[14px] border-2 border-[hsl(var(--brand-navy))] bg-brand-lavender p-4"
          data-testid="marhala-phone-pending"
          role="status"
        >
          <Loader2
            className="size-4 animate-spin text-[hsl(var(--brand-navy))]"
            aria-hidden
          />
          <p className="text-sm font-bold text-[hsl(var(--brand-navy))]">
            نجهّز السؤال…
          </p>
        </div>
      )}

      {calm &&
        view.phase === "question" &&
        (mayAnswer ? (
          sending === "answer" ? (
            <div
              className="flex flex-1 flex-col items-center justify-center gap-2 text-center"
              data-testid="marhala-phone-submitted"
            >
              <span
                aria-hidden
                className="grid size-14 place-items-center rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))]"
              >
                <Check className="size-7 text-[hsl(var(--brand-navy))]" />
              </span>
              <p className="font-display text-lg font-extrabold text-[hsl(var(--brand-navy))]">
                وصلت إجابتكم
              </p>
              <p className="text-sm font-semibold text-brand-slate">
                عيونكم على الشاشة.
              </p>
            </div>
          ) : (
            <form
              onSubmit={submit}
              className="flex min-h-0 flex-1 flex-col gap-3.5"
              data-testid="marhala-answer-form"
            >
              <QuestionHead view={view} remainingMs={remainingMs} />
              {/* The media stays on the phone, against the usual "spectacle lives
              on the shared screen" rule, because for المرحلة it is not
              spectacle: an image question reads "من هذه الشخصية؟", so the
              picture *is* the question and the person typing cannot answer
              without it. Sized for a controller, not for the room. */}
              {view.media?.type === "image" && view.media.url && (
                <MarhalaQuestionImage
                  url={view.media.url}
                  altText={view.media.altText}
                />
              )}
              {view.media?.type === "audio" && view.media.url && (
                <MarhalaQuestionAudio url={view.media.url} />
              )}
              <p className="text-center font-display text-xl font-extrabold leading-relaxed text-[hsl(var(--brand-navy))]">
                <BidiText>{marhalaPromptText(view)}</BidiText>
              </p>
              <MobileActionArea className="gap-3">
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="marhala-answer"
                    className="text-[15px] font-bold text-[hsl(var(--brand-navy))]"
                  >
                    إجابتكم
                  </label>
                  <input
                    id="marhala-answer"
                    ref={answerInput}
                    type="text"
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    aria-label="الإجابة"
                    autoComplete="off"
                    className="min-h-[60px] rounded-2xl border-[3px] border-[hsl(var(--brand-navy))] bg-white px-4 text-center text-xl font-bold text-[hsl(var(--brand-navy))] outline-none focus-visible:border-[hsl(var(--brand-gold))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-navy))]"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={!answer.trim() || !live || Boolean(sending)}
                    className={cn(GOLD_ACTION, "flex-1")}
                    data-testid="marhala-answer-submit"
                  >
                    إرسال الإجابة
                  </button>
                  {/* Secondary, exactly as in القنبلة: typing is the primary path
                  and stays usable whatever the microphone is doing. */}
                  {voiceAllowed && voice.state !== "unsupported" && (
                    <Button
                      type="button"
                      variant={
                        voice.state === "listening" ? "destructive" : "outline"
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
                      className="size-[62px] shrink-0 rounded-full border-[3px] border-[hsl(var(--brand-navy))]"
                    >
                      {voice.state === "listening" ? (
                        <Square className="size-5 fill-current" aria-hidden />
                      ) : voice.state === "processing" ? (
                        <Loader2 className="size-5 animate-spin" aria-hidden />
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
                    className="text-center text-xs font-bold text-brand-slate"
                  >
                    {VOICE_NOTE[voice.state]}
                  </p>
                )}
              </MobileActionArea>
            </form>
          )
        ) : coaching ? (
          <div
            data-testid="marhala-phone-coaching"
            role="status"
            className="flex min-h-0 flex-1 flex-col gap-3.5"
          >
            <QuestionHead view={view} remainingMs={remainingMs} />
            <p className="text-center font-display text-xl font-extrabold leading-relaxed text-[hsl(var(--brand-navy))]">
              <BidiText>{marhalaPromptText(view)}</BidiText>
            </p>
            <DecidesLine holderName={holderName} className="mt-auto" />
          </div>
        ) : (
          <WaitingCard
            title="الفريق الآخر يجيب"
            body="لا تتدخلون، دوركم بعد هالسؤال."
          />
        ))}

      {calm && view.phase === "completed" && (
        <WaitingCard title="انتهى السباق" body="النتيجة على الشاشة." />
      )}
    </section>
  );
}

const STICKER =
  "border-[3px] border-[hsl(var(--brand-navy))] shadow-[5px_6px_0_hsl(var(--brand-navy))]";

/** The one gold action a phone screen ends on. */
const GOLD_ACTION =
  "min-h-[62px] rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))] px-6 font-display text-xl font-extrabold text-[hsl(var(--brand-navy))] shadow-[4px_5px_0_hsl(var(--brand-navy))] transition-transform duration-fast active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_3px_0_hsl(var(--brand-navy))] disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none";

/** Who decides for the team this turn — the captain, or the rotation's pick. */
function DecidesLine({
  holderName,
  className,
}: {
  holderName: string;
  className?: string;
}) {
  return (
    <p
      data-testid="marhala-phone-decides"
      className={cn(
        "rounded-[14px] border-2 border-dashed border-brand-dash bg-brand-lavender px-3.5 py-3 text-center text-[15px] font-bold text-brand-plum",
        className,
      )}
    >
      القرار عند <BidiText>{holderName}</BidiText>
    </p>
  );
}

/** Which band the question came from, the die it buys, and the clock. */
function QuestionHead({
  view,
  remainingMs,
}: {
  view: MarhalaView;
  remainingMs: number | undefined;
}) {
  const band = view.selectedDifficulty;
  const range = band ? view.movementRanges[band] : undefined;
  return (
    <div className="flex items-center justify-between gap-2.5">
      <div className="flex flex-col gap-1.5">
        {band && (
          <span className="font-display text-lg font-extrabold text-[hsl(var(--brand-navy))]">
            سؤال {MARHALA_DIFFICULTY_LABEL[band]}
          </span>
        )}
        {range && (
          <span className="inline-flex min-h-[28px] items-center gap-1.5 self-start rounded-full border-2 border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))] px-3 text-[13px] font-bold text-[hsl(var(--brand-navy))]">
            النرد
            <span dir="ltr" className="akwaan-numeral">
              {range.min} – {range.max}
            </span>
          </span>
        )}
      </div>
      {remainingMs !== undefined && (
        <ChallengeCountdown remainingMs={remainingMs} />
      )}
    </div>
  );
}

/**
 * The three bands as large cards, each with the die it buys.
 *
 * A tap selects and the gold button commits, so a thumb that lands on the wrong
 * card costs nothing. A band the server has no unseen content for is rendered as
 * a disabled, labelled card rather than removed: the player who was about to
 * press صعب needs to know why it is gone. A teammate gets the same cards with
 * nothing to press, and a line naming who decides.
 */
function BandChoices({
  view,
  onChoose,
  disabled = false,
  readOnly = false,
  holderName,
}: {
  view: MarhalaView;
  onChoose?: (difficulty: MarhalaDifficulty) => void;
  disabled?: boolean;
  readOnly?: boolean;
  holderName?: string;
}) {
  const [picked, setPicked] = useState<MarhalaDifficulty | undefined>();
  const bands = marhalaBandPreviews(view);
  // A pick the server has since run out of content for is not a pick.
  const chosen = bands.find(
    (band) => band.difficulty === picked && band.available,
  )?.difficulty;
  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-3.5"
      data-testid="marhala-band-choices"
    >
      <h1 className="text-center font-display text-2xl font-black text-[hsl(var(--brand-navy))]">
        اختاروا مستوى السؤال
      </h1>
      <div className="flex flex-col gap-2.5">
        {bands.map((band) => {
          const selected = chosen === band.difficulty;
          // A teammate reads the same cards; they are not dead buttons.
          const Card = readOnly ? "div" : "button";
          return (
            <Card
              key={band.difficulty}
              {...(readOnly
                ? { "data-testid": `marhala-band-view-${band.difficulty}` }
                : {
                    type: "button" as const,
                    disabled: !band.available || disabled,
                    "aria-pressed": selected,
                    onClick: () => setPicked(band.difficulty),
                    "data-testid": `marhala-choose-${band.difficulty}`,
                  })}
              data-band-available={band.available ? "true" : "false"}
              className={cn(
                "flex min-h-[88px] w-full items-center justify-between gap-3 rounded-[18px] border-[3px] px-4 text-start text-[hsl(var(--brand-navy))] transition-colors duration-fast ease-akwaan",
                !band.available
                  ? "border-dashed border-brand-dash bg-brand-wash text-brand-slate"
                  : selected
                    ? "border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))] shadow-[3px_4px_0_hsl(var(--brand-navy))]"
                    : "border-[hsl(var(--brand-navy))] bg-white",
              )}
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-display text-[22px] font-extrabold">
                  {MARHALA_DIFFICULTY_LABEL[band.difficulty]}
                </span>
                {/* The band's risk, never the stations it could reach: the
                    deciding phone must not hold information the room has just
                    been denied, or the uncertainty the choice is built on only
                    moves into someone's hand. */}
                {band.available ? (
                  <span
                    data-testid={`marhala-phone-risk-${band.difficulty}`}
                    data-band-risk={band.risk}
                    className="text-[13px] leading-snug"
                  >
                    {PHONE_BAND_RISK[band.risk]}
                  </span>
                ) : (
                  <span className="text-[13px] font-bold">لا أسئلة جديدة</span>
                )}
              </span>
              <span className="flex flex-none flex-col items-center gap-0.5">
                <span className="text-xs font-semibold">النرد</span>
                <span dir="ltr" className="akwaan-numeral text-2xl font-bold">
                  {band.range.min} – {band.range.max}
                </span>
              </span>
            </Card>
          );
        })}
      </div>
      <p className="text-center text-[13px] leading-relaxed text-brand-slate">
        لو جاوبتوا غلط ما ترمون النرد والدور يروح.
      </p>
      {readOnly ? (
        <DecidesLine holderName={holderName ?? "زميلكم"} className="mt-auto" />
      ) : (
        <button
          type="button"
          disabled={!chosen || disabled}
          onClick={() => chosen && onChoose?.(chosen)}
          data-testid="marhala-confirm-difficulty"
          className={cn(GOLD_ACTION, "mt-auto")}
        >
          هات السؤال
        </button>
      )}
    </div>
  );
}

/**
 * The die and the move it bought, on the phone.
 *
 * Read off the committed turn and nothing else: the value is the server's, and
 * so are the station the team landed on and the one it ended on.
 */
function RollCard({
  turn,
  own,
  rolling,
  nextTeamName,
}: {
  turn: MarhalaTurn;
  own: boolean;
  /** The room is still on the roll beat: the face is not shown before it lands. */
  rolling: boolean;
  /** «لكم» or «للفريق الأول», already carrying its preposition. */
  nextTeamName?: string;
}) {
  // No reel on a phone: it shows the server's number once the room has seen it
  // land, and holds no values of its own to cycle through.
  const value = turn.movement;
  const settled = !rolling;
  const base = turn.baseLanding;
  const final = turn.finalLanding ?? base;
  // A turn that reached the finish records its landing clamped to 16, so the
  // starting station cannot be worked back from it and is simply not drawn.
  const from =
    base !== undefined &&
    turn.movement !== undefined &&
    base < MARHALA_FINISH_POSITION
      ? base - turn.movement
      : undefined;
  const moved = final !== undefined && base !== undefined && final !== base;
  const left =
    final === undefined ? 0 : Math.max(MARHALA_FINISH_POSITION - final, 0);
  const you = own ? "تو" : "وا";
  const headline =
    turn.tile === "boost"
      ? `وقف${you} على قفزة!`
      : turn.tile === "trap"
        ? `وقف${you} على فخ!`
        : final === MARHALA_FINISH_POSITION
          ? `وصل${you} النهاية!`
          : `وقف${you} على المحطة ${final ?? ""}`;
  const detail =
    turn.tile === "boost" && moved
      ? `السلم رفع${own ? "كم" : "هم"} من ${base} إلى ${final}.`
      : turn.tile === "trap" && moved
        ? `الزحليقة نزّلت${own ? "كم" : "هم"} من ${base} إلى نقطة الحفظ ${final}.`
        : "";
  const remaining =
    left === 0
      ? ""
      : left === 1
        ? `باقي ل${own ? "كم" : "هم"} محطة وحدة.`
        : `باقي ل${own ? "كم" : "هم"} ${left} للنهاية.`;
  if (value === undefined) return null;
  return (
    <div
      data-testid="marhala-phone-roll"
      data-roll-value={turn.movement}
      className="flex min-h-0 flex-1 flex-col gap-3.5"
      role="status"
    >
      <span className="inline-flex min-h-[32px] -rotate-3 items-center self-center rounded-[10px] border-[3px] border-brand-navy bg-sem-success px-3 text-sm font-extrabold text-foreground">
        {own ? "جاوبتوا صح" : "جاوبوا صح"}
      </span>
      <div className="flex flex-col items-center gap-[18px] pt-1.5">
        {settled ? (
          <MarhalaDie value={value} />
        ) : (
          <span
            aria-hidden
            className="grid size-[120px] -rotate-[8deg] animate-pulse place-items-center rounded-[26px] border-4 border-[hsl(var(--brand-navy))] bg-white font-display text-5xl font-black text-[hsl(var(--brand-navy))] shadow-[6px_7px_0_hsl(var(--brand-navy))] motion-reduce:animate-none"
          >
            ؟
          </span>
        )}
        <h1 className="text-center font-display text-3xl font-black text-[hsl(var(--brand-navy))]">
          {settled ? (
            <>
              طلع {own ? "لكم" : "لهم"}{" "}
              <span className="akwaan-numeral">{value}</span>
            </>
          ) : (
            "النرد يدور…"
          )}
        </h1>
      </div>
      {settled && base !== undefined && (
        <>
          <div
            dir="ltr"
            data-testid="marhala-phone-move"
            aria-label={`${from !== undefined ? `من المحطة ${from} ` : ""}إلى المحطة ${base}${moved ? ` ثم إلى ${final}` : ""}`}
            className="flex items-center gap-1 self-stretch"
          >
            {from !== undefined && (
              <>
                <span className="akwaan-numeral inline-flex size-10 flex-none items-center justify-center rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-white text-[15px] font-bold text-[hsl(var(--brand-navy))]">
                  {from}
                </span>
                <span
                  aria-hidden
                  className="h-2 flex-1 rounded-full border-2 border-[hsl(var(--brand-navy))] bg-[#E3DAF6]"
                />
              </>
            )}
            <span
              className={cn(
                "akwaan-numeral inline-flex size-[52px] flex-none items-center justify-center rounded-full border-[3px] border-[hsl(var(--brand-navy))] text-lg font-bold",
                turn.tile === "boost"
                  ? "bg-[hsl(var(--brand-purple))] text-white"
                  : turn.tile === "trap"
                    ? "bg-[#2E2860] text-white"
                    : "bg-[hsl(var(--brand-gold))] text-[hsl(var(--brand-navy))]",
              )}
            >
              {base}
            </span>
            {moved && (
              <>
                <span
                  aria-hidden
                  className={cn(
                    "h-3 flex-1 rounded-full border-2 border-[hsl(var(--brand-navy))]",
                    turn.tile === "boost"
                      ? "bg-[hsl(var(--brand-purple))]"
                      : "bg-[#2E2860]",
                  )}
                />
                <span className="akwaan-numeral inline-flex size-[52px] flex-none items-center justify-center rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))] text-lg font-bold text-[hsl(var(--brand-navy))]">
                  {final}
                </span>
              </>
            )}
          </div>
          <div className="flex flex-col gap-0.5 rounded-[14px] border-2 border-[hsl(var(--brand-navy))] bg-brand-lavender px-3.5 py-3 text-center">
            <span className="font-display text-lg font-extrabold text-[hsl(var(--brand-navy))]">
              {headline}
            </span>
            {(detail || remaining) && (
              <span className="text-sm leading-relaxed text-brand-slate">
                {[detail, remaining].filter(Boolean).join(" ")}
              </span>
            )}
          </div>
        </>
      )}
      {nextTeamName && (
        <p className="mt-auto text-center text-[15px] font-semibold text-brand-slate">
          الدور الحين {nextTeamName}…
        </p>
      )}
    </div>
  );
}

/**
 * One short line per speech state, never a blocking explanation.
 * `idle`, `recognized` and `unsupported` say nothing at all: the first two need
 * no words, and an unsupported browser simply has no microphone button.
 */
const VOICE_NOTE: Partial<Record<string, string>> = {
  listening: "نسمعكم…",
  processing: "لحظة، نفهم اللي قلتوه…",
  "no-speech": "ما سمعنا شي، جربوا مرة ثانية أو اكتبوها.",
  "permission-denied": "المايك مقفل، اكتبوا الإجابة.",
  error: "ما قدرنا نسمع، اكتبوا الإجابة.",
};

/** The same three words the shared screen uses, so the room and the hand agree. */
const PHONE_BAND_RISK: Record<MarhalaBandRisk, string> = {
  steady: "مضمون، بس خطوتكم قصيرة",
  balanced: "بين وبين",
  bold: "مخاطرة، وخطوتكم كبيرة",
};

function WaitingCard({ title, body }: { title: string; body: string }) {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-1.5 text-center"
      data-testid="marhala-phone-waiting"
      role="status"
    >
      <p className="font-display text-xl font-extrabold text-[hsl(var(--brand-navy))]">
        {title}
      </p>
      <p className="text-sm font-semibold leading-relaxed text-brand-slate">
        {body}
      </p>
    </div>
  );
}
