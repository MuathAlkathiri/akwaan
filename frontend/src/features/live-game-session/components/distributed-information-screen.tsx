"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { ChallengeCountdown } from "../match/components/challenge-countdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLiveSessionClock } from "../hooks/live-session-clock-context";
import { useLiveSession } from "../hooks/live-session-context";
import type { GameplayRuntimeSnapshot } from "../model";
import {
  DISTRIBUTED_CHALLENGE_NAME,
  DISTRIBUTED_PUZZLE_COUNT,
  DISTRIBUTED_STATUS_LABEL,
  parseDistributedProgress,
  remainingRaceSeconds,
  teamStatus,
} from "../match/distributed-information.presentation";

/**
 * "ركّبها" on the shared screen, and the same view the controller watches.
 *
 * It renders the public projection only: the race, the clock, and the result.
 * The server never puts a segment, an answer, an answerer, or a team's private
 * order in this projection, so there is nothing here to redact.
 */
export function DistributedInformationScreen({
  runtime,
}: {
  runtime: GameplayRuntimeSnapshot;
}) {
  const { snapshot } = useLiveSession();
  const nowMs = useLiveSessionClock();
  const state = runtime.modeState;
  const progress = useMemo(
    () => parseDistributedProgress(state.progressJson),
    [state.progressJson],
  );
  const teams = useMemo(
    () => new Map(snapshot?.teams.map((team) => [team.id, team.name]) ?? []),
    [snapshot?.teams],
  );
  const result = useMemo(() => {
    if (typeof state.resultJson !== "string") return undefined;
    try {
      return JSON.parse(state.resultJson) as {
        winnerTeamId: string | null;
        tie: boolean;
      };
    } catch {
      return undefined;
    }
  }, [state.resultJson]);
  const puzzleCount = Number(state.puzzleCount ?? DISTRIBUTED_PUZZLE_COUNT);
  const completed = state.phase === "completed";

  return (
    <Card dir="rtl" className="overflow-hidden border-border">
      <CardHeader className="bg-muted/50">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-2xl font-black">
            {DISTRIBUTED_CHALLENGE_NAME}
          </CardTitle>
          {!completed && (
            <ChallengeCountdown
              remainingMs={remainingRaceSeconds(state.deadlineAt, nowMs) * 1000}
            />
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <ul className="space-y-4">
          {progress.map((entry) => {
            const status = teamStatus(entry, nowMs, puzzleCount);
            return (
              <li key={entry.teamId} data-team-status={status}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-lg font-black">
                    {teams.get(entry.teamId) ?? entry.teamId}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge
                      variant={status === "locked" ? "destructive" : "secondary"}
                    >
                      {DISTRIBUTED_STATUS_LABEL[status]}
                    </Badge>
                    <span className="font-black akwaan-numeral">
                      {entry.solved}/{puzzleCount}
                    </span>
                  </span>
                </div>
                {/* A plain track keeps the race readable without pulling in a
                    primitive this design system does not have yet. */}
                <div className="h-3 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-muted0 transition-all"
                    style={{
                      width: `${(entry.solved / puzzleCount) * 100}%`,
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>

        {completed && (
          <div className="rounded-[var(--radius)] bg-success-subtle p-5 text-center">
            <p className="text-xl font-black text-success">
              {result?.tie
                ? "تعادل — لا نقطة لأي فريق"
                : `فاز ${teams.get(String(result?.winnerTeamId)) ?? ""}`}
            </p>
            {!result?.tie && result?.winnerTeamId && (
              <p className="mt-1 font-bold text-success">
                +1 نقطة مباراة
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
