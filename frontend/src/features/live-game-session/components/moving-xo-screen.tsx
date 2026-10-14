"use client";

import { Circle, Sparkles, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { teamIdentityOf } from "@/lib/team-identity";
import { useInteractionDeadline } from "../hooks/use-interaction-deadline";
import { useLiveSession } from "../hooks/live-session-context";
import { useWaitingForNextQuestion } from "../hooks/use-recurring-question-transition";
import { ChallengeCountdown } from "../match/components/challenge-countdown";
import { ChallengeFrame } from "../match/components/challenge-frame";
import {
  MOVING_XO_CONTENT_EXHAUSTED_COPY,
  movingXoSymbol,
  readMovingXoView,
  visibleExpiringCell,
  winningLineOf,
} from "../match/moving-xo.presentation";
import type { GameplayRuntimeSnapshot } from "../model";
import { MovingXoBoard } from "./moving-xo-board";
import { MovingXoQuestion } from "./moving-xo-question";

export function MovingXoScreen({
  runtime,
}: {
  runtime: GameplayRuntimeSnapshot;
}) {
  const { snapshot } = useLiveSession();
  const view = readMovingXoView(
    runtime.modeState as unknown as Record<string, unknown>,
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
  const activeIdentity = teamIdentityOf(view.activeTeamId, teams);
  const activeSymbol = movingXoSymbol(view.activeTeamId, teams);
  const expiringCell = visibleExpiringCell({ ...view, phase });
  const winningLine =
    terminal && view.outcome === "win" ? winningLineOf(view.board) : [];

  return (
    <ChallengeFrame
      eyebrow="لوحة X و O"
      title={terminal ? "نهاية الجولة" : `دور ${activeTeam?.name ?? "الفريق"}`}
      progressLabel={`${view.successfulMoveCount} حركة ناجحة`}
      aside={
        remainingMs !== undefined ? (
          <ChallengeCountdown remainingMs={remainingMs} />
        ) : null
      }
      className="mx-auto w-full max-w-6xl"
    >
      <section
        dir="rtl"
        data-testid="moving-xo-screen"
        data-moving-xo-phase={phase}
        className="space-y-4"
      >
        {view.decisivePhase && (
          <div
            role="status"
            data-testid="moving-xo-decisive"
            className="akwaan-rise flex items-center justify-center gap-2 rounded-[var(--radius)] border border-brand-gold/50 bg-brand-gold/10 px-4 py-2 text-center font-black text-foreground"
          >
            <Sparkles className="size-4 text-brand-gold" aria-hidden />
            <span>الحسم</span>
            <span className="text-xs font-bold text-muted-foreground">
              كل علامة تبقى
            </span>
          </div>
        )}

        <div className="grid items-center gap-5 lg:grid-cols-[minmax(18rem,0.92fr)_minmax(22rem,1.08fr)]">
          <div className="order-2 lg:order-1">
            <MovingXoBoard
              board={view.board}
              teams={teams}
              {...(expiringCell !== undefined ? { expiringCell } : {})}
              winningLine={winningLine}
            />
          </div>

          <div className="order-1 space-y-4 lg:order-2">
            {!terminal && (
              <div
                className={cn(
                  "flex items-center justify-center gap-3 rounded-[var(--radius)] border-2 px-4 py-3",
                  activeIdentity.surface,
                  activeIdentity.border,
                  activeIdentity.text,
                )}
                data-testid="moving-xo-active-team"
                data-team-id={view.activeTeamId}
              >
                {activeSymbol === "X" ? (
                  <X className="size-7" strokeWidth={3} aria-hidden />
                ) : (
                  <Circle className="size-6" strokeWidth={3} aria-hidden />
                )}
                <p className="text-lg font-black">
                  {phase === "placement"
                    ? `${activeTeam?.name ?? "الفريق"} كسب الحركة`
                    : `الدور على ${activeTeam?.name ?? "الفريق"}`}
                </p>
              </div>
            )}

            {phase === "question-pending" && (
              <div
                role="status"
                data-testid="moving-xo-question-pending"
                className="surface-card flex min-h-40 flex-col items-center justify-center gap-3 p-6 text-center"
              >
                <span
                  aria-hidden
                  className="size-3 animate-pulse rounded-full bg-brand-gold motion-reduce:animate-none"
                />
                <p className="text-xl font-black text-foreground">
                  نجهّز اللغز التالي…
                </p>
              </div>
            )}

            {phase === "answering" && view.question && (
              <div className="surface-card p-4 sm:p-5">
                <MovingXoQuestion question={view.question} />
              </div>
            )}

            {phase === "placement" && (
              <div
                data-testid="moving-xo-placement-message"
                className="surface-card space-y-2 p-6 text-center"
              >
                <p className="text-2xl font-black text-foreground">
                  اختاروا مكان الحركة
                </p>
                {expiringCell !== undefined ? (
                  <p className="text-sm font-bold text-muted-foreground">
                    العلامة الباهتة ستغادر — أو جدّدوها في مكانها
                  </p>
                ) : (
                  <p className="text-sm font-bold text-muted-foreground">
                    الاختيار من جوال الفريق
                  </p>
                )}
              </div>
            )}

            {terminal && (
              <TerminalState
                outcome={view.outcome}
                winnerName={
                  teams.find((team) => team.id === view.winningTeamId)?.name
                }
              />
            )}
          </div>
        </div>
      </section>
    </ChallengeFrame>
  );
}

function TerminalState({
  outcome,
  winnerName,
}: {
  outcome?: "win" | "draw" | "content-exhausted";
  winnerName?: string;
}) {
  if (outcome === "win") {
    return (
      <div
        data-testid="moving-xo-win"
        className="surface-card space-y-2 p-7 text-center"
      >
        <p className="text-sm font-black text-brand-gold">ثلاثة على خط واحد</p>
        <p className="text-3xl font-black text-foreground">
          فاز {winnerName ?? "الفريق"}
        </p>
      </div>
    );
  }
  if (outcome === "draw") {
    return (
      <div
        data-testid="moving-xo-draw"
        className="surface-card p-7 text-center"
      >
        <p className="text-3xl font-black text-foreground">تعادل</p>
        <p className="mt-2 text-sm font-bold text-muted-foreground">
          امتلأت اللوحة بلا فائز
        </p>
      </div>
    );
  }
  return (
    <div
      data-testid="moving-xo-neutral-completion"
      className="surface-card p-7 text-center"
    >
      <p className="text-2xl font-black text-foreground">
        {MOVING_XO_CONTENT_EXHAUSTED_COPY}
      </p>
    </div>
  );
}
