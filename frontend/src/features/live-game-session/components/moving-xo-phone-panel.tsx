"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";

import { BidiText } from "@/components/akwaan/bidi-text";
import { cn } from "@/lib/utils";
import { authoredText } from "../authored-text";
import { useInteractionDeadline } from "../hooks/use-interaction-deadline";
import { useLiveSession } from "../hooks/live-session-context";
import { useWaitingForNextQuestion } from "../hooks/use-recurring-question-transition";
import { AnswerOption } from "../match/components/answer-option";
import { ChallengeCountdown } from "../match/components/challenge-countdown";
import { countdownThresholdsForWindow } from "../match/components/countdown-urgency";

/** The question window is fifteen seconds and the placement window ten. */
const MOVING_XO_QUESTION_THRESHOLDS = countdownThresholdsForWindow(15);
const MOVING_XO_PLACEMENT_THRESHOLDS = countdownThresholdsForWindow(10);
import { MobileActionArea } from "../match/components/mobile-action-area";
import {
  MOVING_XO_CONTENT_EXHAUSTED_COPY,
  movingMarkCell,
  movingXoSymbol,
  readMovingXoView,
  winningLineOf,
} from "../match/moving-xo.presentation";
import type { GameplayRuntimeSnapshot } from "../model";
import { MovingXoBoard } from "./moving-xo-board";
import { MovingXoQuestion } from "./moving-xo-question";

const ANSWER_COMMAND = "submit-moving-xo-answer";
const PLACE_COMMAND = "place-moving-xo-mark";

export function MovingXoPhonePanel({
  runtime,
}: {
  runtime: GameplayRuntimeSnapshot;
}) {
  const { snapshot, gameplayCommand, connection } = useLiveSession();
  const [answer, setAnswer] = useState("");
  const [sending, setSending] = useState<"answer" | "placement">();
  // The cell a thumb has landed on. Nothing is sent until «ثبّت الحركة».
  const [picked, setPicked] = useState<number>();
  const answerInput = useRef<HTMLInputElement>(null);
  const view = useMemo(
    () =>
      readMovingXoView(runtime.modeState as unknown as Record<string, unknown>),
    [runtime.modeState],
  );
  const waitingForNext = useWaitingForNextQuestion();
  const phase = waitingForNext ? "question-pending" : view.phase;
  const terminal = phase === "completed";
  const remainingMs = useInteractionDeadline(
    phase === "answering" || phase === "placement"
      ? view.deadlineAt
      : undefined,
    terminal,
  );
  const teams = snapshot?.teams ?? [];
  const activeTeam = teams.find((team) => team.id === view.activeTeamId);
  const can = (command: string) =>
    runtime.availableActions.includes(`mode:${command}`);
  // The server offers the commands to the whole active team; of those phones,
  // only the one holding the turn (lobby captain or rotation) acts. The rest
  // of the team coaches it.
  const mayAnswer =
    phase === "answering" && can(ANSWER_COMMAND) && view.isAssignedActor;
  const mayPlace =
    phase === "placement" && can(PLACE_COMMAND) && view.isAssignedActor;
  const coaching =
    !view.isAssignedActor && (can(ANSWER_COMMAND) || can(PLACE_COMMAND));
  const holderName =
    snapshot?.participants.find(
      (participant) => participant.id === view.assignedParticipantId,
    )?.displayName ?? "زميلكم";
  const live = connection === "connected";

  // Pending feedback is local only. Any authoritative runtime move releases it,
  // including the turn being handed to a teammate after a disconnect.
  useEffect(() => {
    setSending(undefined);
    setAnswer("");
    setPicked(undefined);
  }, [
    runtime.runtimeId,
    runtime.revision,
    phase,
    view.question?.contentItemId,
  ]);
  useEffect(() => {
    if (mayAnswer && view.question?.answerMode === "match") {
      answerInput.current?.focus();
    }
  }, [mayAnswer, view.question?.answerMode, view.question?.contentItemId]);

  const send = (
    commandType: string,
    payload: Record<string, string | number | boolean | null>,
  ) =>
    gameplayCommand("gameplay-command", {
      roundId: runtime.activeRound?.id,
      commandType,
      payload: {
        ...payload,
        // Proves this phone still holds the turn it was handed.
        ...(view.ownAssignmentSequence !== undefined
          ? { assignmentSequence: view.ownAssignmentSequence }
          : {}),
      },
    });

  const submitText = (event: FormEvent) => {
    event.preventDefault();
    if (!mayAnswer || !live || sending || !answer.trim()) return;
    setSending("answer");
    send(ANSWER_COMMAND, { answer: answer.trim() });
  };

  const submitOption = (optionId: string) => {
    if (!mayAnswer || !live || sending) return;
    setSending("answer");
    send(ANSWER_COMMAND, { optionId });
  };

  const place = (cell: number) => {
    if (!mayPlace || !live || sending || !view.legalCells.includes(cell))
      return;
    setSending("placement");
    send(PLACE_COMMAND, { cell });
  };

  const movingCell = movingMarkCell({ ...view, phase });
  const ownSymbol = movingXoSymbol(view.activeTeamId, teams);
  // A pick the server no longer offers is not a pick.
  const chosen =
    picked !== undefined && view.legalCells.includes(picked)
      ? picked
      : undefined;
  const timer =
    remainingMs !== undefined ? (
      <ChallengeCountdown
        remainingMs={remainingMs}
        thresholds={
          phase === "placement"
            ? MOVING_XO_PLACEMENT_THRESHOLDS
            : MOVING_XO_QUESTION_THRESHOLDS
        }
      />
    ) : null;
  const otherTeam = activeTeam?.name ?? "الفريق الآخر";

  return (
    <section
      dir="rtl"
      data-testid="moving-xo-phone"
      data-moving-xo-phase={phase}
      className="flex min-h-0 w-full flex-1 flex-col gap-3.5 rounded-[22px] border-[3px] border-[hsl(var(--brand-navy))] bg-brand-paper p-4 shadow-[5px_6px_0_hsl(var(--brand-navy))]"
    >
      {phase === "question-pending" && <PendingPhone />}

      {phase === "answering" && view.question && mayAnswer && (
        <div className="flex min-h-0 flex-1 flex-col gap-3.5">
          <div className="flex items-center justify-between gap-2.5">
            <span className="text-sm font-bold text-brand-plum">
              جاوبوا صح عشان تلعبون حركتكم
            </span>
            {timer}
          </div>
          <MovingXoQuestion
            compact
            question={view.question}
            showOptions={false}
          />
          {sending === "answer" ? (
            <SentState label="وصلت إجابتكم" />
          ) : view.question.answerMode === "match" ? (
            <form
              onSubmit={submitText}
              className="flex min-h-0 flex-1 flex-col"
              data-testid="moving-xo-answer-form"
            >
              <MobileActionArea className="gap-3">
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="moving-xo-answer"
                    className="text-[15px] font-bold text-[hsl(var(--brand-navy))]"
                  >
                    إجابتكم
                  </label>
                  <input
                    id="moving-xo-answer"
                    ref={answerInput}
                    type="text"
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    aria-label="الإجابة"
                    autoComplete="off"
                    enterKeyHint="send"
                    className="min-h-[60px] rounded-2xl border-[3px] border-[hsl(var(--brand-navy))] bg-white px-4 text-center text-xl font-bold text-[hsl(var(--brand-navy))] outline-none focus-visible:border-[hsl(var(--brand-gold))] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-navy))]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!answer.trim() || !live || Boolean(sending)}
                  className={GOLD_ACTION}
                  data-testid="moving-xo-answer-submit"
                >
                  إرسال الإجابة
                </button>
              </MobileActionArea>
            </form>
          ) : (
            <MobileActionArea className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {view.question.options.map((option) => (
                <AnswerOption
                  key={option.id}
                  disabled={!live || Boolean(sending)}
                  onClick={() => submitOption(option.id)}
                >
                  <BidiText>{authoredText(option.label)}</BidiText>
                </AnswerOption>
              ))}
            </MobileActionArea>
          )}
        </div>
      )}

      {phase === "answering" && !mayAnswer && (
        <WaitingPhone
          testId={coaching ? "moving-xo-phone-coaching" : undefined}
          title={coaching ? "دوركم، ساعدوا زميلكم" : `دور ${otherTeam}`}
          body={coaching ? undefined : "شوفوا اللغز على الشاشة."}
          {...(coaching ? { decides: holderName } : {})}
        >
          {view.question && (
            <MovingXoQuestion
              compact
              question={view.question}
              showOptions={false}
            />
          )}
        </WaitingPhone>
      )}

      {phase === "placement" && mayPlace && (
        <div className="flex min-h-0 flex-1 flex-col items-center gap-3.5">
          <div className="flex w-full items-center justify-between gap-2.5">
            <span className="inline-flex min-h-8 -rotate-3 items-center rounded-[10px] border-[3px] border-success px-3 text-sm font-extrabold text-success">
              جاوبتوا صح
            </span>
            {timer}
          </div>
          <h1 className="text-center font-display text-2xl font-black text-[hsl(var(--brand-navy))]">
            اختاروا خانتكم
          </h1>
          <MovingXoBoard
            compact
            board={view.board}
            teams={teams}
            legalCells={view.legalCells}
            {...(movingCell !== undefined ? { expiringCell: movingCell } : {})}
            {...(chosen !== undefined ? { selectedCell: chosen } : {})}
            {...(ownSymbol ? { selectedSymbol: ownSymbol } : {})}
            onPlace={setPicked}
            disabled={!live || Boolean(sending)}
          />
          <p className="text-center text-sm leading-relaxed text-brand-plum">
            {movingCell !== undefined
              ? "معكم 3 علامات، فالباهتة بتنتقل للخانة اللي تختارونها."
              : "اختاروا خانة من الخانات الذهبية."}
          </p>
          {sending === "placement" ? (
            <p
              role="status"
              data-testid="moving-xo-placement-pending"
              className="mt-auto flex min-h-[62px] items-center justify-center gap-2 text-sm font-bold text-brand-slate"
            >
              <Loader2 className="size-4 animate-spin" aria-hidden />
              نثبّت الحركة…
            </p>
          ) : (
            <button
              type="button"
              disabled={chosen === undefined || !live}
              onClick={() => chosen !== undefined && place(chosen)}
              data-testid="moving-xo-confirm-place"
              className={cn(GOLD_ACTION, "mt-auto self-stretch")}
            >
              ثبّت الحركة
            </button>
          )}
        </div>
      )}

      {phase === "placement" && !mayPlace && (
        <WaitingPhone
          testId={coaching ? "moving-xo-phone-coaching" : undefined}
          title={coaching ? "اختاروا خانتكم" : `${otherTeam} يختار خانته`}
          body={coaching ? undefined : "اللوحة تتحدث أول ما يثبّتون الحركة."}
          {...(coaching ? { decides: holderName } : {})}
        >
          <MovingXoBoard
            compact
            board={view.board}
            teams={teams}
            {...(movingCell !== undefined ? { expiringCell: movingCell } : {})}
          />
        </WaitingPhone>
      )}

      {terminal && (
        <PhoneTerminal
          board={view.board}
          teams={teams}
          outcome={view.outcome}
          winnerTeamId={view.winningTeamId}
        />
      )}
    </section>
  );
}

/** The one gold action a phone screen ends on. */
const GOLD_ACTION =
  "min-h-[62px] rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))] px-6 font-display text-xl font-extrabold text-[hsl(var(--brand-navy))] shadow-[4px_5px_0_hsl(var(--brand-navy))] transition-transform duration-fast active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_3px_0_hsl(var(--brand-navy))] disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none";

function PendingPhone() {
  return (
    <div
      role="status"
      data-testid="moving-xo-phone-pending"
      className="flex flex-1 flex-col items-center justify-center gap-3 text-center"
    >
      <Loader2
        className="size-6 animate-spin text-[hsl(var(--brand-navy))]"
        aria-hidden
      />
      <p className="font-display text-lg font-extrabold text-[hsl(var(--brand-navy))]">
        نجهّز اللغز…
      </p>
    </div>
  );
}

function SentState({ label }: { label: string }) {
  return (
    <div
      role="status"
      data-testid="moving-xo-answer-pending"
      className="flex flex-1 flex-col items-center justify-center gap-2 text-center"
    >
      <span className="grid size-14 place-items-center rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))]">
        <Check className="size-7 text-[hsl(var(--brand-navy))]" aria-hidden />
      </span>
      <p className="font-display text-lg font-extrabold text-[hsl(var(--brand-navy))]">
        {label}
      </p>
      <p className="text-sm font-semibold text-brand-slate">ننتظر النتيجة…</p>
    </div>
  );
}

function WaitingPhone({
  title,
  body,
  decides,
  children,
  testId = "moving-xo-phone-waiting",
}: {
  title: string;
  body?: string;
  /** The teammate who decides this turn, on a teammate's read-only screen. */
  decides?: string;
  children?: React.ReactNode;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="flex min-h-0 flex-1 flex-col justify-center gap-4"
    >
      <p className="text-center font-display text-xl font-extrabold text-[hsl(var(--brand-navy))]">
        {title}
      </p>
      {children}
      {body && (
        <p className="text-center text-sm font-semibold leading-relaxed text-brand-slate">
          {body}
        </p>
      )}
      {decides && (
        <p
          data-testid="moving-xo-phone-decides"
          className="rounded-[14px] border-2 border-dashed border-brand-dash bg-brand-lavender px-3.5 py-3 text-center text-[15px] font-bold text-brand-plum"
        >
          القرار عند <BidiText>{decides}</BidiText>
        </p>
      )}
    </div>
  );
}

function PhoneTerminal({
  board,
  teams,
  outcome,
  winnerTeamId,
}: {
  board: ReturnType<typeof readMovingXoView>["board"];
  teams: ReadonlyArray<{ id: string; name: string }>;
  outcome?: "win" | "draw" | "content-exhausted";
  winnerTeamId?: string;
}) {
  const winner = teams.find((team) => team.id === winnerTeamId);
  return (
    <div className="flex flex-1 flex-col justify-center gap-4 text-center">
      <MovingXoBoard
        compact
        board={board}
        teams={teams}
        winningLine={outcome === "win" ? winningLineOf(board) : []}
      />
      <div
        className={cn(
          "rounded-2xl border-[3px] border-[hsl(var(--brand-navy))] p-4",
          outcome === "win" ? "bg-[hsl(var(--brand-gold))]" : "bg-white",
        )}
        data-testid="moving-xo-phone-terminal"
      >
        <p className="font-display text-xl font-black text-[hsl(var(--brand-navy))]">
          {outcome === "win"
            ? `فوز ${winner?.name ?? "الفريق"}`
            : outcome === "draw"
              ? "تعادل"
              : MOVING_XO_CONTENT_EXHAUSTED_COPY}
        </p>
      </div>
    </div>
  );
}
