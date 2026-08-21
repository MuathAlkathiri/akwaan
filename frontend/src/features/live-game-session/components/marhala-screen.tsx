"use client";

import { useMemo } from "react";
import { BidiText } from "@/components/akwaan/bidi-text";
import { AlertTriangle, Loader2, Rocket, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { teamIdentityOf } from "@/lib/team-identity";
import { ChallengeCountdown } from "../match/components/challenge-countdown";
import { MarhalaBoard } from "../match/components/marhala-board";
import { useInteractionDeadline } from "../hooks/use-interaction-deadline";
import { useLiveSession } from "../hooks/live-session-context";
import {
  useMarhalaTurnReplay,
  usePrefersReducedMotion,
} from "../hooks/use-marhala-turn-replay";
import {
  MARHALA_CHALLENGE_NAME,
  MARHALA_DIFFICULTY_LABEL,
  marhalaBandPreviews,
  marhalaPositionOf,
  marhalaPromptText,
  readMarhalaView,
  type MarhalaTile,
  type MarhalaView,
} from "../match/marhala.presentation";
import type { GameplayRuntimeSnapshot } from "../model";

/**
 * "المرحلة" on the shared screen — the board is the screen.
 *
 * The mechanic's whole decision is spatial: from tile 5, does سهل tuck you safely
 * onto 7, or does صعب risk the عطل on 9 for a shot at 11? A trivia card filling the
 * screen would make that decision invisible, so the board takes the room and the
 * question sits beside it, never on top of it.
 *
 * Everything here is read from the projection: positions, whose turn it is, which
 * bands the server still has content for, the prompt, the clock, and the committed
 * record of the last turn. Nothing is predicted — the landings shown for a band are
 * its whole range, never a guess at the roll.
 */
export function MarhalaScreen({
  runtime,
}: {
  runtime: GameplayRuntimeSnapshot;
}) {
  const { snapshot } = useLiveSession();
  const view = useMemo(
    () => readMarhalaView(runtime.modeState),
    [runtime.modeState],
  );
  const reducedMotion = usePrefersReducedMotion();
  const replay = useMarhalaTurnReplay({
    positions: view.positions,
    ...(view.lastTurn ? { lastTurn: view.lastTurn } : {}),
    reducedMotion,
  });
  const remainingMs = useInteractionDeadline(
    view.deadlineAt,
    view.phase === "completed",
  );
  const teams = (snapshot?.teams ?? []).map((team) => ({
    id: team.id,
    name: team.name,
  }));
  const teamName = (id: string) =>
    teams.find((team) => team.id === id)?.name ?? "الفريق";
  const activeIdentity = teamIdentityOf(view.activeTeamId, teams);
  // While the question is open the board shows what this band could still reach;
  // during the decision the bands carry their own destinations instead, so the
  // board is not painted with three overlapping sets at once.
  const highlight = view.phase === "question" ? view.possibleLandings : [];

  return (
    <section
      dir="rtl"
      data-testid="marhala-screen"
      data-marhala-phase={view.phase}
      className="space-y-3"
    >
      <header className="surface-card flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-[0.7rem] font-black text-muted-foreground">
            {MARHALA_CHALLENGE_NAME}
          </p>
          <p className="truncate text-lg font-black text-foreground">
            {view.phase === "completed" ? (
              "انتهى السباق"
            ) : (
              <>
                الدور <span className="akwaan-numeral">{view.turnNumber}</span>{" "}
                —{" "}
                <span className={activeIdentity.text}>
                  {teamName(view.activeTeamId)}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {view.selectedDifficulty && view.phase !== "completed" && (
            <BandChip view={view} />
          )}
          {remainingMs !== undefined && view.phase === "question" && (
            <ChallengeCountdown remainingMs={remainingMs} />
          )}
        </div>
      </header>

      {/* Board first and biggest; the side column supports it. On a laptop the
          whole 4×4 is readable without scrolling, which is the point of it. */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="surface-card p-3 sm:p-4">
          <MarhalaBoard
            teams={teams}
            positions={replay.positions}
            activeTeamId={view.activeTeamId}
            highlight={highlight}
            {...(replay.effect ? { effect: replay.effect } : {})}
            {...(replay.travellingTeamId
              ? { travellingTeamId: replay.travellingTeamId }
              : {})}
          />
        </div>

        <div className="space-y-3">
          <StandingsStrip view={view} teams={teams} replay={replay.positions} />
          {replay.replaying && replay.movement !== undefined ? (
            <MovementReveal
              movement={replay.movement}
              teamName={teamName(view.lastTurn?.teamId ?? "")}
              effect={replay.effect}
            />
          ) : view.phase === "difficulty-choice" ? (
            <DecisionPanel view={view} teamName={teamName(view.activeTeamId)} />
          ) : view.phase === "question-pending" ? (
            <PendingPanel view={view} />
          ) : view.phase === "question" ? (
            <QuestionPanel view={view} />
          ) : (
            <TerminalPanel view={view} teamName={teamName} />
          )}
          {!replay.replaying && view.lastTurn && view.phase !== "completed" && (
            <LastTurnLine view={view} teamName={teamName} />
          )}
        </div>
      </div>
    </section>
  );
}

function BandChip({ view }: { view: MarhalaView }) {
  const band = view.selectedDifficulty;
  if (!band) return null;
  const range = view.movementRanges[band];
  return (
    <span
      data-testid="marhala-selected-band"
      className="inline-flex items-center gap-1.5 rounded-full border border-primary/50 bg-primary/10 px-3 py-1 text-sm font-black text-foreground"
    >
      {MARHALA_DIFFICULTY_LABEL[band]}
      <span className="akwaan-numeral text-xs font-bold text-muted-foreground">
        {range.min}–{range.max}
      </span>
    </span>
  );
}

/** Where both teams stand, in words, beside the board that shows it. */
function StandingsStrip({
  view,
  teams,
  replay,
}: {
  view: MarhalaView;
  teams: Array<{ id: string; name: string }>;
  replay: Record<string, number>;
}) {
  return (
    <ul
      data-testid="marhala-standings"
      className="grid grid-cols-2 gap-2 text-center"
    >
      {teams.map((team) => {
        const identity = teamIdentityOf(team.id, teams);
        const position = replay[team.id] ?? marhalaPositionOf(view, team.id);
        const active = team.id === view.activeTeamId;
        return (
          <li
            key={team.id}
            data-testid={`marhala-standing-${team.id}`}
            className={cn(
              "rounded-[var(--radius)] border px-3 py-2",
              identity.surface,
              identity.border,
              active &&
                "ring-2 ring-offset-1 ring-offset-background " + identity.ring,
            )}
          >
            <p className={cn("truncate text-sm font-black", identity.text)}>
              {team.name}
            </p>
            <p className="text-xs font-bold text-muted-foreground">
              المربّع <span className="akwaan-numeral">{position}</span>
              {active && " · دورهم"}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The decision, laid out as a comparison rather than three buttons.
 *
 * Each band names the tiles it could actually land on from where the team stands,
 * and marks which of those are rewards, hazards or the finish — that comparison is
 * the mechanic. A band the server has no unseen content for is shown as spent
 * rather than hidden, so the room can see why it is not an option.
 */
function DecisionPanel({
  view,
  teamName,
}: {
  view: MarhalaView;
  teamName: string;
}) {
  const previews = marhalaBandPreviews(view);
  return (
    <div
      className="surface-card space-y-2.5 p-3 sm:p-4"
      data-testid="marhala-decision"
    >
      <div>
        <p className="text-sm font-black text-foreground">
          {teamName}: اختاروا مستوى الخطر
        </p>
        <p className="text-xs font-bold text-muted-foreground">
          من المربّع{" "}
          <span className="akwaan-numeral">
            {marhalaPositionOf(view, view.activeTeamId)}
          </span>{" "}
          — الاختيار من هواتفكم.
        </p>
      </div>
      <ul className="space-y-2">
        {previews.map((band) => (
          <li
            key={band.difficulty}
            data-testid={`marhala-band-${band.difficulty}`}
            data-band-available={band.available ? "true" : "false"}
            className={cn(
              "rounded-[var(--radius)] border px-3 py-2",
              band.available
                ? "border-border bg-card"
                : "border-dashed border-border bg-muted/40 opacity-70",
            )}
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-black text-foreground">
                {band.label}
                <span className="akwaan-numeral ms-1.5 text-xs font-bold text-muted-foreground">
                  {band.range.min}–{band.range.max}
                </span>
              </p>
              {band.available ? (
                <p className="text-[0.7rem] font-bold text-muted-foreground">
                  المربّعات المحتملة
                </p>
              ) : (
                <p
                  className="text-[0.7rem] font-black text-muted-foreground"
                  data-testid={`marhala-band-${band.difficulty}-spent`}
                >
                  لا أسئلة جديدة
                </p>
              )}
            </div>
            {band.available && (
              <ul className="mt-1.5 flex flex-wrap gap-1.5" dir="ltr">
                {band.tiles.map((tile) => (
                  <LandingChip key={tile.position} tile={tile} />
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One reachable tile, named by what it does as well as by its number. */
function LandingChip({ tile }: { tile: MarhalaTile }) {
  const Icon =
    tile.kind === "boost" ? Rocket : tile.kind === "trap" ? Zap : undefined;
  return (
    <li
      data-testid={`marhala-landing-${tile.position}`}
      data-landing-kind={tile.kind}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-black",
        tile.kind === "boost" &&
          "border-brand-gold/60 bg-brand-gold/15 text-brand-gold",
        tile.kind === "trap" &&
          "border-destructive/50 bg-destructive/10 text-destructive",
        tile.kind === "finish" &&
          "border-brand-gold bg-brand-gold/25 text-brand-gold",
        tile.kind === "normal" && "border-border bg-muted/60 text-foreground",
      )}
    >
      <span className="akwaan-numeral">{tile.position}</span>
      {Icon && <Icon className="size-3" aria-hidden />}
      {tile.kind === "finish" && (
        <span dir="rtl" className="text-[0.65rem]">
          النهاية
        </span>
      )}
      {tile.kind === "boost" && (
        <span className="akwaan-numeral text-[0.65rem]">
          →{tile.destination}
        </span>
      )}
      {tile.kind === "trap" && (
        <span className="akwaan-numeral text-[0.65rem]">
          →{tile.destination}
        </span>
      )}
    </li>
  );
}

/**
 * The server is drawing the question.
 *
 * Normally invisible — the draw is discharged inside the same request that commits
 * the choice — so this exists for the reconnect that legitimately lands on it. It
 * keeps the board and the chosen band and claims nothing else.
 */
function PendingPanel({ view }: { view: MarhalaView }) {
  return (
    <div
      className="surface-card flex items-center gap-2 p-4"
      data-testid="marhala-pending"
      role="status"
    >
      <Loader2
        className="size-4 animate-spin text-muted-foreground"
        aria-hidden
      />
      <p className="text-sm font-black text-foreground">
        جارٍ تجهيز السؤال…
        {view.selectedDifficulty && (
          <span className="ms-1.5 text-xs font-bold text-muted-foreground">
            المستوى: {MARHALA_DIFFICULTY_LABEL[view.selectedDifficulty]}
          </span>
        )}
      </p>
    </div>
  );
}

function QuestionPanel({ view }: { view: MarhalaView }) {
  return (
    <div
      className="surface-card space-y-2 p-3 sm:p-4"
      data-testid="marhala-question"
    >
      <p className="text-xs font-black text-muted-foreground">
        السؤال — الإجابة من هواتف الفريق
      </p>
      <p className="text-xl font-black leading-snug text-foreground sm:text-2xl">
        <BidiText>{marhalaPromptText(view)}</BidiText>
      </p>
      {view.possibleLandings.length > 0 && (
        <p className="text-xs font-bold text-muted-foreground">
          الإجابة الصحيحة تنقلهم إلى أحد المربّعات{" "}
          <span className="akwaan-numeral" dir="ltr">
            {view.possibleLandings.join(" · ")}
          </span>
        </p>
      )}
    </div>
  );
}

/** The roll, then the tile that answered it. */
function MovementReveal({
  movement,
  teamName,
  effect,
}: {
  movement: number;
  teamName: string;
  effect?: { position: number; kind: "boost" | "trap" };
}) {
  return (
    <div
      className="surface-card space-y-1.5 p-4 text-center"
      data-testid="marhala-movement-reveal"
      data-movement={movement}
      role="status"
    >
      <p className="text-xs font-black text-muted-foreground">{teamName}</p>
      <p className="akwaan-numeral text-4xl font-black text-success">
        +{movement}
      </p>
      {effect && (
        <p
          data-testid={`marhala-effect-${effect.kind}`}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-black",
            effect.kind === "boost"
              ? "bg-brand-gold/20 text-brand-gold"
              : "bg-destructive/15 text-destructive",
          )}
        >
          {effect.kind === "boost" ? (
            <Rocket className="size-4" aria-hidden />
          ) : (
            <Zap className="size-4" aria-hidden />
          )}
          {effect.kind === "boost" ? "قفزة!" : "عطل!"}
        </p>
      )}
    </div>
  );
}

/** What the last turn did, in one line, while the next team decides. */
function LastTurnLine({
  view,
  teamName,
}: {
  view: MarhalaView;
  teamName: (id: string) => string;
}) {
  const turn = view.lastTurn;
  if (!turn) return null;
  const name = teamName(turn.teamId);
  if (!turn.correct) {
    return (
      <p
        data-testid="marhala-last-turn"
        data-turn-outcome={turn.resolvedBy === "timeout" ? "timeout" : "wrong"}
        className="flex items-center justify-center gap-1.5 rounded-[var(--radius)] border border-border bg-muted/50 px-3 py-2 text-sm font-bold text-muted-foreground"
      >
        <AlertTriangle className="size-3.5" aria-hidden />
        {turn.resolvedBy === "timeout"
          ? `انتهى وقت ${name} — بقوا في مكانهم`
          : `إجابة ${name} غير صحيحة — بقوا في مكانهم`}
      </p>
    );
  }
  return (
    <p
      data-testid="marhala-last-turn"
      data-turn-outcome="correct"
      className="rounded-[var(--radius)] border border-border bg-muted/50 px-3 py-2 text-center text-sm font-bold text-muted-foreground"
    >
      {name} تقدّموا <span className="akwaan-numeral">{turn.movement}</span>
      {turn.tile === "boost" && " ثم قفزة"}
      {turn.tile === "trap" && " ثم عطل"}
      {" — "}المربّع <span className="akwaan-numeral">{turn.finalLanding}</span>
    </p>
  );
}

/**
 * The race is over, on the gameplay screen.
 *
 * The Match's own result stage owns the record and the reward; this is the moment
 * before it, so it says who won — or, when the account has simply run out of unseen
 * questions, says that plainly instead of dressing it as a draw.
 */
function TerminalPanel({
  view,
  teamName,
}: {
  view: MarhalaView;
  teamName: (id: string) => string;
}) {
  const result = view.result;
  if (result?.endedBy === "content-exhausted") {
    return (
      <div
        className="surface-card space-y-1.5 p-4 text-center"
        data-testid="marhala-exhausted"
        role="status"
      >
        <p className="text-lg font-black text-foreground">
          خلصت الأسئلة الجديدة المتاحة لهذا التحدي
        </p>
        <p className="text-sm font-bold text-muted-foreground">
          انتهى السباق دون فائز، ولم تُمنح نقاط لهذا التحدي.
        </p>
      </div>
    );
  }
  return (
    <div
      className="surface-card space-y-1.5 p-4 text-center"
      data-testid="marhala-finished"
      role="status"
    >
      <p className="text-xs font-black text-muted-foreground">وصلوا النهاية</p>
      <p className="text-2xl font-black text-foreground">
        {result?.winnerTeamId ? teamName(result.winnerTeamId) : "انتهى السباق"}
      </p>
    </div>
  );
}
