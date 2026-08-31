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
  /**
   * When the current snapshot was adopted, for aligning server timestamps with
   * the client clock. Changes once per snapshot, not on every tick — the tick
   * itself lives in `useLiveSessionClock`.
   */
  snapshotReceivedAtMs?: number;
  syncState?: "idle" | "resynchronizing" | "restored";
  command: (action: string, options?: LiveSessionCommandOptions) => void;
  gameplayCommand: (action: string, options?: GameplayCommandOptions) => void;
  /**
   * Fair-start: acknowledge this surface can present the runtime at exactly these
   * revisions. The caller supplies the revisions from the snapshot it is looking
   * at, so delivery does not depend on any provider-internal ref catching up.
   * Resolves when the server accepts the acknowledgement and rejects on failure,
   * so the caller can pin a real success and retry a genuine failure. The server
   * activates once and is idempotent, so a duplicate acknowledgement is harmless.
   */
  presentationReady?: (input: {
    expectedSessionRevision: number;
    expectedRuntimeRevision: number;
  }) => Promise<void>;
  /**
   * Fair-start acknowledgement over the socket for the multi-surface contract
   * (RYO). The server derives the surface capability from the actor identity and
   * binds the ack to the exact connection (`client.id`), so a disconnect withdraws
   * it and the surface must acknowledge again. Rejects if there is no live socket.
   */
  presentationReadySocket?: (input: {
    expectedSessionRevision: number;
    expectedRuntimeRevision: number;
  }) => Promise<void>;
  adoptSnapshot?: (snapshot: LiveSessionSnapshot) => void;
  resync?: () => void;
  setMatchDouble?: (
    armed: boolean,
    assignmentSequence: number,
  ) => Promise<void>;
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
