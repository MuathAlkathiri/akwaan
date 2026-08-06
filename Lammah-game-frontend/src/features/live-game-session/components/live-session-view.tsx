"use client";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLiveSession } from "../hooks/live-session-context";
import { SessionConnectionStatus } from "./session-connection-status";
import { SessionControls } from "./session-controls";
import { TeamClockList } from "./team-clock-list";
import { JoinAccessPanel } from "./join-access-panel";
import { ParticipantLobby } from "./participant-lobby";
import { GameplayRuntimePanel } from "./gameplay-runtime-panel";
import { ControllerMatchView } from "../match/views";

export function LiveSessionView() {
  const { snapshot, error } = useLiveSession();
  if (error && !snapshot) {
    return (
      <Card role="alert" className="border-destructive">
        <CardHeader>
          <CardTitle>Live session unavailable</CardTitle>
        </CardHeader>
        <CardContent>{error.message}</CardContent>
      </Card>
    );
  }
  if (!snapshot) {
    return (
      <div className="space-y-4" aria-label="Loading live session">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  return (
    <main className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            Internal realtime engine demo
          </p>
          <h1 className="text-3xl font-bold">Live session</h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{snapshot.status}</Badge>
          <SessionConnectionStatus />
        </div>
      </header>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      )}
      <ControllerMatchView />
      {snapshot.match ? null : (
        <>
      <TeamClockList />
      <SessionControls />
      <GameplayRuntimePanel />
      <JoinAccessPanel sessionId={snapshot.sessionId} />
      <ParticipantLobby />
        </>
      )}
    </main>
  );
}
