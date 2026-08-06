import apiClient from "@/lib/api/client";
import type { LiveSessionSnapshot } from "../../model";
import type {
  MatchSelectableScope,
  MatchSelectableWorld,
  MatchSlotKey,
  MatchWorldSelectionMethod,
} from "../types";

const base = (sessionId: string) =>
  `/live-game-sessions/${sessionId}/match`;

const command = (expectedMatchRevision: number) => ({
  commandId: crypto.randomUUID(),
  expectedMatchRevision,
});

export async function createMatch(sessionId: string) {
  const response = await apiClient.post<LiveSessionSnapshot>(
    `${base(sessionId)}/create`,
  );
  return response.data;
}

export async function startMatch(sessionId: string, revision: number) {
  const response = await apiClient.post<LiveSessionSnapshot>(
    `${base(sessionId)}/start`,
    command(revision),
  );
  return response.data;
}

export async function resolveMatchCoinToss(
  sessionId: string,
  revision: number,
) {
  const response = await apiClient.post<LiveSessionSnapshot>(
    `${base(sessionId)}/coin-toss`,
    command(revision),
  );
  return response.data;
}

export async function listMatchWorlds(sessionId: string) {
  const response = await apiClient.get<MatchSelectableWorld[]>(
    `${base(sessionId)}/worlds`,
  );
  return response.data;
}

export async function selectMatchWorld(input: {
  sessionId: string;
  revision: number;
  method: MatchWorldSelectionMethod;
  worldId?: string;
  selectedByTeamId?: string;
}) {
  const response = await apiClient.post<LiveSessionSnapshot>(
    `${base(input.sessionId)}/worlds/select`,
    {
      ...command(input.revision),
      method: input.method,
      ...(input.worldId ? { worldId: input.worldId } : {}),
      ...(input.selectedByTeamId
        ? { selectedByTeamId: input.selectedByTeamId }
        : {}),
    },
  );
  return response.data;
}

export async function listMatchScopes(sessionId: string) {
  const response = await apiClient.get<MatchSelectableScope[]>(
    `${base(sessionId)}/scopes`,
  );
  return response.data;
}

export async function selectMatchScopes(input: {
  sessionId: string;
  revision: number;
  occurrenceIndex: number;
  scopeIds: string[];
}) {
  const response = await apiClient.post(`${base(input.sessionId)}/scopes/select`, {
    commandId: crypto.randomUUID(),
    expectedMatchRevision: input.revision,
    occurrenceIndex: input.occurrenceIndex,
    scopeIds: input.scopeIds,
  });
  return response.data;
}

export async function launchMatchChallenge(input: {
  sessionId: string;
  revision: number;
  occurrenceIndex: number;
  slotKey: MatchSlotKey;
  contentItemIds: string[];
  startingTeamId?: string;
}) {
  const response = await apiClient.post<LiveSessionSnapshot>(
    `${base(input.sessionId)}/challenges/launch`,
    {
      ...command(input.revision),
      occurrenceIndex: input.occurrenceIndex,
      slotKey: input.slotKey,
      contentItemIds: input.contentItemIds,
      ...(input.startingTeamId
        ? { startingTeamId: input.startingTeamId }
        : {}),
    },
  );
  return response.data;
}

export async function continueMatchWorld(
  sessionId: string,
  revision: number,
) {
  const response = await apiClient.post<LiveSessionSnapshot>(
    `${base(sessionId)}/worlds/continue`,
    command(revision),
  );
  return response.data;
}

export async function cancelMatch(sessionId: string, revision: number) {
  const response = await apiClient.post<LiveSessionSnapshot>(
    `${base(sessionId)}/cancel`,
    command(revision),
  );
  return response.data;
}
