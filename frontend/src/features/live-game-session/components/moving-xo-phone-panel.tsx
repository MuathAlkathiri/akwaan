"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, Send } from "lucide-react";

import { BidiText } from "@/components/akwaan/bidi-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authoredText } from "../authored-text";
import { useInteractionDeadline } from "../hooks/use-interaction-deadline";
import { useLiveSession } from "../hooks/live-session-context";
import { useWaitingForNextQuestion } from "../hooks/use-recurring-question-transition";
import { AnswerOption } from "../match/components/answer-option";
import { ChallengeCountdown } from "../match/components/challenge-countdown";
import { ChallengeFrame } from "../match/components/challenge-frame";
import { MobileActionArea } from "../match/components/mobile-action-area";
import {
  MOVING_XO_CONTENT_EXHAUSTED_COPY,
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
  const mayAnswer = phase === "answering" && can(ANSWER_COMMAND);
  const mayPlace = phase === "placement" && can(PLACE_COMMAND);
  const live = connection === "connected";

  // Pending feedback is local only. Any authoritative runtime move releases it,
  // including another teammate winning the placement CAS before this phone.
  useEffect(() => {
    setSending(undefined);
    setAnswer("");
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
      payload,
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

  return (
    <ChallengeFrame
      compact
      title={phoneTitle(phase, mayAnswer, mayPlace, activeTeam?.name)}
      aside={
        remainingMs !== undefined ? (
          <ChallengeCountdown remainingMs={remainingMs} />
        ) : null
      }
      className="flex min-h-0 flex-1 flex-col"
    >
      <section
        dir="rtl"
        data-testid="moving-xo-phone"
        data-moving-xo-phase={phase}
        className="flex min-h-0 flex-1 flex-col gap-3"
      >
        {phase === "question-pending" && <PendingPhone />}

        {phase === "answering" && view.question && mayAnswer && (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <MovingXoQuestion
              compact
              question={view.question}
              showOptions={false}
            />
            {sending === "answer" ? (
              <SentState label="تم إرسال إجابتكم" />
            ) : view.question.answerMode === "match" ? (
              <form
                onSubmit={submitText}
                className="flex min-h-0 flex-1 flex-col"
                data-testid="moving-xo-answer-form"
              >
                <div className="flex flex-1 items-center">
                  <Input
                    ref={answerInput}
                    value={answer}
                    onChange={(event) => setAnswer(event.target.value)}
                    aria-label="الإجابة"
                    placeholder="اكتب الإجابة"
                    autoComplete="off"
                    enterKeyHint="send"
                    className="h-16 rounded-[var(--radius)] border-2 text-center text-xl font-black focus-visible:border-brand-gold"
                  />
                </div>
                <MobileActionArea>
                  <Button
                    type="submit"
                    size="lg"
                    disabled={!answer.trim() || !live || Boolean(sending)}
                    className="h-14 w-full text-base font-black"
                    data-testid="moving-xo-answer-submit"
                  >
                    <Send className="size-4" aria-hidden />
                    أرسل الإجابة
                  </Button>
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
            title={`دور ${activeTeam?.name ?? "الفريق الآخر"}`}
            body="تابعوا اللغز على الشاشة"
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
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <p className="text-center text-sm font-black text-muted-foreground">
              {view.expiringCell !== undefined
                ? "جدّدوا العلامة الباهتة أو اختاروا خانة فارغة"
                : "اختاروا خانة للحركة"}
            </p>
            <MovingXoBoard
              compact
              board={view.board}
              teams={teams}
              legalCells={view.legalCells}
              {...(view.expiringCell !== undefined
                ? { expiringCell: view.expiringCell }
                : {})}
              onPlace={place}
              disabled={!live || Boolean(sending)}
            />
            {sending === "placement" && (
              <div
                role="status"
                data-testid="moving-xo-placement-pending"
                className="flex items-center justify-center gap-2 text-sm font-black text-muted-foreground"
              >
                <Loader2 className="size-4 animate-spin" aria-hidden />
                جارٍ تثبيت الحركة…
              </div>
            )}
          </div>
        )}

        {phase === "placement" && !mayPlace && (
          <WaitingPhone
            title={`${activeTeam?.name ?? "الفريق الآخر"} يختار الحركة`}
            body="ستتحدث اللوحة فور تثبيت أول اختيار"
          >
            <MovingXoBoard compact board={view.board} teams={teams} />
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
    </ChallengeFrame>
  );
}

function phoneTitle(
  phase: string,
  mayAnswer: boolean,
  mayPlace: boolean,
  activeTeamName?: string,
): string {
  if (phase === "completed") return "انتهت الجولة";
  if (phase === "question-pending") return "اللغز التالي";
  if (mayAnswer) return "جاوبوا واكسبوا الحركة";
  if (mayPlace) return "الحركة لكم";
  return `دور ${activeTeamName ?? "الفريق الآخر"}`;
}

function PendingPhone() {
  return (
    <div
      role="status"
      data-testid="moving-xo-phone-pending"
      className="flex flex-1 flex-col items-center justify-center gap-3 text-center"
    >
      <Loader2 className="size-6 animate-spin text-brand-gold" aria-hidden />
      <p className="font-black text-foreground">جارٍ تجهيز اللغز…</p>
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
      <span className="grid size-14 place-items-center rounded-full border border-brand-gold/40 bg-brand-gold/10">
        <Check className="size-7 text-brand-gold" aria-hidden />
      </span>
      <p className="font-black text-foreground">{label}</p>
      <p className="text-sm font-bold text-muted-foreground">ننتظر النتيجة…</p>
    </div>
  );
}

function WaitingPhone({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      data-testid="moving-xo-phone-waiting"
      className="flex min-h-0 flex-1 flex-col justify-center gap-4"
    >
      {children}
      <div className="surface-card p-5 text-center">
        <p className="text-lg font-black text-foreground">{title}</p>
        <p className="mt-1 text-sm font-bold text-muted-foreground">{body}</p>
      </div>
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
      <div className="surface-card p-4" data-testid="moving-xo-phone-terminal">
        <p className="text-xl font-black text-foreground">
          {outcome === "win"
            ? `فاز ${winner?.name ?? "الفريق"}`
            : outcome === "draw"
              ? "تعادل"
              : MOVING_XO_CONTENT_EXHAUSTED_COPY}
        </p>
      </div>
    </div>
  );
}
