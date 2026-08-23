import type { LiveSessionMatchSnapshot } from "./match/types";

export type LiveSessionStatus =
  | "waiting"
  | "ready"
  | "active"
  | "paused"
  | "finished"
  | "cancelled"
  | "expired";

export interface LiveSessionClockSnapshot {
  allocatedMs: number;
  consumedMs: number;
  remainingMs: number;
  startedAt?: string;
  running: boolean;
  expired: boolean;
}

export interface LiveSessionSnapshot {
  sessionId: string;
  parentGameId?: string;
  parentGameQuestionId?: string;
  mode: { key: string; version: number };
  status: LiveSessionStatus;
  revision: number;
  serverTimestamp: string;
  activeTeamId?: string;
  round: { number: number };
  currentTurn?: {
    sequence: number;
    teamId: string;
    startedAt: string;
    endedAt?: string;
    transitionReason: string;
  };
  teams: Array<{
    id: string;
    name: string;
    active: boolean;
    /**
     * The colour the host chose for this team, as a palette id. Absent on sessions
     * created before the pick existed, or derived from a parent game — the client
     * falls back to that position's default.
     */
    colorId?: string;
    clock: LiveSessionClockSnapshot;
  }>;
  participants: Array<{
    id: string;
    displayName: string;
    role: "controller" | "team-player" | "observer";
    teamId?: string;
    ready: boolean;
    joinedAt: string;
    connected: boolean;
    connectedDeviceCount: number;
    lastSeenAt: string;
    presence: "connected" | "temporarily-disconnected" | "stale" | "removed";
    device?: { label?: string; platform?: string };
  }>;
  readiness: {
    canMarkSessionReady: boolean;
    readyPlayers: number;
    totalPlayers: number;
    readyTeamIds: string[];
  };
  gameplay?: GameplayRuntimeSnapshot;
  match?: LiveSessionMatchSnapshot;
  result?: {
    reason: string;
    winnerTeamId?: string;
    finishedAt: string;
    metadata?: Record<string, string | number | boolean>;
  };
  bombResult?: {
    winnerTeamId: string;
    winnerTeamName: string;
    loserTeamId: string;
    loserTeamName: string;
    completionReason: "time_expired" | "items_completed";
    finalRemainingTimes: Record<string, number>;
  };
  availableActions: string[];
  createdAt: string;
  startedAt?: string;
  countdownEndsAt?: string;
  lastTransitionAt: string;
  expiresAt: string;
}

export interface GameplayRuntimeSnapshot {
  runtimeId: string;
  sessionId: string;
  status:
    | "initialized"
    | "awaiting-round"
    | "round-active"
    | "round-paused"
    | "between-rounds"
    | "completed"
    | "cancelled";
  revision: number;
  mode: { key: string; version: number; stateSchemaVersion: number };
  modeState: Record<string, string | number | boolean | null>;
  activeRound?: {
    id: string;
    sequence: number;
    status: "pending" | "active" | "paused" | "completed" | "cancelled";
    activeTeamId?: string;
    activeParticipantId?: string;
    modeState: Record<string, string | number | boolean | null>;
    transitionRevision: number;
    createdAt: string;
    startedAt?: string;
    pausedAt?: string;
    resumedAt?: string;
    interaction?: {
      id: string;
      revision: number;
      status:
        | "prepared"
        | "open"
        | "closed"
        | "adjudicating"
        | "resolved"
        | "cancelled"
        | "expired";
      prompt?: {
        id: string;
        type: string;
        schemaVersion: number;
        payload: Record<string, string | number | boolean | null>;
        visibleFrom?: string;
        deadlineAt?: string;
        metadata: Record<string, string | number | boolean | null>;
      };
      submissions: Array<{
        id: string;
        status: string;
        payload: Record<string, string | number | boolean | null>;
        receivedAt: string;
      }>;
      outcome?: {
        type: string;
        schemaVersion: number;
        payload: Record<string, string | number | boolean | null>;
        completionReason: string;
      };
    };
  };
  round?: { id: string; status: string };
  currentItem?: {
    id: string;
    index: number;
    totalItems: number;
    media?: {
      type: "none" | "image" | "audio";
      url?: string;
      altText?: string;
    };
    image?: { url: string; altText?: string };
  };
  prompt?: string;
  activeTeamId?: string;
  completedRounds: Array<{
    id: string;
    sequence: number;
    completedAt: string;
    completionReason: string;
  }>;
  transitions: Array<{
    revision: number;
    type: string;
    roundId?: string;
    timestamp: string;
  }>;
  availableActions: string[];
  serverTimestamp: string;
}

export type LiveSessionJoinPolicy = "explicit" | "balanced" | "host-assigned";

export interface LiveSessionJoinAccess {
  joinCode: string;
  assignmentPolicy: LiveSessionJoinPolicy;
  teamScopeId?: string;
  maximumParticipantCount?: number;
  teamCapacity?: number;
  createdAt: string;
  expiresAt: string;
  revokedAt?: string;
  enabled: boolean;
}

export interface LiveSessionJoinMetadata {
  available: true;
  mode: { key: string; version: number };
  status: LiveSessionStatus;
  assignmentPolicy: LiveSessionJoinPolicy;
  teams: Array<{ id: string; name: string; colorId?: string }>;
  expiresAt: string;
}

export interface ParticipantCredential {
  credential: string;
  credentialExpiresAt: string;
  participantId: string;
  sessionId: string;
  snapshot: LiveSessionSnapshot;
}

export type LiveSessionConnectionState =
  "connecting" | "connected" | "disconnected" | "reconnecting" | "error";

export interface LiveSessionError {
  code: string;
  message: string;
}
