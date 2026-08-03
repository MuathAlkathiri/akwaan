import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Top10PoisonDeckPanel } from "./components/top10-poison-deck-panel";
import { LiveSessionContext } from "./hooks/live-session-context";
import type { GameplayRuntimeSnapshot, LiveSessionSnapshot } from "./model";

const runtime: GameplayRuntimeSnapshot = {
  runtimeId: "runtime-1",
  sessionId: "session-1",
  status: "round-active",
  revision: 4,
  mode: { key: "top-10", version: 1, stateSchemaVersion: 1 },
  modeState: {
    variant: "poison-deck",
    title: "أفضل عشرة هدافين",
    instruction: "احتفظ بها أو دسّها",
    rankingBasis: "الأهداف الرسمية",
    sourceLabel: "المصدر الرسمي",
    phase: "assigning",
    cardCount: 14,
    assignmentsJson: "[]",
    revealedJson: "[]",
  },
  activeRound: {
    id: "round-1",
    sequence: 1,
    status: "active",
    activeTeamId: "team-a",
    modeState: {
      phase: "assigning",
      turnIndex: 0,
      revealIndex: 0,
      deadlineAt: "2026-01-01T00:00:06.000Z",
      currentCardJson: JSON.stringify({ id: "card-1", label: "ميسي" }),
    },
    transitionRevision: 4,
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  completedRounds: [],
  transitions: [],
  availableActions: ["mode:assign-card"],
  serverTimestamp: "2026-01-01T00:00:00.000Z",
};

const snapshot = {
  sessionId: "session-1",
  mode: { key: "core-timed-turns", version: 1 },
  status: "active",
  revision: 8,
  serverTimestamp: "2026-01-01T00:00:00.000Z",
  round: { number: 1 },
  teams: [
    {
      id: "team-a",
      name: "الصقور",
      active: true,
      clock: {
        allocatedMs: 60_000,
        consumedMs: 0,
        remainingMs: 60_000,
        running: false,
        expired: false,
      },
    },
    {
      id: "team-b",
      name: "النجوم",
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
    canMarkSessionReady: false,
    readyPlayers: 0,
    totalPlayers: 0,
    readyTeamIds: [],
  },
  gameplay: runtime,
  availableActions: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  lastTransitionAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2026-01-02T00:00:00.000Z",
} as LiveSessionSnapshot;

describe("Top 10 poison-deck live UI", () => {
  it("shows only the current card and sends a server-owned KEEP decision", () => {
    const gameplayCommand = vi.fn();
    render(
      <LiveSessionContext.Provider
        value={{
          snapshot,
          connection: "connected",
          nowMs: Date.parse("2026-01-01T00:00:01.000Z"),
          command: vi.fn(),
          gameplayCommand,
        }}
      >
        <Top10PoisonDeckPanel runtime={runtime} />
      </LiveSessionContext.Provider>,
    );
    expect(screen.getByText("ميسي")).toBeInTheDocument();
    expect(screen.queryByText(/المرتبة/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "احتفظ بها" }));
    expect(gameplayCommand).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "assign-card",
      payload: { action: "keep" },
    });
  });
});
