import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The regression this file exists for: finishing setup must put the host in the
 * waiting room.
 *
 * Setup used to ready and start the session before creating the Match, so the
 * snapshot the host landed on was already `active` and the stage router opened
 * the board — with nobody joined and no way in. The waiting room built for that
 * moment was unreachable from setup.
 *
 * Nothing here is stubbed above the HTTP transport. The real setup orchestration
 * runs against a small stand-in for the server that keeps the one fact that
 * matters — the session's status — and moves it exactly as the server does when
 * the session is readied, started or begun. If setup ever starts the session
 * again, the snapshot comes back `active`, the router hands over the board, and
 * this fails.
 */

const server = vi.hoisted(() => ({ status: "waiting", revision: 0 }));

vi.mock("@/lib/api/client", () => {
  const ok = <T,>(data: T) => Promise.resolve({ data });
  const sessionSnapshot = () => ({
    sessionId: "session-1",
    revision: server.revision,
    status: server.status,
    availableActions: server.status === "active" ? [] : ["begin"],
    teams: [
      { id: "team-blue", name: "الأزرق", active: true },
      { id: "team-red", name: "الأحمر", active: true },
    ],
    participants: [],
  });
  return {
    default: {
      post: (url: string) => {
        if (url === "/live-game-sessions") {
          server.status = "waiting";
          server.revision = 0;
          return ok({
            reconnectToken: "reconnect-token",
            snapshot: sessionSnapshot(),
          });
        }
        // The lifecycle moves the real server makes, so a regression that
        // brings any of them back changes what the host lands on.
        const transitions: Record<string, string> = {
          "/ready": "ready",
          "/start": "active",
          "/begin": "active",
        };
        const move = Object.keys(transitions).find((suffix) =>
          url.endsWith(suffix),
        );
        if (move) {
          server.status = transitions[move];
          server.revision += 1;
          return ok(sessionSnapshot());
        }
        if (url.endsWith("/match/unified")) {
          return ok({
            ...sessionSnapshot(),
            match: {
              id: "match-1",
              revision: 0,
              setupMode: "unified_preconfigured",
              status: "active",
              stage: { key: "board" },
              standings: [],
              scoring: { matchTotals: [] },
              availableActions: [],
              unified: {
                occurrences: [],
                board: {
                  completedPositionCount: 0,
                  totalPositionCount: 12,
                  positions: [],
                },
                selectingTeamId: "team-blue",
              },
            },
          });
        }
        return Promise.reject(new Error(`Unexpected request: ${url}`));
      },
      get: (url: string) => {
        if (url.endsWith("/join-access")) {
          return ok({
            joinCode: "YQ6WBTN",
            enabled: true,
            assignmentPolicy: "explicit",
            createdAt: "2026-01-01T00:00:00.000Z",
            expiresAt: "2026-01-01T02:00:00.000Z",
          });
        }
        return Promise.reject(new Error(`Unexpected request: ${url}`));
      },
    },
  };
});

import {
  cancelLiveSession,
  createLiveSession,
} from "@/features/live-game-session/api/live-session-api";
import { LiveSessionContext } from "@/features/live-game-session/hooks/live-session-context";
import { MatchStageRouter } from "@/features/live-game-session/match/match-stage-router";
import {
  createConfiguredMatch,
  createDraft,
  createUnifiedMatch,
  matchSetupReducer,
  type MatchSetupAction,
  type MatchSetupDraft,
} from "@/features/match-setup";

/** Three World occurrences, four Scopes each: a draft setup will accept. */
function completeDraft(): MatchSetupDraft {
  let draft = createDraft();
  for (const occurrenceIndex of [0, 1, 2]) {
    const actions: MatchSetupAction[] = [
      { type: "choose-world", occurrenceIndex, worldId: `world-${occurrenceIndex}` },
      ...[0, 1, 2, 3].map(
        (scope) =>
          ({
            type: "toggle-scope",
            occurrenceIndex,
            scopeId: `scope-${occurrenceIndex}-${scope}`,
          }) as MatchSetupAction,
      ),
      { type: "confirm-scopes" },
    ];
    draft = actions.reduce(matchSetupReducer, draft);
  }
  return draft;
}

describe("finishing match setup", () => {
  beforeEach(() => {
    server.status = "waiting";
    server.revision = 0;
  });

  it("leaves the session waiting and puts the host in the waiting room", async () => {
    const created = await createConfiguredMatch(completeDraft(), {
      createSession: createLiveSession,
      createMatch: createUnifiedMatch,
      cancelSession: cancelLiveSession,
    });

    expect(created.snapshot.status).toBe("waiting");

    // What the host's screen renders for the snapshot setup handed it.
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <LiveSessionContext.Provider
          value={
            {
              snapshot: created.snapshot,
              connection: "connected",
              command: vi.fn(),
            } as unknown as React.ContextType<typeof LiveSessionContext>
          }
        >
          <MatchStageRouter actor="controller" />
        </LiveSessionContext.Provider>
      </QueryClientProvider>,
    );

    expect(screen.getByTestId("waiting-room")).toBeInTheDocument();
    expect(screen.queryByTestId("unified-board")).not.toBeInTheDocument();
  });
});
