"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bomb, CheckCircle2, Circle, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createLiveSession,
  startBombGameplay,
} from "@/features/live-game-session/api/live-session-api";
import { BombGameplayPanel } from "@/features/live-game-session/components/bomb-gameplay-panel";
import { JoinAccessPanel } from "@/features/live-game-session/components/join-access-panel";
import { LiveSessionProvider } from "@/features/live-game-session/components/live-session-provider";
import { ParticipantLobby } from "@/features/live-game-session/components/participant-lobby";
import { SessionConnectionStatus } from "@/features/live-game-session/components/session-connection-status";
import { TeamClockList } from "@/features/live-game-session/components/team-clock-list";
import { useLiveSessionClock } from "@/features/live-game-session/hooks/live-session-clock-context";
import { useLiveSession } from "@/features/live-game-session/hooks/live-session-context";

interface BombQuestionLaunchProps {
  gameId: string;
  gameQuestionId: string;
  categoryName: string;
  points: number;
}

export function BombQuestionLaunch(props: BombQuestionLaunchProps) {
  const started = useRef(false);
  const launch = useMutation({
    mutationFn: () =>
      createLiveSession({
        parentGameId: props.gameId,
        parentGameQuestionId: props.gameQuestionId,
        modeKey: "bomb",
        modeVersion: 1,
        teamNames: ["Team 1", "Team 2"],
      }),
  });

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    launch.mutate();
  }, [launch]);

  if (launch.isPending || !launch.data) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 py-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }
  if (launch.isError) {
    return (
      <Card role="alert" className="mx-auto mt-10 max-w-xl">
        <CardHeader>
          <CardTitle>Unable to open the Bomb lobby</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            The live session could not be created or recovered.
          </p>
          <Button asChild>
            <Link href={`/games/${props.gameId}`}>Back to board</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <LiveSessionProvider
      sessionId={launch.data.snapshot.sessionId}
      initialSnapshot={launch.data.snapshot}
    >
      <BombHostLaunchFlow {...props} />
    </LiveSessionProvider>
  );
}

function BombHostLaunchFlow({
  gameId,
  categoryName,
  points,
}: Omit<BombQuestionLaunchProps, "gameQuestionId">) {
  const { snapshot, connection, error } = useLiveSession();
  const nowMs = useLiveSessionClock();
  const queryClient = useQueryClient();
  const recoveryAttempt = useRef("");
  const startBomb = useMutation({
    mutationFn: (sessionId: string) => startBombGameplay(sessionId),
    onSuccess: (next) =>
      queryClient.setQueryData(
        ["live-game-session", next.sessionId],
        next,
      ),
  });

  useEffect(() => {
    if (!snapshot || snapshot.status !== "active" || startBomb.isPending) return;
    const complete =
      snapshot.gameplay?.status === "round-active" &&
      snapshot.gameplay.activeRound?.status === "active" &&
      Boolean(snapshot.activeTeamId);
    const key = `${snapshot.revision}:${snapshot.gameplay?.revision ?? "none"}`;
    if (complete || recoveryAttempt.current === key) return;
    recoveryAttempt.current = key;
    startBomb.mutate(snapshot.sessionId);
  }, [snapshot, startBomb]);

  if (!snapshot) return <Skeleton className="h-96 w-full" />;
  const players = snapshot.participants.filter(
    (participant) => participant.role === "team-player",
  );
  const representatives = snapshot.teams.map((team) => ({
    team,
    participant: players.find(
      (participant) =>
        participant.teamId === team.id && participant.connected,
    ),
  }));
  const canStart =
    representatives.length === 2 &&
    representatives.every(
      ({ participant }) => participant?.connected && participant.ready,
    );
  const isLobby = snapshot.status === "waiting" || snapshot.status === "ready";
  const winner = snapshot.teams.find(
    (team) => team.id === snapshot.result?.winnerTeamId,
  );
  const loser = snapshot.result?.winnerTeamId
    ? snapshot.teams.find((team) => team.id !== snapshot.result?.winnerTeamId)
    : undefined;
  const difficulty =
    points === 200 ? "Easy" : points === 400 ? "Medium" : "Hard";
  const countdown = snapshot.countdownEndsAt
    ? Math.max(0, Math.ceil((Date.parse(snapshot.countdownEndsAt) - nowMs) / 1000))
    : undefined;
  const debugEnabled =
    process.env.NEXT_PUBLIC_LIVE_GAME_DEBUG === "true";

  if (snapshot.bombResult) {
    return (
      <main className="mx-auto flex min-h-[70dvh] max-w-3xl items-center px-3 py-8">
        <Card className="w-full">
          <CardHeader className="text-center">
            <CardTitle className="text-4xl">
              الفائز: {snapshot.bombResult.winnerTeamName}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 text-center">
            <p className="text-lg text-muted-foreground">
              {snapshot.bombResult.completionReason === "time_expired"
                ? `انتهى وقت ${snapshot.bombResult.loserTeamName}`
                : "اكتملت جميع عناصر القنبلة"}
            </p>
            <Button asChild size="lg">
              <Link href={`/games/${gameId}`}>العودة إلى لوحة اللعبة</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-[calc(100dvh-7rem)] max-w-6xl space-y-6 px-3 py-5 md:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Bomb className="size-4 text-destructive" aria-hidden />
            Bomb · {difficulty} · {points} points
          </p>
          <h1 className="text-3xl font-bold">{categoryName}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{snapshot.status}</Badge>
          <SessionConnectionStatus />
        </div>
      </header>

      {isLobby ? (
        <>
          <TeamClockList />
          <Card>
            <CardHeader>
              <CardTitle>Bomb pre-game lobby</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground">
                Assign one representative to each team. Both representatives
                must join and mark themselves ready before the round can start.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {representatives.map(({ team, participant }) => (
                  <div key={team.id} className="rounded-lg border p-4">
                    <p className="font-semibold">{team.name}</p>
                    <p className="mt-2 flex items-center gap-2 text-sm">
                      {participant?.connected && participant.ready ? (
                        <CheckCircle2
                          className="size-4 text-emerald-600"
                          aria-hidden
                        />
                      ) : (
                        <Circle
                          className="size-4 text-muted-foreground"
                          aria-hidden
                        />
                      )}
                      {participant
                        ? `${participant.displayName} · Connected · ${participant.ready ? "Ready" : "Not ready"}`
                        : "No connected representative"}
                    </p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-3">
                {countdown !== undefined ? (
                  <div
                    role="timer"
                    aria-live="polite"
                    className="w-full rounded-xl bg-primary/10 p-6 text-center"
                  >
                    <p className="text-sm text-muted-foreground">
                      تبدأ القنبلة خلال
                    </p>
                    <p className="text-6xl font-black text-primary">
                      {countdown}
                    </p>
                  </div>
                ) : debugEnabled ? (
                  <Button
                    size="lg"
                    disabled={
                      !canStart ||
                      startBomb.isPending ||
                      connection !== "connected"
                    }
                    onClick={() => startBomb.mutate(snapshot.sessionId)}
                  >
                    <Play className="size-4" aria-hidden />
                    {startBomb.isPending ? "جاري البدء…" : "ابدأ القنبلة"}
                  </Button>
                ) : null}
                <Button asChild size="lg" variant="outline">
                  <Link href={`/games/${gameId}`}>Back to board</Link>
                </Button>
              </div>
              {!canStart && countdown === undefined && (
                <p className="text-sm text-muted-foreground">
                  Start unlocks when both teams have a ready representative.
                </p>
              )}
            </CardContent>
          </Card>
          <JoinAccessPanel sessionId={snapshot.sessionId} autoCreate />
          <ParticipantLobby />
        </>
      ) : (
        <>
          <TeamClockList />
          {snapshot.result && (
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-sm text-muted-foreground">Bomb completed</p>
                <p className="mt-1 text-3xl font-bold">
                  Winner: {winner?.name ?? "No winner"}
                </p>
                {loser && (
                  <p className="mt-2 text-muted-foreground">
                    {loser.name} ran out of time.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
          {snapshot.gameplay?.mode.key === "bomb" &&
          snapshot.gameplay.activeRound ? (
            <BombGameplayPanel runtime={snapshot.gameplay} />
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
                <p className="text-muted-foreground">
                  جارٍ استكمال تشغيل جولة القنبلة.
                </p>
                <Button
                  disabled={startBomb.isPending}
                  onClick={() => startBomb.mutate(snapshot.sessionId)}
                >
                  {startBomb.isPending ? "جاري البدء…" : "ابدأ القنبلة"}
                </Button>
              </CardContent>
            </Card>
          )}
          <Button asChild variant="outline">
            <Link href={`/games/${gameId}`}>Back to board</Link>
          </Button>
        </>
      )}
      {(error || startBomb.error) && (
        <p role="alert" className="text-sm text-destructive">
          Unable to synchronize the Bomb launch. Refresh to recover the same
          session.
        </p>
      )}
    </main>
  );
}
