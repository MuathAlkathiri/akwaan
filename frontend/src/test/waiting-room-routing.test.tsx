import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSessionContext } from "@/features/live-game-session/hooks/live-session-context";
import { MatchStageRouter } from "@/features/live-game-session/match/match-stage-router";
import type { LiveSessionSnapshot } from "@/features/live-game-session/model";

const api = vi.hoisted(() => ({ getJoinAccess: vi.fn() }));

vi.mock("@/features/live-game-session/api/live-session-api", async (load) => ({
  ...(await load<
    typeof import("@/features/live-game-session/api/live-session-api")
  >()),
  ...api,
}));

/**
 * Which screen the room gets before the first challenge.
 *
 * The Match exists from the moment it is set up, so without this branch the
 * shared screen opened straight onto a board with nothing played on it and no
 * way for anybody to join. The phone is the exception: it already has a waiting
 * screen of its own, on the page it joined on, and must keep it.
 */
const snapshot = (status: string) =>
  ({
    sessionId: "s1",
    revision: 3,
    status,
    availableActions: status === "active" ? [] : ["begin"],
    teams: [
      { id: "team-blue", name: "الأزرق", active: true },
      { id: "team-red", name: "الأحمر", active: true },
    ],
    participants: [
      { id: "p1", displayName: "ريم", role: "team-player", teamId: "team-blue", connected: true },
    ],
    match: {
      id: "m1",
      revision: 1,
      stage: { key: "board" },
      standings: [],
      scoring: { matchTotals: [] },
      unified: {
        // The board reads its own positions, so the running case needs a board
        // the real server would have sent rather than a stub.
        board: {
          completedPositionCount: 0,
          totalPositionCount: 12,
          positions: [],
        },
        selectingTeamId: "team-blue",
      },
      availableActions: [],
    },
  }) as unknown as LiveSessionSnapshot;

function mount(status: string, actor: "controller" | "shared-screen" | "participant") {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <LiveSessionContext.Provider
        value={
          {
            snapshot: snapshot(status),
            connection: "connected",
            command: vi.fn(),
          } as unknown as React.ContextType<typeof LiveSessionContext>
        }
      >
        <MatchStageRouter
          actor={actor}
          {...(actor === "participant" ? { participantId: "p1" } : {})}
        />
      </LiveSessionContext.Provider>
    </QueryClientProvider>,
  );
}

describe("what the screens show before the session starts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getJoinAccess.mockResolvedValue({
      joinCode: "YQ6WBTN",
      enabled: true,
      assignmentPolicy: "explicit",
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T02:00:00.000Z",
    });
  });

  it("gives the host the room, not an unplayed board", () => {
    mount("waiting", "controller");
    expect(screen.getByTestId("waiting-room")).toBeInTheDocument();
  });

  it("gives the shared screen the room too", () => {
    mount("waiting", "shared-screen");
    expect(screen.getByTestId("waiting-room")).toBeInTheDocument();
  });

  it("keeps the room up through ready, so the old flow is not a dead end", () => {
    mount("ready", "controller");
    expect(screen.getByTestId("waiting-room")).toBeInTheDocument();
  });

  it("leaves the phone on its own waiting screen", () => {
    mount("waiting", "participant");
    expect(screen.getByTestId("participant-waiting")).toBeInTheDocument();
    expect(screen.queryByTestId("waiting-room")).not.toBeInTheDocument();
  });

  it("hands the board over once the session is running", () => {
    mount("active", "controller");
    expect(screen.queryByTestId("waiting-room")).not.toBeInTheDocument();
  });
});
