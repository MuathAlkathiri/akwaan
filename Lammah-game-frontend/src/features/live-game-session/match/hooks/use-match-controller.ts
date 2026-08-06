"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useLiveSession } from "../../hooks/live-session-context";
import {
  cancelMatch,
  continueMatchWorld,
  createMatch,
  launchMatchChallenge,
  listMatchWorlds,
  resolveMatchCoinToss,
  selectMatchWorld,
  startMatch,
} from "../api/match-api";
import { localizeMatchError } from "../errors/match-errors";
import type {
  MatchSlotKey,
  MatchWorldSelectionMethod,
} from "../types";

export type MatchControllerCommand =
  | { type: "create" }
  | { type: "start" }
  | { type: "coin-toss" }
  | {
      type: "select-world";
      worldId?: string;
      method: MatchWorldSelectionMethod;
      selectedByTeamId?: string;
    }
  | {
      type: "launch-challenge";
      occurrenceIndex: number;
      slotKey: MatchSlotKey;
      contentItemIds: string[];
      startingTeamId?: string;
    }
  | { type: "continue-world" }
  | { type: "cancel" };

export function useMatchController() {
  const { snapshot, adoptSnapshot, resync, connection } = useLiveSession();
  const sessionId = snapshot?.sessionId;
  const revision = snapshot?.match?.revision;
  const mutation = useMutation({
    mutationFn: async (input: MatchControllerCommand) => {
      if (!sessionId) throw new Error("Live session snapshot is unavailable");
      if (input.type === "create") return createMatch(sessionId);
      if (revision === undefined) throw new Error("Match snapshot is unavailable");
      switch (input.type) {
        case "start":
          return startMatch(sessionId, revision);
        case "coin-toss":
          return resolveMatchCoinToss(sessionId, revision);
        case "select-world":
          return selectMatchWorld({
            sessionId,
            revision,
            worldId: input.worldId,
            method: input.method,
            selectedByTeamId: input.selectedByTeamId,
          });
        case "launch-challenge":
          return launchMatchChallenge({
            sessionId,
            revision,
            occurrenceIndex: input.occurrenceIndex,
            slotKey: input.slotKey,
            contentItemIds: input.contentItemIds,
            startingTeamId: input.startingTeamId,
          });
        case "continue-world":
          return continueMatchWorld(sessionId, revision);
        case "cancel":
          return cancelMatch(sessionId, revision);
      }
    },
    onSuccess: (next) => adoptSnapshot?.(next),
    onError: (error) => {
      const localized = localizeMatchError(error);
      if (
        ["MATCH_STALE_REVISION", "STALE_REVISION", "CONCURRENT_UPDATE"].includes(
          localized.code,
        )
      ) {
        resync?.();
      }
    },
  });

  return {
    run: mutation.mutate,
    runAsync: mutation.mutateAsync,
    pending: mutation.isPending,
    pendingCommand: mutation.variables?.type,
    error: mutation.error ? localizeMatchError(mutation.error) : undefined,
    resetError: mutation.reset,
    connected: connection === "connected",
  };
}

export function useMatchWorlds(enabled = true) {
  const { snapshot } = useLiveSession();
  return useQuery({
    queryKey: ["match-worlds", snapshot?.sessionId],
    queryFn: () => listMatchWorlds(snapshot!.sessionId),
    enabled: enabled && Boolean(snapshot?.sessionId),
    staleTime: 30_000,
  });
}

