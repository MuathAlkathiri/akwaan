import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { GameplayRuntimePanel } from "./components/gameplay-runtime-panel";
import { LiveSessionContext } from "./hooks/live-session-context";
import type { LiveSessionSnapshot } from "./model";
import { liveSessionReducer } from "./state/live-session-reducer";

const snapshot: LiveSessionSnapshot = {
  sessionId: "session-1",
  mode: { key: "core-timed-turns", version: 1 },
  status: "active",
  revision: 5,
  serverTimestamp: "2026-01-01T00:00:00.000Z",
  round: { number: 1 },
  teams: [
    {
      id: "team-1",
      name: "One",
      active: true,
      clock: {
        allocatedMs: 60_000,
        consumedMs: 0,
        remainingMs: 60_000,
        running: false,
        expired: false,
      },
    },
  ],
  participants: [],
  readiness: {
    canMarkSessionReady: true,
    readyPlayers: 0,
    totalPlayers: 0,
    readyTeamIds: [],
  },
  gameplay: {
    runtimeId: "runtime-1",
    sessionId: "session-1",
    status: "round-active",
    revision: 4,
    mode: {
      key: "core-round-runtime",
      version: 1,
      stateSchemaVersion: 1,
    },
    modeState: { phase: "presenting" },
    activeRound: {
      id: "round-1",
      sequence: 1,
      status: "active",
      activeTeamId: "team-1",
      modeState: { phase: "presenting" },
      transitionRevision: 4,
      createdAt: "2026-01-01T00:00:00.000Z",
      startedAt: "2026-01-01T00:00:01.000Z",
    },
    completedRounds: [],
    transitions: [
      {
        revision: 4,
        type: "round-started",
        roundId: "round-1",
        timestamp: "2026-01-01T00:00:01.000Z",
      },
    ],
    availableActions: ["round:pause", "mode:advance-phase"],
    serverTimestamp: "2026-01-01T00:00:01.000Z",
  },
  availableActions: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  startedAt: "2026-01-01T00:00:00.000Z",
  lastTransitionAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2026-01-02T00:00:00.000Z",
};

describe("gameplay runtime frontend", () => {
  it("renders the safe runtime projection and delegates server actions", () => {
    const gameplayCommand = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <LiveSessionContext.Provider
          value={{
            snapshot,
            connection: "connected",
            command: vi.fn(),
            gameplayCommand,
          }}
        >
          <GameplayRuntimePanel />
        </LiveSessionContext.Provider>
      </QueryClientProvider>,
    );
    expect(screen.getByText("presenting")).toBeInTheDocument();
    expect(screen.getByText("r4 · round-started")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Advance neutral phase" }),
    );
    expect(gameplayCommand).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      activeTeamId: undefined,
      reason: undefined,
      commandType: "advance-phase",
      payload: {},
    });
  });

  it("rejects stale runtime snapshots even when session revision is equal", () => {
    const state = {
      connection: "connected" as const,
      snapshot,
      snapshotReceivedAtMs: 1,
    };
    const next = liveSessionReducer(state, {
      type: "snapshot",
      snapshot: {
        ...snapshot,
        gameplay: { ...snapshot.gameplay!, revision: 3 },
      },
      receivedAtMs: 2,
    });
    expect(next).toBe(state);
  });

  it("renders no mutation controls for an observer projection", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <LiveSessionContext.Provider
          value={{
            snapshot: {
              ...snapshot,
              gameplay: { ...snapshot.gameplay!, availableActions: [] },
            },
            connection: "connected",
            command: vi.fn(),
            gameplayCommand: vi.fn(),
          }}
        >
          <GameplayRuntimePanel />
        </LiveSessionContext.Provider>
      </QueryClientProvider>,
    );
    expect(
      screen.queryByLabelText("Gameplay runtime controls"),
    ).not.toBeInTheDocument();
  });
});
