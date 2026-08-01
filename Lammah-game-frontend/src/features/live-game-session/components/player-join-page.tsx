"use client";

import { useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Users } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  joinLiveSession,
  reconnectLiveParticipant,
  resolveJoinCode,
} from "../api/live-session-api";
import type { ParticipantCredential } from "../model";
import { participantCredentialStorage } from "../storage/participant-credential-storage";
import { LiveSessionProvider } from "./live-session-provider";
import { PlayerLobby } from "./player-lobby";

const formSchema = z.object({
  displayName: z
    .string()
    .trim()
    .max(40)
    .regex(/^[\p{L}\p{N} _-]*$/u, "Use letters and numbers only"),
  requestedTeamId: z.string().optional(),
});

type JoinForm = z.infer<typeof formSchema>;

export function PlayerJoinPage({ joinCode }: { joinCode: string }) {
  const [participant, setParticipant] = useState<ParticipantCredential>();
  const restoredCodeRef = useRef<string>();
  const metadata = useQuery({
    queryKey: ["live-game-session-join", joinCode],
    queryFn: () => resolveJoinCode(joinCode),
    retry: false,
  });
  const form = useForm<JoinForm>({
    resolver: zodResolver(formSchema),
    defaultValues: { displayName: "", requestedTeamId: undefined },
  });
  const reconnect = useMutation({
    mutationFn: reconnectLiveParticipant,
    onSuccess: (value) => {
      participantCredentialStorage.set(joinCode, value);
      setParticipant(value);
    },
    onError: () => participantCredentialStorage.remove(joinCode),
  });
  const join = useMutation({
    mutationFn: (values: JoinForm) => {
      const selectedTeam = metadata.data?.teams.find(
        (team) => team.id === values.requestedTeamId,
      );
      const teamOnlyJoin =
        metadata.data?.mode.key === "bomb" &&
        metadata.data.assignmentPolicy === "explicit";
      return joinLiveSession(joinCode, {
        requestedTeamId: values.requestedTeamId,
        displayName: teamOnlyJoin
          ? (selectedTeam?.name ?? "Team player")
          : values.displayName,
        joinRequestId: crypto.randomUUID(),
        device: {
          label: "Web browser",
          platform:
            typeof navigator === "undefined" ? undefined : navigator.platform,
        },
      });
    },
    onSuccess: (value) => {
      participantCredentialStorage.set(joinCode, value);
      setParticipant(value);
    },
  });

  useEffect(() => {
    if (restoredCodeRef.current === joinCode) return;
    restoredCodeRef.current = joinCode;
    const stored = participantCredentialStorage.get(joinCode);
    if (stored) {
      reconnect.mutate(stored.credential);
    }
  }, [joinCode, reconnect]);

  if (participant) {
    return (
      <LiveSessionProvider
        sessionId={participant.sessionId}
        participantCredential={participant.credential}
        initialSnapshot={participant.snapshot}
      >
        <PlayerLobby participantId={participant.participantId} />
      </LiveSessionProvider>
    );
  }
  if (metadata.isLoading || reconnect.isPending) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-10">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  if (metadata.error || !metadata.data) {
    return (
      <Card role="alert" className="mx-auto mt-10 max-w-lg border-destructive">
        <CardHeader>
          <CardTitle>Join code unavailable</CardTitle>
        </CardHeader>
        <CardContent>
          This code is invalid, expired, or no longer accepting players.
        </CardContent>
      </Card>
    );
  }
  const requiresTeam = metadata.data.assignmentPolicy === "explicit";
  const teamOnlyJoin = metadata.data.mode.key === "bomb" && requiresTeam;
  return (
    <Card className="mx-auto mt-10 max-w-lg">
      <CardHeader>
        <Badge variant="secondary" className="w-fit">
          <Users className="mr-1 size-3" aria-hidden />
          Live game
        </Badge>
        <CardTitle>Join the game</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            className="space-y-5"
            onSubmit={form.handleSubmit((values) => {
              if (requiresTeam && !values.requestedTeamId) {
                form.setError("requestedTeamId", {
                  message: "Select a team",
                });
                return;
              }
              if (!teamOnlyJoin && !values.displayName.trim()) {
                form.setError("displayName", {
                  message: "Enter your display name",
                });
                return;
              }
              join.mutate(values);
            })}
          >
            {!teamOnlyJoin && (
              <FormField
                control={form.control}
                name="displayName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display name</FormLabel>
                    <FormControl>
                      <Input autoComplete="nickname" maxLength={40} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            {requiresTeam && (
              <FormField
                control={form.control}
                name="requestedTeamId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Team</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a team" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {metadata.data.teams.map((team) => (
                          <SelectItem key={team.id} value={team.id}>
                            {team.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            {metadata.data.assignmentPolicy === "host-assigned" && (
              <p className="text-sm text-muted-foreground">
                The host will assign your team after you join.
              </p>
            )}
            {join.error && (
              <p role="alert" className="text-sm text-destructive">
                Unable to join. The game may be full or no longer available.
              </p>
            )}
            <Button type="submit" className="w-full" disabled={join.isPending}>
              <CheckCircle2 className="mr-2 size-4" aria-hidden />
              {join.isPending ? "Joining…" : "Join game"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
