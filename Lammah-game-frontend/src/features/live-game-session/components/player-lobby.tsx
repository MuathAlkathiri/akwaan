"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLiveSession } from "../hooks/live-session-context";
import { SessionConnectionStatus } from "./session-connection-status";
import { GameplayRuntimePanel } from "./gameplay-runtime-panel";
import { useTeamClockDisplay } from "../hooks/use-team-clock-display";
import { BombGameplayPanel } from "./bomb-gameplay-panel";
import { ParticipantMatchView } from "../match/views";

export function PlayerLobby({ participantId }: { participantId: string }) {
  const { snapshot, command, connection, error, nowMs } = useLiveSession();
  const participant = snapshot?.participants.find(
    (item) => item.id === participantId,
  );
  const clock = useTeamClockDisplay(participant?.teamId ?? "");
  if (!snapshot) return null;
  if (!participant) {
    return (
      <Card role="alert" className="mx-auto mt-10 max-w-lg">
        <CardContent className="pt-6">
          This player is no longer enrolled in the game.
        </CardContent>
      </Card>
    );
  }
  if (snapshot.match) {
    return <ParticipantMatchView participantId={participantId} />;
  }
  const team = snapshot.teams.find((item) => item.id === participant.teamId);
  const countdown = snapshot.countdownEndsAt
    ? Math.max(
        0,
        Math.ceil((Date.parse(snapshot.countdownEndsAt) - nowMs) / 1000),
      )
    : undefined;
  if (snapshot.bombResult) {
    const won = participant.teamId === snapshot.bombResult.winnerTeamId;
    return (
      <main className="mx-auto max-w-lg py-10">
        <Card>
          <CardHeader>
            <CardTitle>
              {won ? "Congratulations! Your team won." : "Time is up"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-center">
            <p className="text-2xl font-bold">
              Winner: {snapshot.bombResult.winnerTeamName}
            </p>
            <p className="text-muted-foreground">
              {snapshot.bombResult.completionReason === "time_expired"
                ? `${snapshot.bombResult.loserTeamName} ran out of time.`
                : "All Bomb items were completed."}
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }
  const isBombActive =
    snapshot.mode.key === "bomb" &&
    !["waiting", "ready"].includes(snapshot.status);
  const isActiveRepresentative =
    snapshot.gameplay?.activeRound?.activeParticipantId === participant.id;
  const feedback = snapshot.gameplay?.transitions.at(-1)?.type;
  return (
    <main className="mx-auto max-w-lg space-y-5 py-10">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Player lobby</p>
          <h1 className="text-2xl font-bold">{participant.displayName}</h1>
        </div>
        <SessionConnectionStatus />
      </header>
      {connection !== "connected" && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-warning/35 bg-warning-subtle p-3 text-sm"
        >
          {connection === "connecting"
            ? "Connecting to the game…"
            : "Connection lost. Reconnecting to the game…"}
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>
            {isBombActive
              ? isActiveRepresentative
                ? "Your turn"
                : "Waiting for the other team"
              : "Waiting for the host"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              {team?.name ?? "Team assignment pending"}
            </Badge>
            <Badge variant={participant.ready ? "secondary" : "outline"}>
              {participant.ready ? "Ready" : "Not ready"}
            </Badge>
          </div>
          {countdown !== undefined ? (
            <div
              role="timer"
              aria-live="polite"
              className="rounded-[var(--radius)] bg-primary/10 p-6 text-center"
            >
              <p className="text-sm text-muted-foreground">Bomb starts in</p>
              <p className="text-6xl font-black text-primary">{countdown}</p>
            </div>
          ) : isBombActive ? (
            <div className="rounded-lg bg-muted p-4">
              <p className="text-sm text-muted-foreground">
                {team?.name ?? "Team"}
              </p>
              <p className="font-mono text-4xl font-bold tabular-nums">
                {clock.formatted}
              </p>
              {(feedback === "bomb-answer-correct" ||
                feedback === "bomb-answer-incorrect") && (
                <p
                  className={
                    feedback === "bomb-answer-correct"
                      ? "mt-2 text-sm text-success"
                      : "mt-2 text-sm text-destructive"
                  }
                  role="status"
                >
                  {feedback === "bomb-answer-correct"
                    ? "Correct — item advanced."
                    : "Incorrect — try again."}
                </p>
              )}
            </div>
          ) : (
            <Button
              className="w-full"
              onClick={() =>
                command(
                  participant.ready
                    ? "participant-not-ready"
                    : "participant-ready",
                )
              }
              disabled={!participant.teamId}
            >
              {participant.ready ? "Mark not ready" : "I’m ready"}
            </Button>
          )}
          {!participant.teamId && !isBombActive && (
            <p className="text-sm text-muted-foreground">
              Your host needs to assign a team before you can become ready.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error.message}
            </p>
          )}
        </CardContent>
      </Card>
      {snapshot.mode.key === "bomb" ? (
        snapshot.gameplay ? (
          <BombGameplayPanel runtime={snapshot.gameplay} />
        ) : (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              Waiting for the host to start Bomb.
            </CardContent>
          </Card>
        )
      ) : (
        <GameplayRuntimePanel />
      )}
    </main>
  );
}
