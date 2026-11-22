import apiClient from "@/lib/api/client";
import type {
  LiveSessionJoinAccess,
  LiveSessionJoinMetadata,
  LiveSessionJoinPolicy,
  LiveSessionSnapshot,
  ParticipantCredential,
} from "../model";

export interface CreateLiveSessionInput {
  modeKey?: string;
  modeVersion?: number;
  teamNames: string[];
  /** Positional against `teamNames`. See `src/lib/team-palette.ts`. */
  teamColorIds?: string[];
}

export interface JoinAccessInput {
  assignmentPolicy: LiveSessionJoinPolicy;
  teamScopeId?: string;
  maximumParticipantCount?: number;
  teamCapacity?: number;
  expiresInMinutes?: number;
}

export async function createJoinAccess(
  sessionId: string,
  input: JoinAccessInput,
) {
  const response = await apiClient.post<LiveSessionJoinAccess>(
    `/live-game-sessions/${sessionId}/join-access`,
    input,
  );
  return response.data;
}

export async function getJoinAccess(sessionId: string) {
  const response = await apiClient.get<LiveSessionJoinAccess>(
    `/live-game-sessions/${sessionId}/join-access`,
  );
  return response.data;
}

export async function regenerateJoinAccess(
  sessionId: string,
  input: JoinAccessInput,
) {
  const response = await apiClient.post<LiveSessionJoinAccess>(
    `/live-game-sessions/${sessionId}/join-access/regenerate`,
    input,
  );
  return response.data;
}

export async function revokeJoinAccess(sessionId: string) {
  const response = await apiClient.post<LiveSessionJoinAccess>(
    `/live-game-sessions/${sessionId}/join-access/revoke`,
  );
  return response.data;
}

export async function resolveJoinCode(joinCode: string) {
  const response = await apiClient.get<LiveSessionJoinMetadata>(
    `/live-game-session-join/${encodeURIComponent(joinCode)}`,
    { skipAuthRedirect: true },
  );
  return response.data;
}

export async function joinLiveSession(
  joinCode: string,
  input: {
    displayName: string;
    requestedTeamId?: string;
    /** The character the player picked; omitted to let the server assign one. */
    avatarKey?: string;
    joinRequestId: string;
    device?: { label?: string; platform?: string };
  },
) {
  const response = await apiClient.post<ParticipantCredential>(
    `/live-game-session-join/${encodeURIComponent(joinCode)}`,
    input,
    { skipAuthRedirect: true },
  );
  return response.data;
}

export async function reconnectLiveParticipant(credential: string) {
  const response = await apiClient.post<ParticipantCredential>(
    "/live-game-participants/reconnect",
    undefined,
    {
      headers: { Authorization: `Bearer ${credential}` },
      skipAuthRedirect: true,
    },
  );
  return response.data;
}

export async function setMatchDouble(
  sessionId: string,
  credential: string,
  input: {
    commandId: string;
    expectedMatchRevision: number;
    assignmentSequence: number;
    armed: boolean;
  },
) {
  const response = await apiClient.post<LiveSessionSnapshot>(
    `/live-game-sessions/${sessionId}/match/double`,
    input,
    {
      headers: { Authorization: `Bearer ${credential}` },
      skipAuthRedirect: true,
    },
  );
  return response.data;
}

/**
 * Sends a player's verdict on the question they were just shown.
 *
 * Fire and forget by design: a tap that fails to reach the server must not
 * interrupt a game being played in a room full of people, and a verdict is
 * worth nothing beside that. The caller shows the tap as taken either way.
 */
export async function recordContentSignal(
  credential: string,
  input: { contentItemId: string; kind: "liked" | "defect" },
): Promise<void> {
  await apiClient.post("/content-signals", input, {
    headers: { Authorization: `Bearer ${credential}` },
    skipAuthRedirect: true,
  });
}

export async function assignParticipantTeam(
  sessionId: string,
  participantId: string,
  teamId: string,
  revision: number,
) {
  const response = await apiClient.patch<LiveSessionSnapshot>(
    `/live-game-sessions/${sessionId}/participants/${participantId}/team`,
    { teamId, expectedRevision: revision, commandId: crypto.randomUUID() },
  );
  return response.data;
}

/**
 * Name a team's captain, or pass `null` for none (automatic rotation).
 * The host can change it during the Match.
 */
export async function setTeamCaptain(
  sessionId: string,
  teamId: string,
  participantId: string | null,
  revision: number,
) {
  const response = await apiClient.patch<LiveSessionSnapshot>(
    `/live-game-sessions/${sessionId}/teams/${teamId}/captain`,
    { participantId, expectedRevision: revision, commandId: crypto.randomUUID() },
  );
  return response.data;
}

export async function removeLiveParticipant(
  sessionId: string,
  participantId: string,
  revision: number,
) {
  const response = await apiClient.delete<LiveSessionSnapshot>(
    `/live-game-sessions/${sessionId}/participants/${participantId}`,
    {
      data: { expectedRevision: revision, commandId: crypto.randomUUID() },
    },
  );
  return response.data;
}

export async function createGameplayRuntime(
  sessionId: string,
  sessionRevision: number,
) {
  const response = await apiClient.post<LiveSessionSnapshot>(
    `/live-game-sessions/${sessionId}/runtime`,
    {
      commandId: crypto.randomUUID(),
      expectedSessionRevision: sessionRevision,
      modeKey: "core-round-runtime",
      modeVersion: 1,
    },
  );
  return response.data;
}

/**
 * Fair-start acknowledgement: tell the server this surface has adopted the exact
 * runtime/revision and can present the gameplay. The server activates the
 * challenge once and anchors the deadline to now.
 */
export async function acknowledgePresentationReady(
  sessionId: string,
  body: {
    commandId: string;
    expectedSessionRevision: number;
    expectedRuntimeRevision: number;
    presentationGeneration?: number;
  },
) {
  const response = await apiClient.post<LiveSessionSnapshot>(
    `/live-game-sessions/${sessionId}/runtime/presentation-ready`,
    body,
  );
  return response.data;
}

export async function createLiveSession(input: CreateLiveSessionInput) {
  const response = await apiClient.post<{
    snapshot: LiveSessionSnapshot;
    reconnectToken: string;
  }>("/live-game-sessions", {
    modeKey: "core-timed-turns",
    modeVersion: 1,
    ...input,
  });
  return response.data;
}

/**
 * Cancels a session. Used by pre-match setup to undo a session it created when the
 * Match itself could not be created, so no orphan session is left behind.
 */
export async function cancelLiveSession(
  sessionId: string,
  expectedRevision: number,
): Promise<LiveSessionSnapshot> {
  const response = await apiClient.post<LiveSessionSnapshot>(
    `/live-game-sessions/${sessionId}/cancel`,
    { commandId: crypto.randomUUID(), expectedRevision },
  );
  return response.data;
}

export async function getLiveSession(
  sessionId: string,
): Promise<LiveSessionSnapshot> {
  const response = await apiClient.get<LiveSessionSnapshot>(
    `/live-game-sessions/${sessionId}`,
  );
  return response.data;
}
