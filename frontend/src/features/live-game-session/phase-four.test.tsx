import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GameplayInteractionPanel } from "./components/gameplay-interaction-panel";
import { LiveSessionClockContext } from "./hooks/live-session-clock-context";
import { LiveSessionContext } from "./hooks/live-session-context";
import type { GameplayRuntimeSnapshot } from "./model";

const runtime: GameplayRuntimeSnapshot = {
  runtimeId: "runtime-1",
  sessionId: "session-1",
  status: "round-active",
  revision: 8,
  mode: { key: "core-round-runtime", version: 1, stateSchemaVersion: 1 },
  modeState: { phase: "presenting" },
  activeRound: {
    id: "round-1",
    sequence: 1,
    status: "active",
    modeState: { phase: "presenting" },
    transitionRevision: 8,
    createdAt: "2026-01-01T00:00:00.000Z",
    interaction: {
      id: "interaction-1",
      revision: 3,
      status: "open",
      prompt: {
        id: "prompt-1",
        type: "development-signal",
        schemaVersion: 1,
        payload: { message: "Send a signal" },
        deadlineAt: "2026-01-01T00:00:10.000Z",
        metadata: {},
      },
      submissions: [],
    },
  },
  completedRounds: [],
  transitions: [],
  availableActions: ["submission:create"],
  serverTimestamp: "2026-01-01T00:00:00.000Z",
};

function renderPanel(
  value: GameplayRuntimeSnapshot,
  gameplayCommand = vi.fn(),
) {
  render(
    <LiveSessionContext.Provider
      value={{
        snapshot: {
          sessionId: "session-1",
          mode: { key: "core", version: 1 },
          status: "active",
          revision: 4,
          serverTimestamp: "2026-01-01T00:00:00.000Z",
          round: { number: 1 },
          teams: [],
          participants: [],
          readiness: {
            canMarkSessionReady: false,
            readyPlayers: 0,
            totalPlayers: 0,
            readyTeamIds: [],
          },
          gameplay: value,
          availableActions: [],
          createdAt: "2026-01-01T00:00:00.000Z",
          lastTransitionAt: "2026-01-01T00:00:00.000Z",
          expiresAt: "2026-01-02T00:00:00.000Z",
        },
        connection: "connected",
        snapshotReceivedAtMs: new Date("2026-01-01T00:00:00.000Z").getTime(),
        command: vi.fn(),
        gameplayCommand,
      }}
    >
      <LiveSessionClockContext.Provider
        value={new Date("2026-01-01T00:00:03.000Z").getTime()}
      >
        <GameplayInteractionPanel runtime={value} />
      </LiveSessionClockContext.Provider>
    </LiveSessionContext.Provider>,
  );
  return gameplayCommand;
}

describe("gameplay interaction frontend", () => {
  it("renders safe prompt and delegates a server-authorized submission", () => {
    const command = renderPanel(runtime);
    expect(screen.getByText("Send a signal")).toBeInTheDocument();
    expect(screen.getByText("7s remaining")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send signal" }));
    expect(command).toHaveBeenCalledWith("interaction-submit", {
      roundId: "round-1",
      payload: { signal: "ready" },
    });
  });

  it("renders no mutation control for a read-only projection", () => {
    renderPanel({ ...runtime, availableActions: [] });
    expect(
      screen.queryByRole("button", { name: "Send signal" }),
    ).not.toBeInTheDocument();
  });

  it("renders only submissions and outcome supplied by the safe projection", () => {
    renderPanel({
      ...runtime,
      activeRound: {
        ...runtime.activeRound!,
        interaction: {
          ...runtime.activeRound!.interaction!,
          status: "resolved",
          submissions: [
            {
              id: "submission-1",
              status: "accepted",
              payload: { signal: "ready" },
              receivedAt: "2026-01-01T00:00:02.000Z",
            },
          ],
          outcome: {
            type: "development-signal-result",
            schemaVersion: 1,
            payload: { state: "resolved" },
            completionReason: "host-resolved",
          },
        },
      },
      availableActions: [],
    });
    expect(screen.getByText("ready · accepted")).toBeInTheDocument();
    expect(screen.getByText("Outcome: resolved")).toBeInTheDocument();
  });
});
