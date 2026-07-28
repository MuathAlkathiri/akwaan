import apiClient from "@/lib/api/client";
import type {
  LiveSessionJoinAccess,
  LiveSessionJoinMetadata,
  LiveSessionJoinPolicy,
  LiveSessionSnapshot,
  ParticipantCredential,
} from "../model";

export interface CreateLiveSessionInput {
  parentGameId?: string;
  parentGameQuestionId?: string;
  modeKey?: string;
  modeVersion?: number;
  teamNames: string[];
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

export async function startBombGameplay(sessionId: string) {
  const response = await apiClient.post<LiveSessionSnapshot>(
    `/live-game-sessions/${sessionId}/runtime/bomb/start`,
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

export async function getLiveSession(
  sessionId: string,
): Promise<LiveSessionSnapshot> {
  const response = await apiClient.get<LiveSessionSnapshot>(
    `/live-game-sessions/${sessionId}`,
  );
  return response.data;
}
