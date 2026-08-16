"use client";

import { useCallback, useRef, useState } from "react";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { abortActiveChallenge } from "@/features/match-setup";
import { occurrenceLabel } from "@/features/match-setup";
import { useLiveSession } from "../../hooks/live-session-context";
import { MatchGameplayRenderer } from "../match-stage-router";
import { slotLabels, teamName } from "../presentation";
import { localizeMatchError } from "../errors/match-errors";
import type { MatchActor, MatchTeamStanding } from "../types";

/**
 * A challenge in progress.
 *
 * The header names the position from the board projection the Match already
 * carries, so it says the same thing the tile said. The gameplay itself belongs to
 * the mechanic's own renderer, which is chosen by the runtime's mode key — this
 * component never reaches into runtime state or moves the Match along.
 */
export function UnifiedChallengeStage({ actor }: { actor: MatchActor }) {
  const { snapshot, resync, adoptSnapshot } = useLiveSession();
  const [aborting, setAborting] = useState(false);
  const [abortError, setAbortError] = useState<string>();
  const abortCommandId = useRef<string>();
  const abort = useCallback(async () => {
    if (!snapshot?.gameplay || aborting) return;
    setAborting(true);
    setAbortError(undefined);
    abortCommandId.current ??= crypto.randomUUID();
    try {
      const next = await abortActiveChallenge({
        sessionId: snapshot.sessionId,
        expectedSessionRevision: snapshot.revision,
        expectedRuntimeRevision: snapshot.gameplay.revision,
        commandId: abortCommandId.current,
      });
      abortCommandId.current = undefined;
      adoptSnapshot?.(next);
    } catch (cause) {
      setAbortError(localizeMatchError(cause).message);
      resync?.();
    } finally {
      setAborting(false);
    }
  }, [aborting, adoptSnapshot, resync, snapshot]);
  const match = snapshot?.match;
  if (!snapshot || !match) return null;

  const current = match.currentChallenge;
  const position = current
    ? match.unified.board.positions.find(
        (candidate) =>
          candidate.occurrenceIndex === current.occurrenceIndex &&
          candidate.slotKey === current.slotKey,
      )
    : undefined;
  const standings: MatchTeamStanding[] =
    match.standings ??
    match.scoring.matchTotals.map((score) => ({
      ...score,
      name: teamName(snapshot, score.teamId),
    }));

  return (
    <div className="stage-center space-y-4" data-testid="unified-challenge">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius)] border border-border bg-card p-4">
        <div className="min-w-0">
          {current && (
            <p className="text-xs font-black text-primary">
              {occurrenceLabel(current.occurrenceIndex)}
              {position?.worldName ? ` · ${position.worldName}` : ""}
              {` · ${slotLabels[current.slotKey]}`}
            </p>
          )}
          <h1 className="mt-0.5 truncate text-xl font-black text-foreground">
            {position?.challengeName ?? "جارٍ استعادة التحدي"}
          </h1>
        </div>
        <ul className="flex list-none flex-wrap items-center gap-4">
          {standings.map((team) => (
            <li key={team.teamId} className="text-center">
              <p className="text-xs font-bold text-muted-foreground">{team.name}</p>
              <p className="text-2xl font-black akwaan-numeral text-foreground">
                {team.displayTotal}
              </p>
              {current?.doubledTeamIds?.includes(team.teamId) && (
                <p className="text-xs font-black text-warning">فعّل الدبل ×2</p>
              )}
            </li>
          ))}
        </ul>
      </header>

      {snapshot.gameplay ? (
        <MatchGameplayRenderer actor={actor} />
      ) : (
        <section
          data-testid="challenge-restoring"
          className="flex flex-col items-center gap-3 rounded-[var(--radius)] border border-border bg-card p-10 text-center"
        >
          <RefreshCw className="size-6 animate-spin text-disabled-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            جارٍ استعادة التحدي…
          </p>
          <button
            type="button"
            onClick={() => resync?.()}
            className="text-sm font-black text-primary underline underline-offset-4"
          >
            حاول الآن
          </button>
        </section>
      )}

      {actor === "controller" && (
        <div className="flex flex-col items-center gap-2 text-center">
          <Button
            type="button"
            variant="outline"
            disabled={aborting || !snapshot.gameplay}
            onClick={abort}
            className="font-black"
          >
            {aborting ? (
              <RefreshCw className="size-4 animate-spin" aria-hidden />
            ) : (
              <ArrowLeft className="size-4" aria-hidden />
            )}
            {aborting ? "جارٍ إلغاء التحدي…" : "العودة إلى اللوحة"}
          </Button>
          {abortError && (
            <p role="alert" className="text-sm font-bold text-destructive">
              {abortError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
