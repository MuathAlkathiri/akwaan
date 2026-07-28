"use client";

import { useMutation } from "@tanstack/react-query";
import { UserMinus } from "lucide-react";
import { ConfirmationDialog } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  assignParticipantTeam,
  removeLiveParticipant,
} from "../api/live-session-api";
import { useLiveSession } from "../hooks/live-session-context";

export function ParticipantLobby() {
  const { snapshot } = useLiveSession();
  const assign = useMutation({
    mutationFn: (input: { participantId: string; teamId: string }) =>
      assignParticipantTeam(
        snapshot!.sessionId,
        input.participantId,
        input.teamId,
        snapshot!.revision,
      ),
  });
  const remove = useMutation({
    mutationFn: (participantId: string) =>
      removeLiveParticipant(
        snapshot!.sessionId,
        participantId,
        snapshot!.revision,
      ),
  });
  if (!snapshot) return null;
  const players = snapshot.participants.filter(
    (participant) => participant.role !== "controller",
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">
          Player lobby ({snapshot.readiness.readyPlayers}/
          {snapshot.readiness.totalPlayers} ready)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {players.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No players have joined yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {players.map((participant) => (
              <li
                key={participant.id}
                className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_12rem_auto] sm:items-center"
              >
                <div>
                  <p className="font-medium">{participant.displayName}</p>
                  <div className="mt-1 flex gap-2">
                    <Badge
                      variant={participant.ready ? "secondary" : "outline"}
                    >
                      {participant.ready ? "Ready" : "Not ready"}
                    </Badge>
                    <Badge variant="outline">{participant.presence}</Badge>
                  </div>
                </div>
                <Select
                  value={participant.teamId}
                  onValueChange={(teamId: string) =>
                    assign.mutate({ participantId: participant.id, teamId })
                  }
                  disabled={
                    assign.isPending ||
                    (snapshot.mode.key === "bomb" &&
                      snapshot.status !== "waiting")
                  }
                >
                  <SelectTrigger
                    aria-label={`Team for ${participant.displayName}`}
                  >
                    <SelectValue placeholder="Assign team" />
                  </SelectTrigger>
                  <SelectContent>
                    {snapshot.teams
                      .filter((team) => team.active)
                      .map((team) => (
                        <SelectItem key={team.id} value={team.id}>
                          {team.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <ConfirmationDialog
                  trigger={
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Remove ${participant.displayName}`}
                      disabled={
                        snapshot.mode.key === "bomb" &&
                        snapshot.status !== "waiting"
                      }
                    >
                      <UserMinus className="size-4" aria-hidden />
                    </Button>
                  }
                  title={`Remove ${participant.displayName}?`}
                  description="Their participant credential will stop working immediately."
                  confirmLabel="Remove"
                  destructive
                  onConfirm={() => remove.mutate(participant.id)}
                />
              </li>
            ))}
          </ul>
        )}
        {(assign.error || remove.error) && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            Unable to update this player. Refresh and try again.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
