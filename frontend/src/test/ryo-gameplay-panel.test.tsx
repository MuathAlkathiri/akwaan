import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type {
  GameplayRuntimeSnapshot,
  LiveSessionSnapshot,
} from "@/features/live-game-session/model";

/**
 * The RYO phone's own fair-start surface.
 *
 * The shared router already routes a multi-surface mechanic on to the socket
 * channel, but the *phone panel* also acknowledges, because it is the surface
 * the server binds to. Two things are load-bearing here: while the first item
 * awaits every surface the phone shows only a preparing loader — no question,
 * no target, no Trust/Steal controls — and it sends exactly one socket
 * acknowledgement per awaited runtime revision, re-acknowledging a fresh
 * revision while still awaiting and never acknowledging an activated runtime.
 */

const mocks = vi.hoisted(() => ({
  snapshot: {
    sessionId: "session-1",
    revision: 4,
    serverTimestamp: "2026-01-01T00:00:10.000Z",
    teams: [
      { id: "team-a", name: "أسود الشمال" },
      { id: "team-b", name: "صقور الرياض" },
    ],
    participants: [],
    availableActions: [],
  } as unknown as LiveSessionSnapshot,
  gameplayCommand: vi.fn(),
  connection: "connected" as string,
  presentationReadySocket: vi.fn(),
}));

vi.mock(
  "@/features/live-game-session/hooks/live-session-clock-context",
  () => ({
    useLiveSessionClock: () => Date.parse("2026-01-01T00:00:10.000Z"),
  }),
);

vi.mock("@/features/live-game-session/hooks/live-session-context", () => ({
  useLiveSession: () => ({
    snapshot: mocks.snapshot,
    snapshotReceivedAtMs: Date.parse("2026-01-01T00:00:10.000Z"),
    gameplayCommand: mocks.gameplayCommand,
    connection: mocks.connection,
    presentationReadySocket: mocks.presentationReadySocket,
  }),
}));

import { RyoGameplayPanel } from "@/features/live-game-session/components/ryo-gameplay-panel";

const awaitingRuntime = {
  runtimeId: "runtime-1",
  sessionId: "session-1",
  status: "round-active",
  revision: 7,
  mode: { key: "read-your-opponent", version: 1, stateSchemaVersion: 1 },
  modeState: { awaitingPresentation: true },
  // The shell projection this phone receives while the barrier is up.
  presentationSurface: { running: true, capability: "decision" },
  availableActions: [],
  completedRounds: [],
  transitions: [],
  serverTimestamp: "2026-01-01T00:00:10.000Z",
} as unknown as GameplayRuntimeSnapshot;

const ITEM_JSON = JSON.stringify({
  id: "item-1",
  prompt: { ar: "من رفع كأس العالم 2022؟" },
  answerMode: "multiple_choice",
  options: [
    { id: "team-a", label: { ar: "الأرجنتين" } },
    { id: "team-b", label: { ar: "البرازيل" } },
  ],
});

/** The deciding phone's view after activation: an open, live item. */
const activatedRuntime = {
  ...awaitingRuntime,
  modeState: { currentItemIndex: 0 },
  presentationSurface: undefined,
  activeRound: {
    id: "round-1",
    sequence: 1,
    status: "active",
    modeState: { answeringTeamId: "team-a", opposingTeamId: "team-b" },
    transitionRevision: 1,
    createdAt: "2026-01-01T00:00:10.000Z",
    startedAt: "2026-01-01T00:00:10.000Z",
    interaction: {
      id: "interaction-1",
      revision: 3,
      status: "open",
      prompt: {
        id: "p-1",
        type: "ryo.item",
        schemaVersion: 1,
        payload: {
          itemJson: ITEM_JSON,
          actorRole: "opposing",
          isAssignedActor: true,
          answererParticipantId: "p-answerer",
          deciderParticipantId: "p-decider",
        },
        visibleFrom: "2026-01-01T00:00:10.000Z",
        deadlineAt: "2026-01-01T00:00:35.000Z",
        metadata: {},
      },
      submissions: [],
    },
  },
  availableActions: ["submission:create"],
} as unknown as GameplayRuntimeSnapshot;

beforeEach(() => {
  mocks.gameplayCommand.mockReset();
  mocks.presentationReadySocket.mockReset();
  mocks.connection = "connected";
  mocks.snapshot.revision = 4;
});

describe("اقرأ خصمك — the phone's fair-start surface", () => {
  it("holds the phone on the preparing loader and acknowledges over the socket exactly once per awaited revision", async () => {
    mocks.presentationReadySocket.mockResolvedValue(undefined);
    render(<RyoGameplayPanel runtime={awaitingRuntime} />);

    // The barrier: no question, no options, no lock indicators — only the
    // loader, so a surface that is still cold-starting leaks nothing.
    expect(screen.getByTestId("ryo-preparing")).toBeTruthy();
    expect(screen.queryByTestId("ryo-answer-controls")).toBeNull();
    expect(screen.queryByTestId("ryo-decision-controls")).toBeNull();
    expect(screen.queryByTestId("ryo-lock-indicators")).toBeNull();
    expect(screen.queryByText("من رفع كأس العالم 2022؟")).toBeNull();

    await waitFor(() =>
      expect(mocks.presentationReadySocket).toHaveBeenCalledTimes(1),
    );
    expect(mocks.presentationReadySocket).toHaveBeenCalledWith({
      expectedSessionRevision: 4,
      expectedRuntimeRevision: 7,
    });
  });

  it("acknowledges once per awaited runtime revision, even while still awaiting", async () => {
    mocks.presentationReadySocket.mockResolvedValue(undefined);
    const { rerender } = render(<RyoGameplayPanel runtime={awaitingRuntime} />);
    await waitFor(() =>
      expect(mocks.presentationReadySocket).toHaveBeenCalledTimes(1),
    );

    // A revision bump while still awaiting (e.g. another surface's ack, or a
    // withdrawal) must be acknowledged against the new on-screen revision.
    rerender(
      <RyoGameplayPanel runtime={{ ...awaitingRuntime, revision: 8 }} />,
    );
    await waitFor(() =>
      expect(mocks.presentationReadySocket).toHaveBeenCalledTimes(2),
    );
    expect(mocks.presentationReadySocket).toHaveBeenLastCalledWith({
      expectedSessionRevision: 4,
      expectedRuntimeRevision: 8,
    });

    // Re-rendering the same awaited revision never re-sends.
    rerender(
      <RyoGameplayPanel runtime={{ ...awaitingRuntime, revision: 8 }} />,
    );
    await waitFor(() =>
      expect(mocks.presentationReadySocket).toHaveBeenCalledTimes(2),
    );
  });

  it("accepts a rejected socket attempt without pinning it, and does not re-send once accepted", async () => {
    mocks.presentationReadySocket
      .mockRejectedValueOnce(new Error("no live connection"))
      .mockResolvedValue(undefined);
    const { rerender } = render(<RyoGameplayPanel runtime={awaitingRuntime} />);
    await waitFor(() =>
      expect(mocks.presentationReadySocket).toHaveBeenCalledTimes(1),
    );

    rerender(<RyoGameplayPanel runtime={{ ...awaitingRuntime }} />);
    await waitFor(() =>
      expect(mocks.presentationReadySocket).toHaveBeenCalledTimes(2),
    );
    rerender(<RyoGameplayPanel runtime={{ ...awaitingRuntime }} />);
    await waitFor(() =>
      expect(mocks.presentationReadySocket).toHaveBeenCalledTimes(2),
    );
  });

  it("does not acknowledge once activation lands (the compile check its redaction exists for), and shows the live item instead", async () => {
    mocks.presentationReadySocket.mockResolvedValue(undefined);
    const { rerender } = render(<RyoGameplayPanel runtime={awaitingRuntime} />);
    await waitFor(() =>
      expect(mocks.presentationReadySocket).toHaveBeenCalledTimes(1),
    );

    rerender(<RyoGameplayPanel runtime={activatedRuntime} />);
    expect(screen.queryByTestId("ryo-preparing")).toBeNull();
    // The real challenge appears: Trust/Steal controls for the decider, and the
    // public lock indicators — without any of the answerer's options.
    expect(screen.getByTestId("ryo-decision-controls")).toBeTruthy();
    expect(screen.queryByTestId("ryo-answer-controls")).toBeNull();
    // The question renders on screen. `getByText` concatenates only an element's
    // *direct* text nodes, but BidiText isolates the year run inside a nested
    // `span[dir=ltr]`, and the Arabic read as orphan sibling text nodes — so
    // assert on textContent, which sees the whole sentence.
    expect(
      screen
        .getAllByRole("heading", { level: 2 })
        .some((el) => el.textContent === "من رفع كأس العالم 2022؟"),
    ).toBe(true);
    expect(screen.getByTestId("ryo-lock-answering")).toBeTruthy();
    expect(screen.getByTestId("ryo-lock-opposing")).toBeTruthy();

    await waitFor(() =>
      expect(mocks.presentationReadySocket).toHaveBeenCalledTimes(1),
    );
  });

  it("echoes the projected recurring generation on the phone acknowledgement", async () => {
    mocks.presentationReadySocket.mockResolvedValue(undefined);
    const recurring = {
      ...awaitingRuntime,
      presentationSurface: {
        running: true,
        capability: "decision",
        generation: 2,
      },
    } as unknown as GameplayRuntimeSnapshot;
    render(<RyoGameplayPanel runtime={recurring} />);
    await waitFor(() =>
      expect(mocks.presentationReadySocket).toHaveBeenCalledTimes(1),
    );
    expect(mocks.presentationReadySocket).toHaveBeenCalledWith({
      expectedSessionRevision: 4,
      expectedRuntimeRevision: 7,
      presentationGeneration: 2,
    });
  });

  it("acknowledges a new generation even when the runtime revision is unchanged", async () => {
    mocks.presentationReadySocket.mockResolvedValue(undefined);
    const gen2 = {
      ...awaitingRuntime,
      presentationSurface: {
        running: true,
        capability: "decision",
        generation: 2,
      },
    } as unknown as GameplayRuntimeSnapshot;
    const { rerender } = render(<RyoGameplayPanel runtime={gen2} />);
    await waitFor(() =>
      expect(mocks.presentationReadySocket).toHaveBeenCalledTimes(1),
    );
    const gen3 = {
      ...awaitingRuntime,
      presentationSurface: {
        running: true,
        capability: "decision",
        generation: 3,
      },
    } as unknown as GameplayRuntimeSnapshot;
    rerender(<RyoGameplayPanel runtime={gen3} />);
    await waitFor(() =>
      expect(mocks.presentationReadySocket).toHaveBeenCalledTimes(2),
    );
    expect(mocks.presentationReadySocket).toHaveBeenLastCalledWith({
      expectedSessionRevision: 4,
      expectedRuntimeRevision: 7,
      presentationGeneration: 3,
    });
  });
});