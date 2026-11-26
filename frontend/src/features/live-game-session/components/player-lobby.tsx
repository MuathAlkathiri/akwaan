"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLiveSession } from "../hooks/live-session-context";
import { SessionConnectionStatus } from "./session-connection-status";
import { ParticipantMatchView } from "../match/views";

/**
 * A player's phone between joining and the Match opening.
 *
 * Once a Match exists this hands over and never draws again, so what is left
 * is the short wait before it: the team they were put in, and the one control
 * they own — saying they are ready, which is what lets the host start.
 *
 * It used to carry a whole second game as well: a standalone Bomb run with its
 * own countdown, its own result screen and its own English copy. Sessions are
 * created with one mode now and always carry a Match, so none of that was
 * reachable from the app; it is gone, and the readiness control stayed.
 */
export function PlayerLobby({ participantId }: { participantId: string }) {
  const { snapshot, command, error } = useLiveSession();
  const participant = snapshot?.participants.find(
    (item) => item.id === participantId,
  );
  if (!snapshot) return null;
  if (!participant) {
    return (
      <Card role="alert" className="mx-auto mt-10 max-w-lg">
        <CardContent className="pt-6 text-center font-bold">
          ما عدت في هذي الجلسة. اطلب من المضيف يضيفك من جديد.
        </CardContent>
      </Card>
    );
  }
  if (snapshot.match) {
    return <ParticipantMatchView participantId={participantId} />;
  }
  const team = snapshot.teams.find((item) => item.id === participant.teamId);
  return (
    <main dir="rtl" className="mx-auto max-w-lg space-y-4 py-10">
      <SessionConnectionStatus />
      <Card>
        <CardHeader>
          <CardTitle className="font-black">
            {participant.ready ? "جاهز — ننتظر الباقين" : "بانتظار المضيف"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="font-bold">
              {team?.name ?? "لسا ما انحطيت في فريق"}
            </Badge>
            <Badge
              variant={participant.ready ? "secondary" : "outline"}
              className="font-bold"
            >
              {participant.ready ? "جاهز" : "مو جاهز"}
            </Badge>
          </div>
          <Button
            className="h-14 w-full text-lg font-black"
            onClick={() =>
              command(
                participant.ready ? "participant-not-ready" : "participant-ready",
              )
            }
            disabled={!participant.teamId}
          >
            {participant.ready ? "رجعني مو جاهز" : "أنا جاهز"}
          </Button>
          {!participant.teamId && (
            <p className="text-sm font-bold text-muted-foreground">
              المضيف لازم يحطك في فريق قبل ما تقدر تجهز.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm font-bold text-foreground">
              {error.message}
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
