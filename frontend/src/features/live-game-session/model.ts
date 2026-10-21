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
  /**
   * Fair-start multi-surface shell: present only while a multi-surface mechanic
   * (RYO) is still awaiting activation. Carries this actor's safe surface
   * capability — never participant ids, teams, question content, or answers.
   */
  presentationSurface?: {
    running: boolean;
    /**
     * Whether this actor is one of the surfaces the server is waiting on.
     * Absent when the mechanic declares no required set, in which case any
     * valid actor's acknowledgement activates the presentation.
     */
    required?: boolean;
    capability?: "shared" | "answering" | "decision";
    /**
     * The server-issued recurring presentation generation, present only while a
     * recurring presentation is prepared. The surface echoes it verbatim on its
     * acknowledgement; the client never invents or increments a generation.
     */
    generation?: number;
    /**
     * The clip this surface is being asked to be ready for.
     *
     * Projected only to the `shared` capability — the surface that plays it —
     * and only while a presentation is held. A barrier that hid the asset it
     * was waiting on would be readiness in name only: the screen would
     * acknowledge, the clock would start, and the buffering would happen
     * afterwards. Nothing else about the item travels with it.
     */
    preloadAudioUrl?: string;
    /**
     * Which question is being held, counted from one. Held state is otherwise
     * redacted wholesale, so without this the waiting screen could only ever
     * name question 1 — which is wrong the moment an audio item 2 or 3 holds.
     */
    itemOrdinal?: number;
    /**
     * Why the barrier is stuck, when it is. A reason keyword only — it renders
     * on a television in front of both teams, so it names the class of failure
     * and nothing about the asset. `canRetry` is the server's answer to whether
     * THIS actor may act on it, so phones see the message and the host gets the
     * control.
     */
    failure?: {
      reason: "media-unavailable" | "autoplay-blocked" | "readiness-timeout";
      canRetry: boolean;
    };
  };
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
