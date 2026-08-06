"use client";

import { useCallback, useRef, useState } from "react";
import { Layers } from "lucide-react";
import { prepareUnifiedChallenge } from "@/features/match-setup";
import { occurrenceLabel } from "@/features/match-setup";
import { useLiveSession } from "../../hooks/live-session-context";
import { UnifiedBoardTile } from "./unified-board-tile";
import { localizeMatchError } from "../errors/match-errors";
import { teamName } from "../presentation";
import type {
  MatchActor,
  MatchTeamStanding,
  UnifiedBoardPosition,
} from "../types";

/**
 * The Match board: three World occurrences and their twelve challenges, all at once.
 *
 * There is no order here. Every available position is equally launchable, whichever
 * occurrence it belongs to, and a completed one stays where it is — so the board
 * always reads as the whole Match rather than a queue. Two occurrences of the same
 * World are two separate groups with two separate Scope pools, because that is what
 * they are.
 */
export function UnifiedBoard({ actor }: { actor: MatchActor }) {
  const { snapshot, resync } = useLiveSession();
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState<string>();
  // Fixed per chosen position, so a retry of the same click is a replay to the
  // server rather than a second preparation.
  const commandId = useRef<string>();

  const match = snapshot?.match;
  const unified = match?.unified;

  /**
   * Choosing a tile *prepares* it; it does not start it.
   *
   * That is the fix this phase exists for: a phone-required runtime used to be
   * created here and then fail because the players were not in the room. The
   * server now answers with a preflight, and the router renders it.
   */
  const prepare = useCallback(
    async (position: UnifiedBoardPosition) => {
      if (!snapshot || !match || pending) return;
      setPending(position.positionKey);
      setError(undefined);
      commandId.current ??= crypto.randomUUID();
      try {
        await prepareUnifiedChallenge({
          sessionId: snapshot.sessionId,
          expectedMatchRevision: match.revision,
          occurrenceIndex: position.occurrenceIndex,
          slotKey: position.slotKey,
          ...(unified?.selectingTeamId
            ? { selectingTeamId: unified.selectingTeamId }
            : {}),
          commandId: commandId.current,
        });
        commandId.current = undefined;
        // The snapshot is authoritative: the preflight comes from the server,
        // never from a local guess about what happened.
        resync?.();
      } catch (cause) {
        setError(localizeMatchError(cause).message);
      } finally {
        setPending(undefined);
      }
    },
    [match, pending, resync, snapshot, unified?.selectingTeamId],
  );

  if (!snapshot || !match || !unified) return null;
  const standings: MatchTeamStanding[] =
    match.standings ??
    match.scoring.matchTotals.map((score) => ({
      ...score,
      name: teamName(snapshot, score.teamId),
    }));
  const isController = actor === "controller";
  const board = unified.board;

  return (
    <div className="space-y-5" data-testid="unified-board">
      <BoardHeader
        standings={standings}
        selectingTeamName={
          unified.selectingTeamId
            ? (standings.find(
                (team) => team.teamId === unified.selectingTeamId,
              )?.name ?? teamName(snapshot, unified.selectingTeamId))
            : undefined
        }
        completed={board.completedPositionCount}
        total={board.totalPositionCount}
      />

      {error && (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      )}

      {unified.occurrences.map((occurrence) => (
        <section
          key={occurrence.occurrenceIndex}
          aria-label={occurrenceLabel(occurrence.occurrenceIndex)}
          data-testid={`unified-occurrence-${occurrence.occurrenceIndex}`}
          className="space-y-3 rounded-2xl border border-black/[0.05] bg-white/70 p-4"
        >
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-lg font-black text-slate-900">
              {occurrenceLabel(occurrence.occurrenceIndex)}
              {occurrence.worldName ? ` · ${occurrence.worldName}` : ""}
            </h3>
            <p className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
              <Layers className="size-3.5" aria-hidden />
              {occurrence.selectedScopes.length
                ? occurrence.selectedScopes
                    .map((scope) => scope.name || scope.scopeId)
                    .join(" · ")
                : `${occurrence.selectedScopeIds.length} نطاقات`}
            </p>
          </header>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {board.positions
              .filter(
                (position) =>
                  position.occurrenceIndex === occurrence.occurrenceIndex,
              )
              .map((position) => (
                <UnifiedBoardTile
                  key={position.positionKey}
                  position={position}
                  // Any available position, from any occurrence, at any time.
                  canSelect={
                    isController &&
                    position.status === "available" &&
                    position.launchability === "launchable" &&
                    match.availableActions.includes("match:launch-challenge")
                  }
                  pending={Boolean(pending)}
                  standings={standings}
                  onSelect={(chosen) => void prepare(chosen)}
                  onResume={() => resync?.()}
                />
              ))}
          </div>
        </section>
      ))}

      {!isController && (
        <p className="rounded-xl bg-white p-4 text-center text-sm text-slate-600">
          بانتظار المتحكّم لاختيار التحدي التالي.
        </p>
      )}
    </div>
  );
}

/** Scores, whose turn it is, and how much of the Match is done. */
function BoardHeader({
  standings,
  selectingTeamName,
  completed,
  total,
}: {
  standings: MatchTeamStanding[];
  selectingTeamName?: string;
  completed: number;
  total: number;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-black/[0.05] bg-white p-4">
      <ul className="flex list-none flex-wrap items-center gap-4">
        {standings.map((team) => (
          <li key={team.teamId} className="text-center">
            <p className="text-xs font-bold text-slate-500">{team.name}</p>
            <p className="text-2xl font-black tabular-nums text-slate-900">
              {team.displayTotal}
            </p>
          </li>
        ))}
      </ul>
      <div className="text-left">
        {selectingTeamName && (
          <p
            data-testid="selecting-team"
            className="text-sm font-black text-primary"
          >
            دور الاختيار: {selectingTeamName}
          </p>
        )}
        <p
          data-testid="board-progress"
          className="text-sm font-bold tabular-nums text-slate-500"
        >
          {completed}/{total}
        </p>
      </div>
    </header>
  );
}
