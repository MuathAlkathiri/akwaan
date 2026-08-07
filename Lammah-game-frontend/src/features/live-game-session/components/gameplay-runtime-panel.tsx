"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Activity, History, PlayCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createGameplayRuntime } from "../api/live-session-api";
import { useLiveSession } from "../hooks/live-session-context";
import { GameplayInteractionPanel } from "./gameplay-interaction-panel";
import { BombGameplayPanel } from "./bomb-gameplay-panel";
import { Top5Panel } from "./top5-panel";
import { RyoGameplayPanel } from "./ryo-gameplay-panel";

const labels: Record<string, string> = {
  "runtime:start": "Start runtime",
  "round:create": "Create round",
  "round:start": "Start round",
  "round:pause": "Pause round",
  "round:resume": "Resume round",
  "round:complete": "Complete round",
  "round:cancel": "Cancel round",
  "runtime:complete": "Complete runtime",
  "runtime:cancel": "Cancel runtime",
  "mode:advance-phase": "Advance neutral phase",
};

function socketAction(action: string): string {
  if (action.startsWith("mode:")) return "gameplay-command";
  return action;
}

export function GameplayRuntimePanel() {
  const { snapshot, connection, gameplayCommand } = useLiveSession();
  if (!snapshot) return null;
  const debugEnabled = process.env.NEXT_PUBLIC_LIVE_GAME_DEBUG === "true";
  const runtime = snapshot.gameplay;
  if (!runtime) {
    if (snapshot.mode.key === "bomb" && !debugEnabled) {
      return (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            Recovering Bomb gameplay…
          </CardContent>
        </Card>
      );
    }
    if (!snapshot.availableActions.includes("runtime:create")) return null;
    return <CreateRuntimeCard snapshot={snapshot} connection={connection} />;
  }
  if (runtime.mode.key === "bomb" && !debugEnabled) {
    return <BombGameplayPanel runtime={runtime} />;
  }
  if (runtime.mode.key === "top-5" && !debugEnabled) {
    return <Top5Panel runtime={runtime} />;
  }
  if (runtime.mode.key === "read-your-opponent") {
    return <RyoGameplayPanel runtime={runtime} />;
  }
  const round = runtime.activeRound;
  const activeTeam = snapshot.teams.find(
    (team) => team.id === round?.activeTeamId,
  );
  const activeParticipant = snapshot.participants.find(
    (participant) => participant.id === round?.activeParticipantId,
  );
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <PlayCircle className="size-5" aria-hidden />
          Gameplay runtime
        </CardTitle>
        <Badge variant="outline">{runtime.status}</Badge>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Runtime revision</dt>
            <dd className="font-medium">{runtime.revision}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Round</dt>
            <dd className="font-medium">
              {round ? `${round.sequence} · ${round.status}` : "None"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Active team</dt>
            <dd className="font-medium">{activeTeam?.name ?? "None"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Active player</dt>
            <dd className="font-medium">
              {activeParticipant?.displayName ?? "Any eligible player"}
            </dd>
          </div>
        </dl>
        <div className="rounded-lg bg-muted p-4">
          <p className="text-sm text-muted-foreground">Safe mode state</p>
          <p className="mt-1 font-mono text-lg">
            {String(round?.modeState.phase ?? runtime.modeState.phase)}
          </p>
        </div>
        {runtime.mode.key === "bomb" ? (
          <BombGameplayPanel runtime={runtime} />
        ) : runtime.mode.key === "top-5" ? (
          <Top5Panel runtime={runtime} />
        ) : runtime.mode.key === "read-your-opponent" ? (
          <RyoGameplayPanel runtime={runtime} />
        ) : (
          <GameplayInteractionPanel runtime={runtime} />
        )}
        {runtime.availableActions.length > 0 && (
          <div
            className="flex flex-wrap gap-2"
            aria-label="Gameplay runtime controls"
          >
            {runtime.availableActions
              .filter(
                (action) =>
                  !action.startsWith("interaction:") &&
                  !action.startsWith("submission:") &&
                  (!action.startsWith("mode:") ||
                    action === "mode:advance-phase"),
              )
              .map((action) => (
                <Button
                  key={action}
                  variant={
                    action.endsWith(":complete") || action.endsWith(":cancel")
                      ? "outline"
                      : "default"
                  }
                  disabled={connection !== "connected"}
                  onClick={() =>
                    gameplayCommand(socketAction(action), {
                      roundId: round?.id,
                      activeTeamId:
                        action === "round:create"
                          ? (snapshot.activeTeamId ??
                            snapshot.teams.find((team) => team.active)?.id)
                          : undefined,
                      reason:
                        action === "round:complete" ? "completed" : undefined,
                      commandType:
                        action === "mode:advance-phase"
                          ? "advance-phase"
                          : undefined,
                      payload: action === "mode:advance-phase" ? {} : undefined,
                    })
                  }
                >
                  {labels[action] ?? action}
                </Button>
              ))}
          </div>
        )}
        {runtime.transitions.length > 0 && (
          <section aria-labelledby="runtime-history-heading">
            <h3
              id="runtime-history-heading"
              className="flex items-center gap-2 font-medium"
            >
              <History className="size-4" aria-hidden />
              Recent transitions
            </h3>
            <ol className="mt-2 space-y-1 text-sm text-muted-foreground">
              {runtime.transitions.slice(-5).map((transition) => (
                <li key={`${transition.revision}-${transition.type}`}>
                  r{transition.revision} · {transition.type}
                </li>
              ))}
            </ol>
          </section>
        )}
      </CardContent>
    </Card>
  );
}

function CreateRuntimeCard({
  snapshot,
  connection,
}: {
  snapshot: import("../model").LiveSessionSnapshot;
  connection: import("../model").LiveSessionConnectionState;
}) {
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: () =>
      createGameplayRuntime(snapshot.sessionId, snapshot.revision),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["live-game-session", snapshot.sessionId],
      }),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Activity className="size-5" aria-hidden />
          Gameplay runtime
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Button
          onClick={() => create.mutate()}
          disabled={create.isPending || connection !== "connected"}
        >
          Create gameplay runtime
        </Button>
        {create.error && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            Unable to create the gameplay runtime.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
