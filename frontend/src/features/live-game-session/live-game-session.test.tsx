import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SessionControls } from "./components/session-controls";
import { LiveSessionContext } from "./hooks/live-session-context";
import { deriveRemainingMs } from "./hooks/use-team-clock-display";
import type { LiveSessionSnapshot } from "./model";
import { liveSessionReducer } from "./state/live-session-reducer";

const snapshot: LiveSessionSnapshot = {
  sessionId: "session-1",
  mode: { key: "core-timed-turns", version: 1 },
  status: "active",
  revision: 3,
  serverTimestamp: "2026-01-01T00:00:05.000Z",
  activeTeamId: "team-1",
  round: { number: 1 },
  teams: [
    {
      id: "team-1",
      name: "One",
      active: true,
      clock: {
        allocatedMs: 10_000,
        consumedMs: 0,
        remainingMs: 5_000,
        startedAt: "2026-01-01T00:00:00.000Z",
        running: true,
        expired: false,
      },
    },
    {
      id: "team-2",
      name: "Two",
      active: true,
      clock: {
        allocatedMs: 10_000,
        consumedMs: 2_000,
        remainingMs: 8_000,
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
  availableActions: ["pause", "switch-turn", "finish"],
  createdAt: "2026-01-01T00:00:00.000Z",
  startedAt: "2026-01-01T00:00:00.000Z",
  lastTransitionAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2026-01-02T00:00:00.000Z",
};

describe("live session frontend state", () => {
  it("interpolates a running timer and clamps it at zero", () => {
    expect(
      deriveRemainingMs(
        snapshot.teams[0].clock,
        snapshot.serverTimestamp,
        Date.parse(snapshot.serverTimestamp) + 2_000,
        Date.parse(snapshot.serverTimestamp),
      ),
    ).toBe(3_000);
    expect(
      deriveRemainingMs(
        snapshot.teams[0].clock,
        snapshot.serverTimestamp,
        Date.parse(snapshot.serverTimestamp) + 8_000,
        Date.parse(snapshot.serverTimestamp),
      ),
    ).toBe(0);
  });

  it("keeps paused clocks stable and resynchronizes from newer snapshots", () => {
    expect(
      deriveRemainingMs(
        snapshot.teams[1].clock,
        snapshot.serverTimestamp,
        Date.parse(snapshot.serverTimestamp) + 5_000,
        Date.parse(snapshot.serverTimestamp),
      ),
    ).toBe(8_000);
    const current = liveSessionReducer(
      { connection: "connected", snapshot },
      {
        type: "snapshot",
        snapshot: { ...snapshot, revision: 4, activeTeamId: "team-2" },
        receivedAtMs: Date.parse(snapshot.serverTimestamp),
      },
    );
    expect(current.snapshot?.activeTeamId).toBe("team-2");
    const stale = liveSessionReducer(current, {
      type: "snapshot",
      snapshot,
      receivedAtMs: Date.parse(snapshot.serverTimestamp),
    });
    expect(stale.snapshot?.revision).toBe(4);
  });

  it("tracks connection loss and reconnect state", () => {
    const disconnected = liveSessionReducer(
      { connection: "connected", snapshot },
      { type: "connection", connection: "disconnected" },
    );
    expect(disconnected.connection).toBe("disconnected");
    expect(
      liveSessionReducer(disconnected, {
        type: "connection",
        connection: "reconnecting",
      }).connection,
    ).toBe("reconnecting");
  });

  it("delegates controls to the context command action", () => {
    const command = vi.fn();
    render(
      <LiveSessionContext.Provider
        value={{
          snapshot,
          connection: "connected",
          command,
          gameplayCommand: vi.fn(),
        }}
      >
        <SessionControls />
      </LiveSessionContext.Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Pause session" }));
    expect(command).toHaveBeenCalledWith("pause", {});
    fireEvent.click(screen.getByRole("button", { name: "Switch to Two" }));
    expect(command).toHaveBeenCalledWith("switch-turn", {
      teamId: "team-2",
      reason: "manual",
    });
  });
});
