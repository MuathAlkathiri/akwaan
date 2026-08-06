"use client";

import { createContext, useContext } from "react";
import type {
  LiveSessionConnectionState,
  LiveSessionError,
  LiveSessionSnapshot,
} from "../model";

export interface LiveSessionCommandOptions {
  teamId?: string;
  reason?: string;
  winnerTeamId?: string;
}

export interface GameplayCommandOptions {
  roundId?: string;
  activeTeamId?: string;
  activeParticipantId?: string;
  reason?: string;
  commandType?: string;
  payload?: Record<string, string | number | boolean | null>;
  submissionId?: string;
  accepted?: boolean;
  reasonCode?: string;
}

export interface LiveSessionContextValue {
  snapshot?: LiveSessionSnapshot;
  connection: LiveSessionConnectionState;
  error?: LiveSessionError;
  nowMs: number;
  snapshotReceivedAtMs?: number;
  syncState?: "idle" | "resynchronizing" | "restored";
  command: (action: string, options?: LiveSessionCommandOptions) => void;
  gameplayCommand: (action: string, options?: GameplayCommandOptions) => void;
  adoptSnapshot?: (snapshot: LiveSessionSnapshot) => void;
  resync?: () => void;
}

export const LiveSessionContext = createContext<LiveSessionContextValue | null>(
  null,
);

export function useLiveSession(): LiveSessionContextValue {
  const context = useContext(LiveSessionContext);
  if (!context) {
    throw new Error("useLiveSession must be used within LiveSessionProvider");
  }
  return context;
}

export function useLiveSessionConnection() {
  const { connection, error } = useLiveSession();
  return { connection, error };
}

export function useLiveSessionCommands() {
  return useLiveSession().command;
}

export function useActiveTurn() {
  const { snapshot } = useLiveSession();
  if (!snapshot?.activeTeamId) return undefined;
  return snapshot.teams.find((team) => team.id === snapshot.activeTeamId);
}
