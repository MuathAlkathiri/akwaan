import apiClient from "@/lib/api/client";
import type { LiveSessionSnapshot } from "@/features/live-game-session/model";

/**
 * The production unified Match surface.
 *
 * One request creates the whole Match: three configured occurrences with four
 * Scopes each. The server validates all of it atomically, resolves the coin toss,
 * initialises the twelve board positions, and answers with the authoritative
 * snapshot already at its board stage. There is no follow-up command.
 */

export interface ConfiguredOccurrenceRequest {
  occurrenceIndex: number;
  worldId: string;
  /** Exactly four distinct Scope ids of that occurrence's World. */
  selectedScopeIds: string[];
}

export interface CreateUnifiedMatchRequest {
  occurrences: ConfiguredOccurrenceRequest[];
}

export async function createUnifiedMatch(
  sessionId: string,
  request: CreateUnifiedMatchRequest,
): Promise<LiveSessionSnapshot> {
  const response = await apiClient.post<LiveSessionSnapshot>(
    `/live-game-sessions/${sessionId}/match/unified`,
    request,
  );
  return response.data;
}

/**
 * Holds one board position without starting it.
 *
 * For a phone-required mechanic this is what a tile click does: the server reserves
 * the position, hands back the session's join code, and reports what the mechanic
 * needs. No runtime is created.
 */
export async function prepareUnifiedChallenge(input: {
  sessionId: string;
  expectedMatchRevision: number;
  occurrenceIndex: number;
  slotKey: string;
  selectingTeamId?: string;
  commandId?: string;
}): Promise<LiveSessionSnapshot> {
  const response = await apiClient.post<LiveSessionSnapshot>(
    `/live-game-sessions/${input.sessionId}/match/unified/challenges/prepare`,
    {
      commandId: input.commandId ?? crypto.randomUUID(),
      expectedMatchRevision: input.expectedMatchRevision,
      occurrenceIndex: input.occurrenceIndex,
      slotKey: input.slotKey,
      ...(input.selectingTeamId
        ? { selectingTeamId: input.selectingTeamId }
        : {}),
    },
  );
  return response.data;
}

/** Abandons a prepared position. Consumes nothing and changes no turn. */
export async function cancelUnifiedPreflight(input: {
  sessionId: string;
  expectedMatchRevision: number;
  commandId?: string;
}): Promise<LiveSessionSnapshot> {
  const response = await apiClient.post<LiveSessionSnapshot>(
    `/live-game-sessions/${input.sessionId}/match/unified/challenges/cancel`,
    {
      commandId: input.commandId ?? crypto.randomUUID(),
      expectedMatchRevision: input.expectedMatchRevision,
    },
  );
  return response.data;
}

/**
 * Leaves the challenge result screen.
 *
 * The one transition out of `challenge_result`: back to the board, or on to the
 * end of the Match. It awards nothing — every point was recorded when the
 * challenge resolved — so a double click or a retry cannot move a score.
 */
export async function continueFromChallengeResult(input: {
  sessionId: string;
  expectedMatchRevision: number;
  /** Reused across retries of the same click, so a replay changes nothing. */
  commandId?: string;
}): Promise<LiveSessionSnapshot> {
  const response = await apiClient.post<LiveSessionSnapshot>(
    `/live-game-sessions/${input.sessionId}/match/unified/challenges/continue`,
    {
      commandId: input.commandId ?? crypto.randomUUID(),
      expectedMatchRevision: input.expectedMatchRevision,
    },
  );
  return response.data;
}

/**
 * Launches one board position.
 *
 * The request names a position and nothing else — no ContentItem id, because the
 * server draws the content from that occurrence's own Scope pool. There is
 * deliberately no way to express a content choice from here.
 */
export async function launchUnifiedChallenge(input: {
  sessionId: string;
  expectedMatchRevision: number;
  occurrenceIndex: number;
  slotKey: string;
  /** The team whose turn it is; the server refuses any other. */
  selectingTeamId?: string;
  /** Reused across retries of the same click, so a replay changes nothing. */
  commandId?: string;
}): Promise<LiveSessionSnapshot> {
  const response = await apiClient.post<LiveSessionSnapshot>(
    `/live-game-sessions/${input.sessionId}/match/unified/challenges/launch`,
    {
      commandId: input.commandId ?? crypto.randomUUID(),
      expectedMatchRevision: input.expectedMatchRevision,
      occurrenceIndex: input.occurrenceIndex,
      slotKey: input.slotKey,
      ...(input.selectingTeamId
        ? { selectingTeamId: input.selectingTeamId }
        : {}),
    },
  );
  return response.data;
}

/** Leaves the lobby. Both steps carry the revision they were decided on. */
export async function markLiveSessionReady(
  sessionId: string,
  expectedRevision: number,
): Promise<LiveSessionSnapshot> {
  const response = await apiClient.post<LiveSessionSnapshot>(
    `/live-game-sessions/${sessionId}/ready`,
    { commandId: crypto.randomUUID(), expectedRevision },
  );
  return response.data;
}

export async function startLiveSession(
  sessionId: string,
  expectedRevision: number,
): Promise<LiveSessionSnapshot> {
  const response = await apiClient.post<LiveSessionSnapshot>(
    `/live-game-sessions/${sessionId}/start`,
    { commandId: crypto.randomUUID(), expectedRevision },
  );
  return response.data;
}
