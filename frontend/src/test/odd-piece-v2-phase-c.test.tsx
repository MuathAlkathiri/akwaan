import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OddPieceGameplayPanel } from "@/features/live-game-session/components/odd-piece-gameplay-panel";

const mocks = vi.hoisted(() => ({
  command: vi.fn(),
  ready: vi.fn(() => Promise.resolve()),
}));

vi.mock(
  "@/features/live-game-session/hooks/live-session-clock-context",
  () => ({
    useLiveSessionClock: () => Date.parse("2026-09-05T12:00:00.000Z"),
  }),
);
vi.mock("@/features/live-game-session/hooks/live-session-context", () => ({
  useLiveSession: () => ({
    snapshot: {
      revision: 9,
      serverTimestamp: "2026-09-05T12:00:00.000Z",
      teams: [
        { id: "team-a", name: "ألفا" },
        { id: "team-b", name: "بيتا" },
      ],
    },
    gameplayCommand: mocks.command,
    presentationReadySocket: mocks.ready,
    connection: "connected",
  }),
}));

const image = (url = "https://media.test/modified.jpg") => ({
  width: 1200,
  height: 800,
  orientation: "landscape",
  media: { type: "image", assets: [{ url }] },
});
const v2State = (overrides: Record<string, unknown> = {}) => ({
  phase: "open",
  currentPuzzleIndex: 0,
  puzzleCount: 3,
  prompt: "أين القطعة الدخيلة؟",
  modifiedImageJson: JSON.stringify(image()),
  actorTeamId: "team-a",
  canClaim: true,
  canSelect: false,
  attemptUsed: false,
  deadlineAt: "2026-09-05T12:00:30.000Z",
  attemptsJson: "[]",
  ...overrides,
});
const runtime = (
  modeState: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
) =>
  ({
    runtimeId: "runtime-odd-v2",
    sessionId: "session-1",
    revision: 4,
    status: "round-active",
    mode: { key: "odd-piece", version: 2, stateSchemaVersion: 2 },
    modeState,
    activeRound: { id: "round-1", status: "active" },
    availableActions: [
      "mode:claim-odd-piece-hotspot",
      "mode:submit-odd-piece-hotspot",
    ],
    ...overrides,
  }) as never;

beforeEach(() => {
  mocks.command.mockReset();
  mocks.ready.mockClear();
});

describe("Odd Piece V2 Phase C player surface", () => {
  it("keeps the modified image mounted and submits one normalized tap from the answer phone", () => {
    const { container } = render(
      <OddPieceGameplayPanel
        runtime={runtime(
          v2State({
            phase: "answering",
            canClaim: false,
            canSelect: true,
            answerOwnerTeamId: "team-a",
            deadlineAt: "2026-09-05T12:00:05.000Z",
          }),
        )}
        actor="participant"
      />,
    );
    const surface = screen.getByTestId("odd-piece-v2-phone-image");
    Object.defineProperty(surface, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        width: 300,
        height: 200,
        right: 300,
        bottom: 200,
      }),
    });
    fireEvent.pointerDown(surface, {
      pointerId: 1,
      clientX: 150,
      clientY: 100,
    });
    fireEvent.pointerUp(surface, { pointerId: 1, clientX: 150, clientY: 100 });
    fireEvent.click(surface, { clientX: 150, clientY: 100 });
    expect(mocks.command).toHaveBeenCalledWith(
      "gameplay-command",
      expect.objectContaining({
        roundId: "round-1",
        commandType: "submit-odd-piece-hotspot",
        payload: expect.objectContaining({
          x: expect.any(Number),
          y: expect.any(Number),
        }),
      }),
    );
    const point = mocks.command.mock.calls[0][1].payload;
    expect(point.x).toBeGreaterThanOrEqual(0);
    expect(point.x).toBeLessThanOrEqual(1);
    expect(point.y).toBeGreaterThanOrEqual(0);
    expect(point.y).toBeLessThanOrEqual(1);
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://media.test/modified.jpg",
    );
  });

  it("acknowledges only after the real image load on a preparing surface", async () => {
    render(
      <OddPieceGameplayPanel
        runtime={runtime(
          { awaitingPresentation: true },
          {
            presentationSurface: {
              running: true,
              required: true,
              capability: "answering",
              preloadImageUrl: "https://media.test/modified.jpg",
              generation: 2,
            },
          },
        )}
        actor="participant"
      />,
    );
    const imageNode = screen.getByTestId("odd-piece-v2-preload-image");
    expect(mocks.ready).not.toHaveBeenCalled();
    fireEvent.load(imageNode);
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(mocks.ready).toHaveBeenCalledWith({
      expectedSessionRevision: 9,
      expectedRuntimeRevision: 4,
      presentationGeneration: 2,
    });
  });

  it("never submits drags, pinch gestures, or taps in image letterbox margins", () => {
    render(
      <OddPieceGameplayPanel
        runtime={runtime(
          v2State({
            phase: "answering",
            canClaim: false,
            canSelect: true,
            answerOwnerTeamId: "team-a",
            deadlineAt: "2026-09-05T12:00:05.000Z",
          }),
        )}
        actor="participant"
      />,
    );
    const surface = screen.getByTestId("odd-piece-v2-phone-image");
    Object.defineProperty(surface, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        width: 300,
        height: 300,
        right: 300,
        bottom: 300,
      }),
    });

    fireEvent.pointerDown(surface, {
      pointerId: 1,
      clientX: 120,
      clientY: 150,
    });
    fireEvent.pointerMove(surface, {
      pointerId: 1,
      clientX: 160,
      clientY: 150,
    });
    fireEvent.pointerUp(surface, {
      pointerId: 1,
      clientX: 160,
      clientY: 150,
    });

    fireEvent.pointerDown(surface, {
      pointerId: 2,
      clientX: 100,
      clientY: 150,
    });
    fireEvent.pointerDown(surface, {
      pointerId: 3,
      clientX: 200,
      clientY: 150,
    });
    fireEvent.pointerMove(surface, {
      pointerId: 3,
      clientX: 240,
      clientY: 150,
    });
    fireEvent.pointerUp(surface, {
      pointerId: 3,
      clientX: 240,
      clientY: 150,
    });
    fireEvent.pointerUp(surface, {
      pointerId: 2,
      clientX: 100,
      clientY: 150,
    });

    fireEvent.pointerDown(surface, {
      pointerId: 4,
      clientX: 150,
      clientY: 10,
    });
    fireEvent.pointerUp(surface, {
      pointerId: 4,
      clientX: 150,
      clientY: 10,
    });

    expect(mocks.command).not.toHaveBeenCalled();
  });

  it("does not expose the hotspot or original identity before reveal", () => {
    render(
      <OddPieceGameplayPanel
        runtime={runtime(v2State())}
        actor="shared-screen"
      />,
    );
    expect(document.body).toHaveTextContent("أين القطعة الدخيلة؟");
    expect(document.body).not.toHaveTextContent("bmw-m4-g82");
    expect(document.body).not.toHaveTextContent("original.jpg");
    expect(document.body).not.toHaveTextContent("polygon");
  });

  it("lets the shared screen advance each resolved puzzle", () => {
    render(
      <OddPieceGameplayPanel
        runtime={runtime(
          v2State({
            phase: "revealed",
            revealJson: JSON.stringify({
              originalImage: image("https://media.test/original.jpg"),
              targetVehicleLabel: "BMW M4 G82",
              intruderVehicleLabel: "Mercedes-AMG C63 W206",
              intruderPartLabel: "مصباح أمامي",
              hotspot: { polygon: [], tolerance: 0.01 },
            }),
            resultJson: JSON.stringify({
              winnerTeamId: "team-a",
              tie: false,
              points: { "team-a": 1, "team-b": 0 },
            }),
          }),
          { availableActions: ["mode:advance-odd-piece-hotspot"] },
        )}
        actor="shared-screen"
      />,
    );
    fireEvent.click(screen.getByTestId("odd-piece-v2-advance"));
    expect(mocks.command).toHaveBeenCalledWith(
      "gameplay-command",
      expect.objectContaining({
        commandType: "advance-odd-piece-hotspot",
      }),
    );
  });

  it("transitions from the modified reveal to a same-composition comparison", () => {
    vi.useFakeTimers();
    try {
      render(
        <OddPieceGameplayPanel
          runtime={runtime(
            v2State({
              phase: "revealed",
              revealJson: JSON.stringify({
                originalImage: image("https://media.test/original.jpg"),
                targetVehicleLabel: "BMW M4 G82",
                intruderVehicleLabel: "Mercedes-AMG C63 W206",
                intruderPartLabel: "مصباح أمامي",
                hotspot: {
                  polygon: [
                    { x: 0.4, y: 0.4 },
                    { x: 0.6, y: 0.4 },
                    { x: 0.6, y: 0.6 },
                    { x: 0.4, y: 0.6 },
                  ],
                  tolerance: 0.01,
                },
              }),
              resultJson: JSON.stringify({
                winnerTeamId: "team-a",
                tie: false,
                points: { "team-a": 1, "team-b": 0 },
              }),
            }),
            { availableActions: [] },
          )}
          actor="shared-screen"
        />,
      );
      expect(
        screen.getByTestId("odd-piece-v2-modified-reveal"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("odd-piece-v2-mechanic-point"),
      ).toHaveTextContent("+1 نقطة");
      act(() => vi.advanceTimersByTime(2200));
      expect(
        screen.getByTestId("odd-piece-v2-split-comparison"),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
