import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What the setup journey actually puts on the wire.
 *
 * The real API modules and the real orchestration run here; only the HTTP
 * transport is replaced, and it records every request. That makes this the
 * frontend half of the creation contract — the backend half is
 * `test/integration/unified-match-api.integration-spec.ts`, which drives the same
 * four routes with the same body shape against a real Mongo and asserts the
 * answer is a `unified_preconfigured` Match at `board` with three occurrences,
 * four Scopes each, and twelve positions.
 */

const ANIME = "world-anime";
const FOOTBALL = "world-football";

interface RecordedRequest {
  method: "post";
  url: string;
  body?: unknown;
}

const recorded: RecordedRequest[] = [];
const responses = vi.hoisted(() => ({
  post: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  default: {
    post: (url: string, body?: unknown) => responses.post(url, body),
  },
}));

import {
  createConfiguredMatch,
  MatchSetupFailure,
} from "@/features/match-setup";
import {
  createLiveSession,
  cancelLiveSession,
} from "@/features/live-game-session/api/live-session-api";
import {
  createUnifiedMatch,
  markLiveSessionReady,
  startLiveSession,
} from "@/features/match-setup";
import {
  createDraft,
  matchSetupReducer,
  type MatchSetupAction,
  type MatchSetupDraft,
} from "@/features/match-setup";

const dependencies = {
  createSession: createLiveSession,
  markReady: markLiveSessionReady,
  startSession: startLiveSession,
  createMatch: createUnifiedMatch,
  cancelSession: cancelLiveSession,
};

const apply = (draft: MatchSetupDraft, ...actions: MatchSetupAction[]) =>
  actions.reduce(matchSetupReducer, draft);

/** Asserts the creation failed, and hands back the typed failure. */
async function expectFailure(draft: MatchSetupDraft): Promise<MatchSetupFailure> {
  try {
    await createConfiguredMatch(draft, dependencies);
  } catch (error) {
    expect(error).toBeInstanceOf(MatchSetupFailure);
    return error as MatchSetupFailure;
  }
  throw new Error("Expected the Match creation to fail");
}

const configure = (
  draft: MatchSetupDraft,
  occurrenceIndex: number,
  worldId: string,
  scopeIds: string[],
) =>
  apply(
    draft,
    { type: "choose-world", occurrenceIndex, worldId },
    ...scopeIds.map(
      (scopeId) =>
        ({ type: "toggle-scope", occurrenceIndex, scopeId }) as MatchSetupAction,
    ),
    { type: "confirm-scopes" },
  );

const ANIME_POOL = ["naruto", "bleach", "one-piece", "aot"];
const ANIME_POOL_2 = ["death-note", "jujutsu", "demon-slayer", "hxh"];
const FOOTBALL_POOL = ["world-cup", "epl", "spl", "ucl"];

/** Anime, Football, Anime again from a different four Scopes. */
const configuredDraft = () => {
  let draft = configure(createDraft(), 0, ANIME, ANIME_POOL);
  draft = configure(draft, 1, FOOTBALL, FOOTBALL_POOL);
  draft = configure(draft, 2, ANIME, ANIME_POOL_2);
  return apply(
    draft,
    { type: "go-to-teams" },
    { type: "set-team-name", index: 0, name: "البنفسجي" },
    { type: "set-team-name", index: 1, name: "الأخضر" },
  );
};

/** The board-stage snapshot the production endpoint answers with. */
const boardSnapshot = {
  sessionId: "session-1",
  revision: 4,
  status: "active",
  match: {
    id: "match-1",
    revision: 0,
    setupMode: "unified_preconfigured",
    status: "active",
    stage: { key: "board" },
    unified: {
      occurrences: [
        { occurrenceIndex: 0, worldId: ANIME, selectedScopeIds: ANIME_POOL },
        {
          occurrenceIndex: 1,
          worldId: FOOTBALL,
          selectedScopeIds: FOOTBALL_POOL,
        },
        { occurrenceIndex: 2, worldId: ANIME, selectedScopeIds: ANIME_POOL_2 },
      ],
      board: {
        positions: Array.from({ length: 12 }, (_, index) => ({
          positionKey: `${Math.floor(index / 4)}#slot_${(index % 4) + 1}`,
        })),
        totalPositionCount: 12,
        completedPositionCount: 0,
      },
      selectingTeamId: "team-a",
    },
  },
};

beforeEach(() => {
  recorded.length = 0;
  responses.post.mockReset();
  responses.post.mockImplementation((url: string, body?: unknown) => {
    recorded.push({ method: "post", url, body });
    if (url === "/live-game-sessions") {
      return Promise.resolve({
        data: {
          reconnectToken: "reconnect-token",
          snapshot: { sessionId: "session-1", revision: 0, status: "waiting" },
        },
      });
    }
    if (url.endsWith("/ready")) {
      return Promise.resolve({
        data: { sessionId: "session-1", revision: 1, status: "ready" },
      });
    }
    if (url.endsWith("/start")) {
      return Promise.resolve({
        data: { sessionId: "session-1", revision: 2, status: "active" },
      });
    }
    if (url.endsWith("/match/unified")) {
      return Promise.resolve({ data: boardSnapshot });
    }
    if (url.endsWith("/cancel")) {
      return Promise.resolve({
        data: { sessionId: "session-1", revision: 3, status: "cancelled" },
      });
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
});

describe("configured Match creation contract", () => {
  it("issues exactly four production requests, in order", async () => {
    const created = await createConfiguredMatch(configuredDraft(), dependencies);

    expect(recorded.map((request) => request.url)).toEqual([
      "/live-game-sessions",
      "/live-game-sessions/session-1/ready",
      "/live-game-sessions/session-1/start",
      "/live-game-sessions/session-1/match/unified",
    ]);
    // No development alias, and no sequential setup command anywhere.
    const wire = JSON.stringify(recorded);
    expect(wire).not.toContain("/development");
    expect(wire).not.toContain("/worlds/select");
    expect(wire).not.toContain("/scopes/select");
    expect(wire).not.toContain("/coin-toss");

    expect(created.sessionId).toBe("session-1");
    expect(created.reconnectToken).toBe("reconnect-token");
  });

  it("sends the two team names and no participants", () => {
    return createConfiguredMatch(configuredDraft(), dependencies).then(() => {
      expect(recorded[0].body).toEqual({
        teamNames: ["البنفسجي", "الأخضر"],
        modeKey: "core-timed-turns",
        modeVersion: 1,
      });
      expect(JSON.stringify(recorded[0].body)).not.toContain("participant");
    });
  });

  it("sends all three occurrences and all twelve Scope ids in one request", async () => {
    await createConfiguredMatch(configuredDraft(), dependencies);

    const request = recorded.at(-1)!;
    expect(request.url).toBe("/live-game-sessions/session-1/match/unified");
    expect(request.body).toEqual({
      occurrences: [
        { occurrenceIndex: 0, worldId: ANIME, selectedScopeIds: ANIME_POOL },
        {
          occurrenceIndex: 1,
          worldId: FOOTBALL,
          selectedScopeIds: FOOTBALL_POOL,
        },
        { occurrenceIndex: 2, worldId: ANIME, selectedScopeIds: ANIME_POOL_2 },
      ],
    });
    const occurrences = (request.body as { occurrences: unknown[] }).occurrences;
    expect(occurrences).toHaveLength(3);
    expect(
      occurrences.flatMap(
        (occurrence) => (occurrence as { selectedScopeIds: string[] }).selectedScopeIds,
      ),
    ).toHaveLength(12);
    // The repeated World carries its own pool, not its twin's.
    expect(
      (occurrences[0] as { selectedScopeIds: string[] }).selectedScopeIds,
    ).not.toEqual(
      (occurrences[2] as { selectedScopeIds: string[] }).selectedScopeIds,
    );
  });

  it("carries the lifecycle revisions it was given", async () => {
    await createConfiguredMatch(configuredDraft(), dependencies);

    expect(recorded[1].body).toMatchObject({ expectedRevision: 0 });
    expect(recorded[2].body).toMatchObject({ expectedRevision: 1 });
  });

  it("returns the board-stage snapshot the server answered with", async () => {
    const created = await createConfiguredMatch(configuredDraft(), dependencies);

    const match = created.snapshot.match!;
    expect(match.setupMode).toBe("unified_preconfigured");
    expect(match.stage.key).toBe("board");
    expect(match.unified?.occurrences).toHaveLength(3);
    expect(
      match.unified?.occurrences.map(
        (occurrence) => occurrence.selectedScopeIds.length,
      ),
    ).toEqual([4, 4, 4]);
    expect(match.unified?.board.positions).toHaveLength(12);
    expect(match.unified?.board.totalPositionCount).toBe(12);
    expect(
      new Set(
        match.unified?.board.positions.map((position) => position.positionKey),
      ).size,
    ).toBe(12);
  });

  it("cancels the session it created when the Match cannot be created", async () => {
    responses.post.mockImplementation((url: string, body?: unknown) => {
      recorded.push({ method: "post", url, body });
      if (url === "/live-game-sessions") {
        return Promise.resolve({
          data: {
            reconnectToken: "reconnect-token",
            snapshot: { sessionId: "session-1", revision: 0, status: "waiting" },
          },
        });
      }
      if (url.endsWith("/ready")) {
        return Promise.resolve({ data: { revision: 1 } });
      }
      if (url.endsWith("/start")) {
        return Promise.resolve({ data: { revision: 2 } });
      }
      if (url.endsWith("/match/unified")) {
        return Promise.reject({
          isAxiosError: true,
          response: {
            status: 400,
            data: {
              code: "SCOPE_NOT_IN_OCCURRENCE_WORLD",
              message: 'Scope "x" belongs to another World than occurrence 2',
            },
          },
        });
      }
      return Promise.resolve({ data: { revision: 3 } });
    });

    await expect(
      createConfiguredMatch(configuredDraft(), dependencies),
    ).rejects.toBeInstanceOf(MatchSetupFailure);

    const failure = await expectFailure(configuredDraft());
    expect(failure.detail.code).toBe("SCOPE_NOT_IN_OCCURRENCE_WORLD");
    // The server named occurrence 2, so that is where the host is sent back to.
    expect(failure.detail.occurrenceIndex).toBe(2);
    expect(failure.sessionRolledBack).toBe(true);
    expect(recorded.at(-1)!.url).toBe("/live-game-sessions/session-1/cancel");
  });

  it("never reaches the Match route when the session cannot be created", async () => {
    responses.post.mockImplementation((url: string, body?: unknown) => {
      recorded.push({ method: "post", url, body });
      return Promise.reject({
        isAxiosError: true,
        code: "ERR_NETWORK",
        message: "Network Error",
      });
    });

    const failure = await expectFailure(configuredDraft());

    expect(failure.sessionRolledBack).toBe(false);
    expect(recorded.map((request) => request.url)).toEqual([
      "/live-game-sessions",
    ]);
  });
});
