import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  gameplayCommand: vi.fn(),
  connection: "connected",
  nowMs: Date.parse("2026-01-01T00:00:10Z"),
}));

vi.mock(
  "@/features/live-game-session/hooks/live-session-clock-context",
  () => ({ useLiveSessionClock: () => mocks.nowMs }),
);
vi.mock("@/features/live-game-session/hooks/live-session-context", () => ({
  useLiveSession: () => ({
    snapshot: {
      teams: [
        { id: "team-a", name: "ألفا" },
        { id: "team-b", name: "بيتا" },
      ],
      participants: [],
      serverTimestamp: "2026-01-01T00:00:10Z",
    },
    snapshotReceivedAtMs: mocks.nowMs,
    gameplayCommand: mocks.gameplayCommand,
    connection: mocks.connection,
  }),
}));

import { OddPieceGameplayPanel } from "@/features/live-game-session/components/odd-piece-gameplay-panel";

const pieces = ["a", "b", "c", "d"].map((id) => ({
  id,
  imageUrl: `https://test/${id}.jpg`,
  altText: `piece ${id}`,
}));
const state = (overrides: Record<string, unknown> = {}) => ({
  phase: "open",
  currentPuzzleIndex: 0,
  puzzleCount: 3,
  prompt: "اختر القطعة الدخيلة",
  piecesJson: JSON.stringify(pieces),
  failedTeamIdsJson: "[]",
  deadlineAt: "2026-01-01T00:00:40Z",
  ...overrides,
});
const runtime = (modeState: Record<string, unknown>, actions: string[] = []) =>
  ({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    status: "round-active",
    revision: 1,
    mode: { key: "odd-piece", version: 1, stateSchemaVersion: 1 },
    modeState,
    activeRound: { id: "round-1", status: "active" },
    availableActions: actions,
    completedRounds: [],
    transitions: [],
    serverTimestamp: "2026-01-01T00:00:10Z",
  }) as never;

beforeEach(() => mocks.gameplayCommand.mockReset());

describe("القطعة الدخيلة", () => {
  it("renders the four-piece shared board with progress and no grading metadata", () => {
    const modeState = state();
    expect(JSON.stringify(modeState)).not.toContain("vehicleIdentity");
    render(
      <OddPieceGameplayPanel
        runtime={runtime(modeState)}
        actor="shared-screen"
      />,
    );
    expect(
      screen.getByTestId("odd-piece-grid").querySelectorAll("img"),
    ).toHaveLength(4);
    expect(screen.getByText("اللغز 1 من 3")).toBeInTheDocument();
  });

  it("lets an eligible phone claim, then lets the answer owner select by stable id", async () => {
    const { rerender } = render(
      <OddPieceGameplayPanel
        runtime={runtime(state({ canClaim: true }), ["mode:claim-odd-piece"])}
        actor="participant"
      />,
    );
    await userEvent.click(screen.getByTestId("odd-piece-claim"));
    expect(mocks.gameplayCommand).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "claim-odd-piece",
      payload: {},
    });

    rerender(
      <OddPieceGameplayPanel
        runtime={runtime(
          state({
            phase: "selecting",
            answerOwnerTeamId: "team-a",
            canSelect: true,
            deadlineAt: null,
          }),
          ["mode:submit-odd-piece"],
        )}
        actor="participant"
      />,
    );
    await userEvent.click(screen.getByTestId("odd-piece-select-c"));
    expect(mocks.gameplayCommand).toHaveBeenLastCalledWith(
      "gameplay-command",
      expect.objectContaining({
        commandType: "submit-odd-piece",
        payload: { pieceId: "c" },
      }),
    );
  });

  it("locks a failed team while the opponent owns the same puzzle", () => {
    render(
      <OddPieceGameplayPanel
        runtime={runtime(
          state({
            phase: "selecting",
            answerOwnerTeamId: "team-b",
            failedTeamIdsJson: JSON.stringify(["team-a"]),
            attemptUsed: true,
            deadlineAt: null,
          }),
        )}
        actor="participant"
      />,
    );
    expect(screen.getByText("انتهت محاولة فريقكم.")).toBeInTheDocument();
    expect(screen.queryByTestId("odd-piece-select-a")).toBeNull();
  });

  it("shows the mandatory full-vehicle proof and controller advance", async () => {
    render(
      <OddPieceGameplayPanel
        runtime={runtime(
          state({
            phase: "revealed",
            deadlineAt: null,
            revealJson: JSON.stringify({
              oddPieceId: "d",
              targetVehicleLabel: "BMW M4",
              intruderVehicleLabel: "Mercedes-AMG C63",
              targetReveal: { imageUrl: "https://test/full.jpg" },
            }),
          }),
          ["mode:advance-odd-piece"],
        )}
        actor="controller"
      />,
    );
    expect(screen.getByTestId("odd-piece-target-reveal")).toBeInTheDocument();
    expect(screen.getByText(/BMW M4/)).toBeInTheDocument();
    await userEvent.click(screen.getByTestId("odd-piece-advance"));
    expect(mocks.gameplayCommand).toHaveBeenLastCalledWith(
      "gameplay-command",
      expect.objectContaining({ commandType: "advance-odd-piece" }),
    );
  });
});
