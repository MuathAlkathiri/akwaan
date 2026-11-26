"use client";

import { useEffect, useMemo, useState } from "react";
import { BidiText } from "@/components/akwaan/bidi-text";
import { cn } from "@/lib/utils";
import { teamIdentityOf } from "@/lib/team-identity";
import { AnswerEntry } from "../match/components/answer-entry";
import { ChallengeCountdown } from "../match/components/challenge-countdown";
import {
  ChallengeContextStrip,
  TeamDot,
  useChallengeContext,
} from "../match/components/challenge-context-strip";
import { ChallengeFrame } from "../match/components/challenge-frame";
import { MobileActionArea } from "../match/components/mobile-action-area";
import { ComboAnswerReveal } from "../match/components/combo-answer-reveal";
import { useResolutionReveal } from "../match/use-resolution-reveal";
import {
  type ComboQuestionReveal,
  COMBO_MODE_KEY,
} from "../match/combo.presentation";
import { useMobileSurface } from "../match/components/mobile-gameplay-shell";
import { useInteractionDeadline } from "../hooks/use-interaction-deadline";
import { useLiveSession } from "../hooks/live-session-context";
import type { GameplayRuntimeSnapshot } from "../model";
import {
  COMBO_CHALLENGE_NAME,
  comboIsFinalRun,
  comboProgressValue,
  comboPromptText,
  comboRunNumber,
  comboRunOf,
  comboStreakPoints,
  describeComboRunEnd,
  readComboView,
  type ComboView,
} from "../match/combo.presentation";

type Sending = "answer" | "cash-out" | "continue" | "force" | undefined;

/** «نقطة», «نقطتين», «3 نقاط» — never «2 نقاط». */
function pointsLabel(count: number) {
  if (count === 1) return "نقطة";
  if (count === 2) return "نقطتين";
  if (count >= 3 && count <= 10) return `${count} نقاط`;
  return `${count} نقطة`;
}

const NAVY_BORDER = "border-[3px] border-[hsl(var(--brand-navy))]";
const PILL =
  "inline-flex min-h-[60px] items-center justify-center rounded-full px-7 font-display text-xl font-extrabold transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:shadow-none";
const GOLD_PILL = cn(
  PILL,
  NAVY_BORDER,
  "bg-[hsl(var(--brand-gold))] text-[hsl(var(--brand-navy))] shadow-[4px_5px_0_hsl(var(--brand-navy))]",
);
const NAVY_PILL = cn(
  PILL,
  NAVY_BORDER,
  "bg-[hsl(var(--brand-navy))] text-white shadow-[4px_5px_0_hsl(var(--brand-gold))]",
);
const CHOICE =
  "flex flex-1 flex-col gap-1.5 rounded-3xl border-[3px] border-[hsl(var(--brand-navy))] p-[22px] text-start text-[hsl(var(--brand-navy))]";
const PHONE_CHOICE =
  "flex min-h-[104px] w-full flex-col items-center justify-center gap-1 rounded-[20px] border-[3px] border-[hsl(var(--brand-navy))] px-4 py-3 text-[hsl(var(--brand-navy))] shadow-[4px_5px_0_hsl(var(--brand-navy))] disabled:shadow-none";

/**
 * "الكومبو" — one panel for the shared screen and both teams' phones.
 *
 * Which of the three a viewer gets is not decided here. The server builds a
 * different projection per actor, and this component only renders what its own
 * projection contains: the running team gets `isActiveTeam`, the team still
 * holding a charge gets `canArmComboBreak`, the team that has already armed gets
 * `ownComboBreakArmed`, and the shared screen gets none of them. Nothing about
 * the opponent's armed charge is inferable from what the other side receives.
 */
export function ComboGameplayPanel({
  runtime,
}: {
  runtime: GameplayRuntimeSnapshot;
}) {
  const { snapshot, gameplayCommand, connection } = useLiveSession();
  const context = useChallengeContext();
  const [answer, setAnswer] = useState("");
  const [sending, setSending] = useState<Sending>();
  const round = runtime.activeRound;
  const view = useMemo(
    () => readComboView(runtime.modeState),
    [runtime.modeState],
  );

  const terminal = view.phase === "completed" || view.phase === "run-complete";
  // The consequence the runtime has already entered is held back *visually*
  // until the answer has been read out. Authoritative state is never delayed —
  // only which part of it is on screen, and only for the shared pacing beat.
  const revealing = useResolutionReveal({
    resolvedAt: view.lastQuestionReveal?.resolvedAt ?? null,
    modeKey: COMBO_MODE_KEY,
  });
  const reveal = revealing ? view.lastQuestionReveal : undefined;
  const remainingMs = useInteractionDeadline(
    view.deadlineAt,
    view.phase === "completed",
  );
  const live = connection === "connected";
  const phone = useMobileSurface();
  const can = (action: string) =>
    runtime.availableActions.includes(`mode:${action}`);

  const teams = snapshot?.teams ?? [];
  const teamName = (id: string) =>
    teams.find((team) => team.id === id)?.name ?? "الفريق";
  const dotOf = (id: string) => teamIdentityOf(id, teams).dot;

  // One panel instance serves eight questions across two runs. A typed answer
  // must never survive into the next question, even when the server advances the
  // run without remounting.
  useEffect(() => {
    setAnswer("");
    setSending(undefined);
  }, [
    runtime.runtimeId,
    round?.id,
    view.runIndex,
    view.questionNumber,
    view.phase,
  ]);

  const send = (
    commandType: string,
    payload: Record<string, string | number | boolean | null> = {},
  ) =>
    gameplayCommand("gameplay-command", {
      roundId: round?.id,
      commandType,
      payload: {
        ...payload,
        // The question's holder proves it still holds it. Never on the break,
        // which belongs to the whole opposing team.
        ...(commandType !== "arm-combo-break" &&
        view.ownAssignmentSequence !== undefined
          ? { assignmentSequence: view.ownAssignmentSequence }
          : {}),
      },
    });
  const holderName =
    snapshot?.participants.find(
      (participant) => participant.id === view.assignedParticipantId,
    )?.displayName ?? "زميلكم";

  const submit = () => {
    if (!answer.trim() || !live || sending) return;
    setSending("answer");
    send("submit-combo-answer", { answer: answer.trim() });
    setAnswer("");
  };

  const decide = (decision: "cash-out" | "continue") => {
    if (!live || sending) return;
    setSending(decision);
    send(decision === "cash-out" ? "cash-out-combo" : "continue-combo");
  };

  const force = () => {
    if (!live || sending) return;
    setSending("force");
    send("arm-combo-break");
  };

  if (phone) {
    return (
      <PhoneComboController
        view={view}
        answer={answer}
        setAnswer={setAnswer}
        sending={sending}
        live={live}
        remainingMs={remainingMs}
        can={can}
        teamName={teamName}
        submit={submit}
        decide={decide}
        force={force}
        holderName={holderName}
        {...(reveal ? { reveal } : {})}
      />
    );
  }

  const activeName = teamName(view.activeTeamId);
  const opponentId = view.teamIds.find((id) => id !== view.activeTeamId);
  const breaker = view.breakRevealedByTeamId
    ? teamName(view.breakRevealedByTeamId)
    : "الخصم";

  return (
    <section
      dir="rtl"
      data-testid="combo-stage"
      className="flex flex-col gap-[18px] text-[hsl(var(--brand-navy))]"
    >
      <ChallengeContextStrip
        {...(context.eyebrow ? { eyebrow: context.eyebrow } : {})}
        title={context.title ?? COMBO_CHALLENGE_NAME}
        aside={
          view.phase === "completed" ? null : (
            <span className="inline-flex min-h-11 items-center gap-2.5 whitespace-nowrap rounded-full border-2 border-white bg-[hsl(var(--brand-gold))] px-[18px] text-lg font-extrabold text-[hsl(var(--brand-navy))]">
              <TeamDot className={dotOf(view.activeTeamId)} />
              جولة {activeName}
            </span>
          )
        }
      />

      <div
        className={cn(
          "grid gap-6",
          !terminal && "lg:grid-cols-[minmax(0,1fr)_360px]",
        )}
      >
        {reveal ? (
          <main
            className={cn(
              "flex min-h-[420px] flex-col justify-center rounded-[28px] bg-brand-lavender px-[34px] py-7 shadow-[7px_8px_0_hsl(var(--brand-navy))]",
              NAVY_BORDER,
            )}
          >
            <ComboAnswerReveal reveal={reveal} teamName={teamName} />
          </main>
        ) : view.phase === "question" ? (
          <main
            className={cn(
              "flex min-h-[420px] flex-col gap-5 rounded-[28px] bg-brand-paper px-[34px] py-7 shadow-[7px_8px_0_hsl(var(--brand-navy))]",
              NAVY_BORDER,
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              {view.forcedQuestion ? (
                <p
                  className="inline-flex min-h-11 -rotate-2 items-center rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))] px-5 font-display text-xl font-black"
                  data-testid="combo-forced-banner"
                >
                  سؤال إجباري · ما فيه تثبيت
                  {view.breakRevealedByTeamId
                    ? ` · ${breaker} كسر الكومبو`
                    : ""}
                </p>
              ) : (
                <span className="text-lg font-bold text-brand-slate">
                  السؤال {view.questionNumber} من {view.questionsPerRun}
                </span>
              )}
              {remainingMs !== undefined && (
                <ChallengeCountdown remainingMs={remainingMs} />
              )}
            </div>

            <div className="flex flex-1 flex-col justify-center gap-4">
              <h2
                className="font-display text-[2rem] font-black leading-snug lg:text-[52px] lg:leading-[1.4]"
                data-testid="combo-prompt"
              >
                <BidiText>{comboPromptText(view)}</BidiText>
              </h2>
              {view.assignedParticipantId && (
                <p
                  className="text-lg font-bold text-brand-slate"
                  data-testid="combo-turn-holder"
                >
                  الجوال مع <bdi>{holderName}</bdi>
                </p>
              )}
            </div>

            {view.isActiveTeam ? (
              <div
                className="flex max-w-xl items-center gap-3"
                data-testid="combo-answer-controls"
              >
                <AnswerEntry
                  key={`${runtime.runtimeId}:${view.runIndex}:${view.questionNumber}`}
                  value={answer}
                  onChange={setAnswer}
                  className="flex-1"
                />
                <button
                  type="button"
                  disabled={!answer.trim() || !live}
                  onClick={submit}
                  onKeyDown={(event) => event.key === "Enter" && submit()}
                  className={cn(
                    GOLD_PILL,
                    !answer.trim() && "bg-brand-lavender",
                  )}
                >
                  إرسال
                </button>
              </div>
            ) : (
              <p className="text-lg font-bold text-brand-slate">
                {`${activeName} يجاوبون الحين…`}
              </p>
            )}

            {/* The break is offered only when the server said this actor may arm
                one. It is never offered to the running team, and never a second
                time — both of those are the server's determination, not ours. */}
            {view.canArmComboBreak && can("arm-combo-break") && (
              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  disabled={!live}
                  onClick={() => send("arm-combo-break")}
                  className={NAVY_PILL}
                  data-testid="combo-arm-break"
                >
                  فعّل كسر الكومبو
                </button>
                <p className="text-base font-bold text-brand-slate">
                  شحنة وحدة بس، وما يدرون إلا بعد ما يجاوبون.
                </p>
              </div>
            )}
            {view.ownComboBreakArmed && (
              <p
                className="rounded-2xl border-2 border-[hsl(var(--brand-navy))] bg-brand-lavender px-4 py-3 text-lg font-bold"
                data-testid="combo-armed-acknowledgement"
              >
                فعّلتوا الكسر. يبان لهم بس لو جاوبوا هالسؤال صح.
              </p>
            )}
          </main>
        ) : view.phase === "decision" ? (
          <main
            className={cn(
              "akwaan-rise flex min-h-[420px] flex-col justify-center gap-5 rounded-[28px] bg-brand-lavender px-[34px] py-7 shadow-[7px_8px_0_hsl(var(--brand-navy))]",
              NAVY_BORDER,
            )}
            data-testid="combo-decision"
          >
            <span className="inline-flex min-h-10 -rotate-3 items-center self-start rounded-[10px] border-[3px] border-[hsl(var(--brand-navy))] bg-brand-mint px-4 text-lg font-extrabold">
              جاوبوا صح ·{" "}
              <bdi dir="ltr" className="ms-1">
                +{view.lastQuestionReveal?.earned ?? 1}
              </bdi>
            </span>
            <h2 className="font-display text-[2.5rem] font-black leading-[1.4] lg:text-[64px]">
              نوقف ولا نكمل؟
            </h2>
            <div className="flex flex-col gap-4 sm:flex-row">
              <ComboChoice
                title="ثبّت"
                line={`تاخذون ${pointsLabel(comboStreakPoints(view))} مضمونة وتنتهي جولتكم.`}
                gold
                {...(view.isActiveTeam && can("cash-out-combo")
                  ? {
                      onPress: () => send("cash-out-combo"),
                      disabled: !live,
                      testId: "combo-cash-out",
                    }
                  : {})}
              />
              <ComboChoice
                title="كمّل"
                line="تلعبون السؤال الجاي. لو غلطتوا يروح الرصيد كله."
                {...(view.isActiveTeam && can("continue-combo")
                  ? {
                      onPress: () => send("continue-combo"),
                      disabled: !live,
                      testId: "combo-continue",
                    }
                  : {})}
              />
            </div>
            {!view.isActiveTeam && (
              <p className="text-[17px] font-semibold text-brand-slate">
                {view.assignedParticipantId ? (
                  <>
                    القرار عند <bdi>{holderName}</bdi>…
                  </>
                ) : (
                  `القرار عند ${activeName}…`
                )}
              </p>
            )}
          </main>
        ) : view.phase === "break-reveal" ? (
          <main
            className="akwaan-rise flex min-h-[420px] flex-col justify-center gap-[18px] rounded-[28px] border-[3px] border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-navy))] px-[34px] py-7 text-white shadow-[7px_8px_0_hsl(var(--brand-gold))]"
            data-testid="combo-break-reveal"
          >
            <span className="inline-flex min-h-[52px] -rotate-3 items-center self-start rounded-full border-[3px] border-white bg-[hsl(var(--brand-gold))] px-6 font-display text-[28px] font-black text-[hsl(var(--brand-navy))]">
              كسر الكومبو!
            </span>
            <h2 className="font-display text-[2.25rem] font-black leading-[1.4] lg:text-[52px]">
              {breaker} قفّل عليكم التثبيت
            </h2>
            <p className="text-[21px] leading-[1.8] text-[#D9D5EC]">
              جاوبتوا صح، بس ما فيه «ثبّت» هالمرة: سؤال إجباري. لو جاوبتوه صح
              تاخذون <bdi dir="ltr">+2</bdi>، ولو غلط يروح الرصيد كله.
            </p>
            {view.isActiveTeam && can("continue-combo") ? (
              <button
                type="button"
                disabled={!live}
                onClick={() => send("continue-combo")}
                className={cn(GOLD_PILL, "self-start border-white shadow-none")}
                data-testid="combo-forced-continue"
              >
                يلا السؤال الإجباري
              </button>
            ) : (
              <p className="text-[17px] font-semibold text-[#D9D5EC]">
                {`ننتظر ${activeName} يبدأون السؤال الإجباري…`}
              </p>
            )}
          </main>
        ) : (
          <RunRecap
            view={view}
            teamName={teamName}
            dotOf={dotOf}
            canAdvance={can("advance-combo-run")}
            live={live}
            onAdvance={() => send("advance-combo-run")}
          />
        )}

        {!terminal && (
          <ComboLadder
            view={view}
            {...(opponentId
              ? {
                  opponent: {
                    id: opponentId,
                    dot: dotOf(opponentId),
                  },
                }
              : {})}
          />
        )}
      </div>
    </section>
  );
}

/** One of the two ways out of a decision: a card for the room, a button for a player. */
function ComboChoice({
  title,
  line,
  gold = false,
  onPress,
  disabled,
  testId,
}: {
  title: string;
  line: string;
  gold?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  const body = (
    <>
      <span className="font-display text-4xl font-black">{title}</span>
      <span className="text-lg leading-[1.7]">{line}</span>
    </>
  );
  const className = cn(
    CHOICE,
    gold
      ? "bg-[hsl(var(--brand-gold))] shadow-[5px_6px_0_hsl(var(--brand-navy))]"
      : "bg-white",
  );
  if (!onPress) return <div className={className}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      data-testid={testId}
      className={cn(
        className,
        "transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:shadow-none",
      )}
    >
      {body}
    </button>
  );
}

/**
 * The side column: what is at stake, where the run is on its four steps, and
 * whether the other team still has its break.
 *
 * `unbankedPoints` is taken verbatim — the runtime already folded the survival
 * bonus in when it paid the forced question, so adding anything here would
 * double-count it. Whether the charge is spent is public; when it is armed is
 * not, and nothing here says so.
 */
function ComboLadder({
  view,
  opponent,
}: {
  view: ComboView;
  opponent?: { id: string; dot: string };
}) {
  // During a question the open step is the question itself. Once it is answered
  // (the decision, or the break being shown) the open step is the one after it.
  const answered = view.phase === "question" ? 0 : 1;
  const done = view.questionNumber - 1 + answered;
  const current = done + 1;
  const forced =
    view.phase === "break-reveal" ||
    (view.phase === "question" && view.forcedQuestion);
  const everyStepPaidOne = comboStreakPoints(view) === done;
  const steps = Array.from(
    { length: view.questionsPerRun },
    (_, index) => view.questionsPerRun - index,
  );

  return (
    <aside
      className="flex flex-col gap-3 rounded-[28px] border-[3px] border-[hsl(var(--brand-navy))] bg-brand-paper p-[18px]"
      data-testid="combo-streak"
    >
      <div className="flex items-center justify-between rounded-[18px] bg-[hsl(var(--brand-navy))] px-4 py-3 text-white">
        <span className="flex flex-col">
          <span className="text-sm font-semibold text-[hsl(var(--brand-gold))]">
            رصيد على المحك
          </span>
          <span className="text-[13px]">يروح كله لو غلطتوا</span>
        </span>
        <span
          className="akwaan-numeral text-[52px] font-bold leading-none"
          data-testid="combo-streak-points"
        >
          {comboStreakPoints(view)}
        </span>
      </div>

      <ul className="flex flex-col gap-2">
        {steps.map((step) => {
          const isDone = step <= done;
          const isCurrent = step === current;
          return (
            <li
              key={step}
              data-step-state={isDone ? "done" : isCurrent ? "current" : "next"}
              className={cn(
                "flex min-h-[62px] items-center justify-between gap-2.5 rounded-2xl px-4",
                isDone &&
                  "border-[3px] border-[hsl(var(--brand-navy))] bg-brand-mint-tint",
                isCurrent &&
                  "border-[3px] border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))] shadow-[4px_5px_0_hsl(var(--brand-navy))]",
                !isDone &&
                  !isCurrent &&
                  "border-2 border-dashed border-brand-dash bg-white",
              )}
            >
              <span className="font-display text-xl font-extrabold">
                السؤال {step}
              </span>
              {isDone && (
                <span dir="ltr" className="text-base font-extrabold">
                  {everyStepPaidOne ? "+1 ✓" : "✓"}
                </span>
              )}
              {isCurrent && (
                <span className="text-sm font-extrabold">
                  {forced ? (
                    <>
                      إجباري · <bdi dir="ltr">+2</bdi>
                    </>
                  ) : (
                    "الحين"
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {opponent && (
        <div
          className="mt-auto flex items-center justify-between gap-2 rounded-[14px] border-2 border-[hsl(var(--brand-navy))] bg-brand-lavender px-3.5 py-2.5 text-sm font-bold"
          data-testid={`combo-charge-${opponent.id}`}
        >
          <span className="inline-flex items-center gap-2">
            <TeamDot className={opponent.dot} size={12} />
            كسر الكومبو عند الخصم
          </span>
          <span>
            {view.charges[opponent.id] === "spent" ? "انصرف" : "باقي"}
          </span>
        </div>
      )}
    </aside>
  );
}

function PhoneComboController({
  view,
  answer,
  setAnswer,
  sending,
  live,
  remainingMs,
  can,
  teamName,
  submit,
  decide,
  force,
  holderName,
  reveal,
}: {
  view: ComboView;
  answer: string;
  setAnswer: (value: string) => void;
  sending: Sending;
  live: boolean;
  remainingMs?: number;
  can: (action: string) => boolean;
  teamName: (id: string) => string;
  submit: () => void;
  decide: (decision: "cash-out" | "continue") => void;
  force: () => void;
  /** Who holds the open question, for a teammate's coaching state. */
  holderName: string;
  /** The question that just resolved, while its beat is still on screen. */
  reveal?: ComboQuestionReveal;
}) {
  const latestRun = view.runResults.at(-1);
  const broken =
    latestRun?.endedBy === "combo-break" || latestRun?.endedBy === "timeout";
  const awaitingOpponent = !view.isActiveTeam;
  // The question's holder answers and decides; the rest of the team coaches.
  const holds = view.isActiveTeam && view.isAssignedActor;
  const coaching = view.isActiveTeam && !view.isAssignedActor;
  const running = view.phase !== "completed" && view.phase !== "run-complete";

  return (
    <ChallengeFrame
      compact
      title={
        view.phase === "completed"
          ? "انتهى التحدي"
          : `الجولة ${comboRunNumber(view)} · السؤال ${view.questionNumber} من ${view.questionsPerRun}`
      }
      progressValue={comboProgressValue(view)}
      aside={
        remainingMs !== undefined && view.phase === "question" ? (
          <ChallengeCountdown remainingMs={remainingMs} />
        ) : null
      }
      className="flex min-h-0 flex-1 flex-col"
    >
      <div
        className="flex min-h-0 flex-1 flex-col gap-3.5 text-center text-[hsl(var(--brand-navy))]"
        dir="rtl"
        data-testid="combo-phone-controller"
      >
        {running &&
          (view.isActiveTeam ? (
            <div
              className="flex shrink-0 items-center justify-between rounded-2xl bg-[hsl(var(--brand-navy))] px-4 py-3 text-white"
              data-testid="combo-phone-balance"
            >
              <span className="text-sm font-bold text-[hsl(var(--brand-gold))]">
                رصيدكم على المحك
              </span>
              <span className="akwaan-numeral text-4xl font-bold leading-none">
                {comboStreakPoints(view)}
              </span>
            </div>
          ) : (
            <p
              className="shrink-0 rounded-2xl border-2 border-[hsl(var(--brand-navy))] bg-brand-lavender px-3.5 py-3 text-[15px] font-bold leading-[1.7]"
              data-testid="combo-phone-balance"
            >
              الخصم يلعب جولته · رصيدهم على المحك:{" "}
              <span className="akwaan-numeral">{comboStreakPoints(view)}</span>
            </p>
          ))}

        {view.phase === "question" && coaching && (
          <section
            className="flex min-h-0 flex-1 flex-col justify-center gap-3"
            data-testid="combo-phone-coaching"
            role="status"
          >
            <p className="text-lg font-black">
              دوركم — الجوال مع <bdi>{holderName}</bdi>
            </p>
            <h2 className="font-display text-xl font-black leading-relaxed">
              <BidiText>{comboPromptText(view)}</BidiText>
            </h2>
            <p className="text-sm font-bold text-brand-slate">
              تشاوروا في الإجابة، والإرسال من جواله.
            </p>
          </section>
        )}

        {view.phase === "question" && holds && (
          <section
            className="flex min-h-0 flex-1 flex-col"
            data-testid="combo-phone-answer"
          >
            <div className="flex flex-1 flex-col justify-center gap-3.5">
              {view.forcedQuestion && (
                <p
                  className="mx-auto inline-flex min-h-[34px] items-center rounded-full border-2 border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))] px-3.5 text-sm font-extrabold"
                  data-testid="combo-phone-forced"
                >
                  سؤال إجباري · ما فيه تثبيت
                </p>
              )}
              <h2 className="font-display text-[22px] font-black leading-relaxed">
                <BidiText>{comboPromptText(view)}</BidiText>
              </h2>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  submit();
                }}
              >
                <AnswerEntry
                  key={`${view.runIndex}:${view.questionNumber}`}
                  value={answer}
                  onChange={setAnswer}
                  inputTestId="combo-answer-input"
                />
              </form>
            </div>
            <MobileActionArea>
              <button
                type="button"
                disabled={!answer.trim() || !live || Boolean(sending)}
                onClick={submit}
                className={cn(
                  GOLD_PILL,
                  "min-h-[66px] w-full",
                  !answer.trim() && !sending && "bg-brand-lavender",
                )}
                data-testid="combo-answer-submit"
              >
                {sending === "answer" ? "نرسلها…" : "إرسال الإجابة"}
              </button>
            </MobileActionArea>
          </section>
        )}

        {reveal && <ComboAnswerReveal reveal={reveal} teamName={teamName} />}

        {!reveal && view.phase === "decision" && (
          <section
            className="flex min-h-0 flex-1 flex-col"
            data-testid="combo-phone-decision"
          >
            {coaching ? (
              <PhoneWaiting>
                <span data-testid="combo-phone-coaching">
                  القرار من جوال <bdi>{holderName}</bdi>: ثبّت أو كمّل — تشاوروا
                </span>
              </PhoneWaiting>
            ) : holds ? (
              <>
                <div className="flex flex-1 flex-col items-center justify-center gap-2">
                  <p className="font-display text-3xl font-black">
                    نوقف ولا نكمل؟
                  </p>
                  {view.questionNumber < view.questionsPerRun && (
                    <p className="text-sm text-brand-slate">
                      السؤال الجاي: {view.questionNumber + 1} من{" "}
                      {view.questionsPerRun}
                    </p>
                  )}
                </div>
                <MobileActionArea className="gap-3.5">
                  {can("cash-out-combo") && (
                    <button
                      type="button"
                      disabled={!live || Boolean(sending)}
                      onClick={() => decide("cash-out")}
                      className={cn(
                        PHONE_CHOICE,
                        "bg-[hsl(var(--brand-gold))]",
                      )}
                      data-testid="combo-phone-cash-out"
                    >
                      <span className="font-display text-2xl font-black">
                        {sending === "cash-out" ? "نثبّت…" : "ثبّت"}
                      </span>
                      <span className="text-sm leading-[1.6]">
                        خذوا {pointsLabel(comboStreakPoints(view))} وانهوا
                        جولتكم
                      </span>
                    </button>
                  )}
                  {can("continue-combo") && (
                    <button
                      type="button"
                      disabled={!live || Boolean(sending)}
                      onClick={() => decide("continue")}
                      className={cn(PHONE_CHOICE, "bg-white")}
                      data-testid="combo-phone-continue"
                    >
                      <span className="font-display text-2xl font-black">
                        {sending === "continue" ? "نكمّل…" : "كمّل"}
                      </span>
                      <span className="text-sm leading-[1.6]">
                        الرصيد كله على المحك
                      </span>
                    </button>
                  )}
                </MobileActionArea>
              </>
            ) : (
              <PhoneWaiting>
                {teamName(view.activeTeamId)} يقررون الحين…
              </PhoneWaiting>
            )}
          </section>
        )}

        {!reveal && view.phase === "break-reveal" && (
          <section
            className="flex min-h-0 flex-1 flex-col"
            data-testid="combo-phone-break-reveal"
          >
            <div className="flex flex-1 flex-col items-center justify-center gap-3">
              <span className="inline-flex min-h-[34px] -rotate-3 items-center rounded-full border-2 border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))] px-3.5 text-sm font-extrabold">
                كسر الكومبو!
              </span>
              <p className="font-display text-[26px] font-black leading-snug">
                {view.isActiveTeam
                  ? "الخصم قفّل عليكم التثبيت"
                  : "قفّلتوا عليهم التثبيت"}
              </p>
              <p className="text-[15px] leading-[1.8] text-brand-slate">
                {view.isActiveTeam ? (
                  <>
                    سؤال إجباري. لو جاوبتوه صح تاخذون <bdi dir="ltr">+2</bdi>،
                    ولو غلط يروح الرصيد كله.
                  </>
                ) : (
                  "لازم يلعبون سؤال زيادة، ولو غلطوا يروح رصيدهم كله."
                )}
              </p>
            </div>
            {holds && can("continue-combo") ? (
              <MobileActionArea>
                <button
                  type="button"
                  disabled={!live || Boolean(sending)}
                  onClick={() => decide("continue")}
                  className={cn(GOLD_PILL, "min-h-[66px] w-full")}
                  data-testid="combo-phone-forced-continue"
                >
                  {sending === "continue" ? "نبدأ…" : "ابدأ السؤال الإجباري"}
                </button>
              </MobileActionArea>
            ) : (
              <p className="pb-2 text-sm font-bold text-brand-slate">
                {view.isActiveTeam ? "ننتظر زميلكم يبدأ…" : "ننتظرهم يبدأون…"}
              </p>
            )}
          </section>
        )}

        {view.phase === "question" && awaitingOpponent && (
          <section
            className="flex min-h-0 flex-1 flex-col gap-3.5"
            data-testid="combo-phone-opponent-run"
          >
            {view.canArmComboBreak && can("arm-combo-break") ? (
              <>
                <div className="flex flex-1 flex-col items-center justify-center gap-3">
                  <span className="inline-flex min-h-[34px] items-center rounded-full border-2 border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))] px-3.5 text-sm font-extrabold">
                    عندكم شحنة وحدة
                  </span>
                  <p className="font-display text-[32px] font-black">
                    كسر الكومبو
                  </p>
                  <p className="text-[15px] leading-[1.8] text-brand-slate">
                    لو جاوبوا هالسؤال صح ينمنعون من التثبيت وينجبرون على سؤال
                    زيادة. ما يدرون إنكم فعّلتوه إلا بعد ما يجاوبون.
                  </p>
                </div>
                <MobileActionArea>
                  <button
                    type="button"
                    disabled={!live || Boolean(sending)}
                    onClick={force}
                    className={cn(
                      NAVY_PILL,
                      "min-h-[66px] w-full shadow-[4px_5px_0_hsl(var(--brand-navy))]",
                    )}
                    data-testid="combo-phone-force"
                  >
                    {sending === "force" ? "نفعّله…" : "فعّل الكسر على هالسؤال"}
                  </button>
                  <p className="text-[13px] text-brand-slate">
                    تنصرف الشحنة حتى لو غلطوا من نفسهم.
                  </p>
                </MobileActionArea>
              </>
            ) : (
              <PhoneWaiting>
                {teamName(view.activeTeamId)} يجاوبون الحين…
              </PhoneWaiting>
            )}
            {view.ownComboBreakArmed && (
              <p
                className="mt-auto rounded-2xl border-2 border-[hsl(var(--brand-navy))] bg-brand-lavender p-4 font-bold"
                data-testid="combo-phone-force-sent"
              >
                فعّلتوا الكسر. ننتظر إجابتهم…
              </p>
            )}
          </section>
        )}

        {!reveal && !running && (
          <section
            className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2"
            data-testid="combo-phone-run-result"
          >
            {broken ? (
              <>
                <p className="font-display text-3xl font-black">
                  انكسر الكومبو
                </p>
                <p className="font-bold text-brand-slate">
                  راح الرصيد اللي ما تثبّت
                </p>
              </>
            ) : latestRun ? (
              <>
                <p className="font-display text-2xl font-black">انحفظ الرصيد</p>
                <p className="akwaan-numeral inline-flex min-w-20 justify-center rounded-2xl border-[3px] border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))] px-5 py-2 text-4xl font-bold shadow-[4px_5px_0_hsl(var(--brand-navy))]">
                  {latestRun.bankedPoints}
                </p>
              </>
            ) : (
              <p className="font-display text-xl font-black">انتهى التحدي</p>
            )}
            <p className="text-sm font-bold text-brand-slate">
              {view.phase === "completed"
                ? "شوفوا النتيجة على الشاشة"
                : "ننتظر الجولة الجاية…"}
            </p>
          </section>
        )}
      </div>
    </ChallengeFrame>
  );
}

function PhoneWaiting({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex flex-1 items-center justify-center px-4 text-lg font-bold text-brand-slate">
      {children}
    </p>
  );
}

function RunRecap({
  view,
  teamName,
  dotOf,
  canAdvance,
  live,
  onAdvance,
}: {
  view: ComboView;
  teamName: (id: string) => string;
  dotOf: (id: string) => string;
  /**
   * Whether the server offered `mode:advance-combo-run` to *this* actor. The
   * action list is built per actor through the same authorization check the
   * command itself asserts, so it already means "controller" — deriving the role
   * again on the client could only disagree with the server.
   */
  canAdvance: boolean;
  live: boolean;
  onAdvance: () => void;
}) {
  const finished = view.phase === "completed";
  return (
    <section
      className="akwaan-rise flex min-h-[420px] flex-col justify-center gap-5 rounded-[28px] border-[3px] border-[hsl(var(--brand-navy))] bg-brand-lavender px-[34px] py-7 text-center shadow-[7px_8px_0_hsl(var(--brand-navy))]"
      data-testid="combo-recap"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {view.teamIds.map((teamId) => {
          const run = comboRunOf(view, teamId);
          return (
            <div
              key={teamId}
              className="flex flex-col items-center gap-1.5 rounded-3xl border-[3px] border-[hsl(var(--brand-navy))] bg-white p-5"
              data-testid={`combo-recap-${teamId}`}
            >
              <p className="inline-flex items-center gap-2.5 font-display text-xl font-extrabold">
                <TeamDot className={dotOf(teamId)} />
                {teamName(teamId)}
              </p>
              <p className="akwaan-numeral text-[56px] font-bold leading-none">
                {run ? run.bankedPoints : "—"}
              </p>
              <p className="text-base font-bold text-brand-slate">
                {run ? describeComboRunEnd(run) : "ما لعبوا للحين"}
              </p>
              {run?.brokenByTeamId ? (
                <p className="text-base font-bold">
                  {`على يد ${teamName(run.brokenByTeamId)}`}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {finished && view.result ? (
        <p
          className="font-display text-3xl font-black"
          data-testid="combo-result"
        >
          {view.result.tie
            ? "تعادل!"
            : view.result.winnerTeamId
              ? `${teamName(view.result.winnerTeamId)} فاز بالتحدي!`
              : "انتهى التحدي"}
        </p>
      ) : canAdvance ? (
        <button
          type="button"
          disabled={!live}
          onClick={onAdvance}
          className={cn(GOLD_PILL, "self-center")}
          data-testid="combo-advance-run"
        >
          {comboIsFinalRun(view) ? "عرض نتيجة التحدي" : "دور الفريق الآخر"}
        </button>
      ) : (
        <p className="text-[17px] font-semibold text-brand-slate">
          ننتظر المضيف يكمّل…
        </p>
      )}
    </section>
  );
}
