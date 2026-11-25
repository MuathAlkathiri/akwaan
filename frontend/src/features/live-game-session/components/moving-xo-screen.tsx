"use client";

import { cn } from "@/lib/utils";
import { teamIdentityOf } from "@/lib/team-identity";
import { useInteractionDeadline } from "../hooks/use-interaction-deadline";
import { useLiveSession } from "../hooks/live-session-context";
import { useWaitingForNextQuestion } from "../hooks/use-recurring-question-transition";
import { ChallengeCountdown } from "../match/components/challenge-countdown";
import {
  ChallengeContextStrip,
  TeamDot,
  useChallengeContext,
} from "../match/components/challenge-context-strip";
import { countdownThresholdsForWindow } from "../match/components/countdown-urgency";
import {
  MOVING_XO_CONTENT_EXHAUSTED_COPY,
  movingMarkCell,
  movingXoSymbol,
  readMovingXoView,
  winningLineOf,
} from "../match/moving-xo.presentation";
import type { GameplayRuntimeSnapshot } from "../model";
import { MovingXoBoard, MovingXoLegend, MovingXoMark } from "./moving-xo-board";
import { MovingXoQuestion } from "./moving-xo-question";

/** The question window is fifteen seconds and the placement window ten. */
const MOVING_XO_QUESTION_THRESHOLDS = countdownThresholdsForWindow(15);
const MOVING_XO_PLACEMENT_THRESHOLDS = countdownThresholdsForWindow(10);

const CHALLENGE_NAME = "إكس أو المتحرك";
const STICKER =
  "rounded-[28px] border-[3px] border-[hsl(var(--brand-navy))] shadow-[7px_8px_0_hsl(var(--brand-navy))]";

/**
 * «إكس أو المتحرك» on the shared screen.
 *
 * The approved layout (design canvas, `TVXOQuestion` / `TVXOPlace` /
 * `TVXOWin`): the navy context strip with the turn in a gold chip, the question
 * in its own card, and the board beside it for the whole challenge — legend
 * above the grid, one line of rule under it.
 */
export function MovingXoScreen({
  runtime,
}: {
  runtime: GameplayRuntimeSnapshot;
}) {
  const { snapshot } = useLiveSession();
  const context = useChallengeContext();
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
  const activeName = activeTeam?.name ?? "الفريق";
  const holderName = view.assignedParticipantId
    ? snapshot?.participants.find(
        (participant) => participant.id === view.assignedParticipantId,
      )?.displayName
    : undefined;
  const activeIdentity = teamIdentityOf(view.activeTeamId, teams);
  const activeSymbol = movingXoSymbol(view.activeTeamId, teams);
  const movingCell = movingMarkCell({ ...view, phase });
  const won = terminal && view.outcome === "win";
  const winningLine = won ? winningLineOf(view.board) : [];
  const winner = teams.find((team) => team.id === view.winningTeamId);
  const doubled = Boolean(
    winner &&
      snapshot?.match?.currentChallenge?.doubledTeamIds?.includes(winner.id),
  );
  // On the shared screen every empty cell is one the team may take.
  const openCells =
    phase === "placement"
      ? view.board.cells.flatMap((owner, cell) => (owner ? [] : [cell]))
      : [];
  const timer =
    remainingMs !== undefined ? (
      <ChallengeCountdown
        remainingMs={remainingMs}
        size="md"
        thresholds={
          phase === "placement"
            ? MOVING_XO_PLACEMENT_THRESHOLDS
            : MOVING_XO_QUESTION_THRESHOLDS
        }
      />
    ) : null;

  const status = terminal
    ? "انتهى التحدي"
    : phase === "placement"
      ? "ننتظر اختيار الخانة…"
      : phase === "answering"
        ? `${activeName} يجاوبون من جوالهم…`
        : "نجهّز اللغز الجاي…";

  const boardNote = won
    ? "3 في صف واحد. الخط الفائز بالذهبي."
    : view.decisivePhase
      ? "الحسم: كل علامة تنحط تبقى في مكانها."
      : phase === "placement"
        ? movingCell !== undefined
          ? "معهم 3 علامات، فأقدم وحدة بتنتقل للخانة اللي يختارونها."
          : "يختارون خانة من الخانات المحددة بالذهبي."
        : "كل فريق له 3 علامات بس. الحركة الرابعة تنقل أقدم علامة، وهي الباهتة المكتوب عليها «بتنتقل».";

  return (
    <section
      dir="rtl"
      data-testid="moving-xo-screen"
      data-moving-xo-phase={phase}
      className="flex flex-col gap-[18px]"
    >
      <ChallengeContextStrip
        {...(context.eyebrow ? { eyebrow: context.eyebrow } : {})}
        title={context.title ?? CHALLENGE_NAME}
        aside={
          terminal ? (
            <span className="inline-flex min-h-9 items-center rounded-full bg-white px-4 text-[15px] font-bold text-[hsl(var(--brand-navy))]">
              اكتمل التحدي
            </span>
          ) : (
            <span
              data-testid="moving-xo-active-team"
              data-team-id={view.activeTeamId}
              className="inline-flex min-h-[44px] items-center gap-2.5 rounded-full border-2 border-white bg-[hsl(var(--brand-gold))] px-[18px] text-lg font-extrabold text-[hsl(var(--brand-navy))]"
            >
              <TeamDot className={activeIdentity.dot} />
              دور {activeName}
              {activeSymbol && (
                <MovingXoMark symbol={activeSymbol} className="size-[22px]" />
              )}
            </span>
          )
        }
      />

      <div className="flex flex-col gap-7 lg:flex-row lg:items-stretch">
        {won ? (
          <main
            data-testid="moving-xo-win"
            className={cn(
              "flex min-w-0 flex-1 flex-col justify-center gap-[18px] bg-[hsl(var(--brand-gold))] px-[34px] py-7 text-[hsl(var(--brand-navy))]",
              STICKER,
            )}
          >
            <p className="text-lg font-bold">نتيجة التحدي</p>
            <h2 className="flex items-center gap-3.5 font-display text-4xl font-black leading-snug lg:text-[56px]">
              {winner && (
                <TeamDot
                  className={teamIdentityOf(winner.id, teams).dot}
                  size={22}
                />
              )}
              فوز {winner?.name ?? "الفريق"}
            </h2>
            <p className="text-xl leading-relaxed">
              كمّلوا 3 في صف بعد{" "}
              <span className="akwaan-numeral">
                {view.successfulMoveCount}
              </span>{" "}
              حركات.
            </p>
            <p className="inline-flex min-h-12 items-center self-start rounded-full bg-[hsl(var(--brand-navy))] px-5 text-lg font-extrabold text-white">
              <span dir="ltr" className="akwaan-numeral me-1.5">
                +{doubled ? 2 : 1}
              </span>
              {doubled ? "نقطتين للمباراة" : "نقطة للمباراة"}
            </p>
          </main>
        ) : (
          <main
            className={cn(
              "flex min-w-0 flex-1 flex-col justify-center gap-6 bg-brand-paper px-[34px] py-7 text-[hsl(var(--brand-navy))]",
              STICKER,
            )}
          >
            {view.decisivePhase && !terminal && (
              <p
                role="status"
                data-testid="moving-xo-decisive"
                className="inline-flex min-h-[34px] items-center gap-2 self-start rounded-full border-2 border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))] px-3.5 text-base font-extrabold"
              >
                الحسم
                <span className="text-sm font-semibold">كل علامة تبقى</span>
              </p>
            )}

            {phase === "question-pending" && (
              <div
                role="status"
                data-testid="moving-xo-question-pending"
                className="flex min-h-40 flex-col items-center justify-center gap-3 text-center"
              >
                <span
                  aria-hidden
                  className="size-3 animate-pulse rounded-full bg-[hsl(var(--brand-gold))] motion-reduce:animate-none"
                />
                <p className="font-display text-2xl font-extrabold">
                  نجهّز اللغز الجاي…
                </p>
              </div>
            )}

            {phase === "answering" && view.question && (
              <>
                <p className="inline-flex min-h-[34px] items-center self-start rounded-full border-2 border-[hsl(var(--brand-navy))] bg-brand-lavender px-3.5 text-base font-bold">
                  جاوبوا صح عشان تلعبون حركتكم
                  {holderName && (
                    <span
                      data-testid="moving-xo-turn-holder"
                      className="ms-1.5 font-semibold text-brand-plum"
                    >
                      · الجوال مع <bdi>{holderName}</bdi>
                    </span>
                  )}
                </p>
                <div className="flex flex-wrap items-center gap-7">
                  <div className="min-w-0 flex-1 basis-[22rem]">
                    <MovingXoQuestion question={view.question} />
                  </div>
                  {timer}
                </div>
              </>
            )}

            {phase === "placement" && (
              <div
                data-testid="moving-xo-placement-message"
                className="flex flex-col gap-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <span className="inline-flex min-h-10 -rotate-3 items-center rounded-[10px] border-[3px] border-success bg-white px-4 text-lg font-extrabold text-success">
                    جاوبوا صح
                  </span>
                  {timer}
                </div>
                <h2 className="font-display text-4xl font-black leading-normal lg:text-5xl">
                  {activeName} يختار خانته
                </h2>
                <p className="text-xl leading-relaxed text-brand-slate">
                  الخانات المتاحة محددة بالذهبي، والاختيار من جوال{" "}
                  {holderName ? (
                    <bdi
                      data-testid="moving-xo-turn-holder"
                      className="font-bold text-[hsl(var(--brand-navy))]"
                    >
                      {holderName}
                    </bdi>
                  ) : (
                    "الفريق"
                  )}
                  .
                </p>
              </div>
            )}

            {terminal && view.outcome === "draw" && (
              <div data-testid="moving-xo-draw" className="text-center">
                <p className="font-display text-4xl font-black">تعادل</p>
                <p className="mt-2 text-lg font-semibold text-brand-slate">
                  امتلت اللوحة وما أحد كمّل 3 في صف.
                </p>
              </div>
            )}

            {terminal && view.outcome !== "draw" && (
              <div
                data-testid="moving-xo-neutral-completion"
                className="text-center"
              >
                <p className="font-display text-2xl font-extrabold">
                  {MOVING_XO_CONTENT_EXHAUSTED_COPY}
                </p>
              </div>
            )}
          </main>
        )}

        <aside
          className={cn(
            "flex flex-none flex-col items-center justify-between gap-4 bg-brand-paper px-7 py-6 lg:w-[540px]",
            STICKER,
          )}
        >
          <MovingXoLegend
            teams={teams}
            dotOf={(teamId) => teamIdentityOf(teamId, teams).dot}
          />
          <MovingXoBoard
            board={view.board}
            teams={teams}
            availableCells={openCells}
            {...(movingCell !== undefined ? { expiringCell: movingCell } : {})}
            winningLine={winningLine}
          />
          <p
            data-testid="moving-xo-board-note"
            className="max-w-[470px] text-center text-[15px] font-semibold leading-relaxed text-brand-plum"
          >
            {boardNote}
          </p>
        </aside>
      </div>

      <p
        data-testid="moving-xo-status-line"
        role="status"
        className="text-[17px] font-semibold text-brand-slate"
      >
        {status}
      </p>
    </section>
  );
}
