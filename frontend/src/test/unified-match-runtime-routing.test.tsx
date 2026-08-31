import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSessionContext } from "@/features/live-game-session/hooks/live-session-context";
import {
  MatchGameplayRenderer,
  MatchStageRouter,
} from "@/features/live-game-session/match/match-stage-router";
import type {
  LiveSessionMatchSnapshot,
  MatchActor,
  MatchSlotKey,
  UnifiedBoardPosition,
} from "@/features/live-game-session/match/types";
import type { LiveSessionSnapshot } from "@/features/live-game-session/model";

/**
 * What happens after a launch, and what happens after it ends.
 *
 * Three things are load-bearing here. A running challenge is rendered by the
 * mechanic the *runtime's mode key* names — never a challenge name, never a slug
 * guessed from the board. Reconciliation is the server's job: the client shows
 * whatever stage the next snapshot carries, and a Match that has gone back to its
 * board still shows all twelve positions with the completed one in place. And a
 * refresh is just another snapshot, so every stage restores itself.
 */

const WORLD = "world-anime";
const SLOTS: MatchSlotKey[] = ["slot_1", "slot_2", "slot_3", "slot_4"];

const mocks = vi.hoisted(() => ({
  resync: vi.fn(),
  adoptSnapshot: vi.fn(),
  abortActiveChallenge: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/features/match-setup", () => ({
  abortActiveChallenge: mocks.abortActiveChallenge,
  prepareUnifiedChallenge: vi.fn(),
  launchUnifiedChallenge: vi.fn(),
  cancelUnifiedPreflight: vi.fn(),
  occurrenceLabel: (index: number) =>
    ["العالم الأول", "العالم الثاني", "العالم الثالث"][index],
}));

/** Each mechanic screen, stubbed to a marker, so only the routing is under test. */
vi.mock("@/features/live-game-session/components/ryo-gameplay-panel", () => ({
  RyoGameplayPanel: () => <div data-testid="renderer-ryo" />,
}));
vi.mock("@/features/live-game-session/components/top5-panel", () => ({
  Top5Panel: () => <div data-testid="renderer-top5" />,
}));
vi.mock(
  "@/features/live-game-session/components/closest-gameplay-panel",
  () => ({
    ClosestGameplayPanel: () => <div data-testid="renderer-closest" />,
  }),
);
vi.mock("@/features/live-game-session/components/combo-gameplay-panel", () => ({
  ComboGameplayPanel: () => <div data-testid="renderer-combo" />,
}));
vi.mock("@/features/live-game-session/components/bomb-gameplay-panel", () => ({
  BombGameplayPanel: () => <div data-testid="renderer-bomb" />,
}));
vi.mock("@/features/live-game-session/components/rakkibha-panel", () => ({
  RakkibhaPanel: () => <div data-testid="renderer-rakkibha-phone" />,
}));
vi.mock("@/features/live-game-session/components/rakkibha-screen", () => ({
  RakkibhaScreen: () => <div data-testid="renderer-rakkibha-screen" />,
}));

const position = (
  occurrenceIndex: number,
  slotKey: MatchSlotKey,
  index: number,
  overrides: Partial<UnifiedBoardPosition> = {},
): UnifiedBoardPosition => ({
  positionKey: `${occurrenceIndex}#${slotKey}`,
  occurrenceIndex,
  worldId: WORLD,
  worldName: "انمي",
  slotKey,
  challengeTypeId: `type-${index}`,
  challengeKey: "read-your-opponent",
  // Deliberately an Arabic display name that no renderer may key on.
  challengeName: `اقرأ خصمك ${occurrenceIndex}-${index}`,
  requiresPhones: true,
  launchability: "launchable",
  status: "available",
  ...overrides,
});

function match(
  overrides: {
    stage?: string;
    positions?: UnifiedBoardPosition[];
    completedPositionCount?: number;
    currentChallenge?: LiveSessionMatchSnapshot["currentChallenge"];
    result?: LiveSessionMatchSnapshot["result"];
    status?: string;
    selectingTeamId?: string;
    matchTotals?: LiveSessionMatchSnapshot["scoring"]["matchTotals"];
  } = {},
): LiveSessionMatchSnapshot {
  const positions =
    overrides.positions ??
    [0, 1, 2].flatMap((occurrenceIndex) =>
      SLOTS.map((slotKey, index) => position(occurrenceIndex, slotKey, index)),
    );
  const totals = overrides.matchTotals ?? [
    { teamId: "team-a", signedTotal: 0, displayTotal: 0 },
    { teamId: "team-b", signedTotal: 0, displayTotal: 0 },
  ];
  return {
    id: "match-1",
    revision: 12,
    status: overrides.status ?? "active",
    stage: {
      key: overrides.stage ?? "board",
      enteredAt: "2026-08-06T00:00:00.000Z",
      minimumDisplayDurationMs: 0,
      audioCue: null,
      animationCue: null,
    },
    unified: {
      occurrences: [0, 1, 2].map((occurrenceIndex) => ({
        occurrenceIndex,
        worldId: WORLD,
        worldName: "انمي",
        selectedScopeIds: ["s0", "s1", "s2", "s3"],
        selectedScopes: [
          { scopeId: "s0", name: "نطاق أول" },
          { scopeId: "s1", name: "نطاق ثانٍ" },
          { scopeId: "s2", name: "نطاق ثالث" },
          { scopeId: "s3", name: "نطاق رابع" },
        ],
        subtotals: [],
      })),
      board: {
        positions,
        totalPositionCount: 12,
        completedPositionCount: overrides.completedPositionCount ?? 0,
      },
      selectingTeamId: overrides.selectingTeamId ?? "team-a",
    },
    ...(overrides.currentChallenge
      ? { currentChallenge: overrides.currentChallenge }
      : {}),
    scoring: { matchTotals: totals, worldSubtotals: [] },
    standings: [
      { ...totals[0], name: "أسود الشمال" },
      { ...totals[1], name: "صقور الرياض" },
    ],
    ...(overrides.result ? { result: overrides.result } : {}),
    availableActions: ["match:launch-challenge", "match:cancel"],
  } as LiveSessionMatchSnapshot;
}

function renderRouter(
  value: LiveSessionMatchSnapshot,
  options: { actor?: MatchActor; runtimeModeKey?: string } = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const snapshot = {
    sessionId: "session-1",
    mode: { key: "core-timed-turns", version: 1 },
    status: "active",
    revision: 4,
    serverTimestamp: "2026-08-06T00:00:00.000Z",
    round: { number: 1 },
    teams: [
      { id: "team-a", name: "أسود الشمال", active: true },
      { id: "team-b", name: "صقور الرياض", active: true },
    ],
    participants: [],
    availableActions: [],
    match: value,
    ...(options.runtimeModeKey
      ? {
          gameplay: {
            runtimeId: "runtime-1",
            revision: 7,
            mode: { key: options.runtimeModeKey, version: 1 },
            status: "active",
            modeState: {},
            transitions: [],
            availableActions: [],
          },
        }
      : {}),
  } as unknown as LiveSessionSnapshot;
  return render(
    <QueryClientProvider client={client}>
      <LiveSessionContext.Provider
        value={
          {
            snapshot,
            connection: "connected",
            error: undefined,
            resync: mocks.resync,
            adoptSnapshot: mocks.adoptSnapshot,
            sessionId: "session-1",
          } as never
        }
      >
        <MatchStageRouter actor={options.actor ?? "controller"} />
      </LiveSessionContext.Provider>
    </QueryClientProvider>,
  );
}

const running = {
  occurrenceIndex: 1,
  slotKey: "slot_2" as MatchSlotKey,
  challengeKey: "read-your-opponent",
  runtimeId: "runtime-1",
  startedAt: "2026-08-06T00:01:00.000Z",
};

beforeEach(() => {
  mocks.resync.mockReset();
  mocks.adoptSnapshot.mockReset();
  mocks.abortActiveChallenge.mockReset();
});

describe("a running challenge is routed by its runtime mode key", () => {
  it.each([
    ["read-your-opponent", "renderer-ryo"],
    ["closest", "renderer-closest"],
    ["top-5", "renderer-top5"],
    ["combo", "renderer-combo"],
    ["bomb", "renderer-bomb"],
  ])("renders %s with its own screen", (modeKey, testId) => {
    renderRouter(match({ stage: "challenge", currentChallenge: running }), {
      runtimeModeKey: modeKey,
    });

    expect(screen.getByTestId(testId)).toBeTruthy();
    expect(screen.queryByTestId("unified-board")).toBeNull();
  });

  it("gives ركّبها a private phone screen and a public shared screen", () => {
    const state = match({ stage: "challenge", currentChallenge: running });

    const phone = renderRouter(state, {
      actor: "participant",
      runtimeModeKey: "rakkibha",
    });
    expect(screen.getByTestId("renderer-rakkibha-phone")).toBeTruthy();
    phone.unmount();

    for (const actor of ["controller", "shared-screen"] as const) {
      const view = renderRouter(state, {
        actor,
        runtimeModeKey: "rakkibha",
      });
      expect(screen.getByTestId("renderer-rakkibha-screen")).toBeTruthy();
      view.unmount();
    }
  });

  it("gives every actor the same Combo panel, because the server splits the view", () => {
    // Combo has no per-actor component: the running team, the team holding a
    // break charge and the shared screen all render from their own projection.
    // A Match must not fall through to "no screen for this challenge" — that is
    // exactly the regression this covers.
    for (const actor of [
      "participant",
      "controller",
      "shared-screen",
    ] as const) {
      const view = renderRouter(
        match({ stage: "challenge", currentChallenge: running }),
        { actor, runtimeModeKey: "combo" },
      );
      expect(screen.getByTestId("renderer-combo")).toBeTruthy();
      expect(screen.queryByTestId("runtime-renderer-missing")).toBeNull();
      view.unmount();
    }
  });

  it("ignores the challenge name entirely when choosing a renderer", () => {
    // The board says "اقرأ خصمك"; the runtime says top-5. The runtime wins.
    renderRouter(match({ stage: "challenge", currentChallenge: running }), {
      runtimeModeKey: "top-5",
    });

    expect(screen.getByTestId("renderer-top5")).toBeTruthy();
    expect(screen.queryByTestId("renderer-ryo")).toBeNull();
  });

  it("says so honestly when a runtime has no screen in this client", () => {
    renderRouter(match({ stage: "challenge", currentChallenge: running }), {
      runtimeModeKey: "some-future-mechanic",
    });

    const notice = screen.getByTestId("runtime-renderer-missing");
    expect(notice.textContent).toContain("لا توجد شاشة لهذا التحدي");
    expect(notice.textContent).toContain("some-future-mechanic");
    // Not dressed up as a feature that is nearly ready.
    expect(notice.textContent).not.toContain("قيد التجهيز");
  });

  it("waits for the runtime rather than inventing one", () => {
    renderRouter(match({ stage: "challenge", currentChallenge: running }));

    expect(screen.getByTestId("challenge-restoring")).toBeTruthy();
    expect(screen.queryByTestId("renderer-ryo")).toBeNull();
  });

  it("names the running position from the board, not from the runtime", () => {
    renderRouter(match({ stage: "challenge", currentChallenge: running }), {
      runtimeModeKey: "read-your-opponent",
    });

    const header = screen.getByTestId("unified-challenge");
    expect(header.textContent).toContain("العالم الثاني · انمي");
    expect(header.textContent).toContain("الخانة 2");
    expect(header.textContent).toContain("اقرأ خصمك 1-1");
  });

  it("returns to the board only after the authoritative abort succeeds", async () => {
    const user = userEvent.setup();
    const boardSnapshot = { marker: "authoritative-board" };
    mocks.abortActiveChallenge.mockResolvedValue(boardSnapshot);
    renderRouter(match({ stage: "challenge", currentChallenge: running }), {
      runtimeModeKey: "read-your-opponent",
    });

    await user.click(screen.getByRole("button", { name: "العودة إلى اللوحة" }));

    expect(mocks.abortActiveChallenge).toHaveBeenCalledWith({
      sessionId: "session-1",
      expectedSessionRevision: 4,
      expectedRuntimeRevision: 7,
      commandId: expect.any(String),
    });
    expect(mocks.adoptSnapshot).toHaveBeenCalledWith(boardSnapshot);
  });
});

describe("reconciliation returns to the board", () => {
  const completed = [0, 1, 2].flatMap((occurrenceIndex) =>
    SLOTS.map((slotKey, index) =>
      position(occurrenceIndex, slotKey, index, {
        ...(occurrenceIndex === 1 && slotKey === "slot_2"
          ? {
              status: "completed" as const,
              completedAt: "2026-08-06T00:09:00.000Z",
              scoreSummary: [
                { teamId: "team-a", signedTotal: 3, displayTotal: 3 },
                { teamId: "team-b", signedTotal: 0, displayTotal: 0 },
              ],
            }
          : {}),
      }),
    ),
  );

  it("shows all twelve positions again with the finished one in place", () => {
    renderRouter(
      match({
        stage: "board",
        positions: completed,
        completedPositionCount: 1,
        selectingTeamId: "team-b",
        matchTotals: [
          { teamId: "team-a", signedTotal: 3, displayTotal: 3 },
          { teamId: "team-b", signedTotal: 0, displayTotal: 0 },
        ],
      }),
    );

    expect(screen.getAllByTestId(/^unified-position-/)).toHaveLength(12);
    const finished = screen.getByTestId("unified-position-1#slot_2");
    expect(finished.dataset.status).toBe("completed");
    expect(finished.textContent).toContain("أسود الشمال");
    expect(finished.textContent).toContain("3");
    // Scores and the turn are the server's, updated in the same snapshot.
    expect(screen.getByTestId("board-progress").textContent).toBe("1/12");
    expect(screen.getByTestId("selecting-team-board").textContent).toContain(
      "صقور الرياض",
    );
    expect(screen.getByTestId("unified-board").textContent).toContain("3");
  });

  it("leaves the finished position unselectable without hiding it", () => {
    renderRouter(
      match({
        stage: "board",
        positions: completed,
        completedPositionCount: 1,
      }),
    );

    const finished = screen.getByTestId("unified-position-1#slot_2");
    expect(finished.textContent).not.toContain("اختيار هذا التحدي");
    // The eleven others are still offered.
    expect(
      screen
        .getAllByTestId(/^unified-position-/)
        .filter((node) => node.tagName === "BUTTON"),
    ).toHaveLength(11);
  });
});

describe("the final position ends the Match", () => {
  it("routes to the Match result with the server's own totals", () => {
    const all = [0, 1, 2].flatMap((occurrenceIndex) =>
      SLOTS.map((slotKey, index) =>
        position(occurrenceIndex, slotKey, index, {
          status: "completed" as const,
          scoreSummary: [
            { teamId: "team-a", signedTotal: 1, displayTotal: 1 },
            { teamId: "team-b", signedTotal: 0, displayTotal: 0 },
          ],
        }),
      ),
    );
    renderRouter(
      match({
        stage: "match_complete",
        status: "completed",
        positions: all,
        completedPositionCount: 12,
        matchTotals: [
          { teamId: "team-a", signedTotal: 9, displayTotal: 9 },
          { teamId: "team-b", signedTotal: 4, displayTotal: 4 },
        ],
        result: {
          teams: [
            { teamId: "team-a", signedTotal: 9, displayTotal: 9 },
            { teamId: "team-b", signedTotal: 4, displayTotal: 4 },
          ],
          winnerTeamId: "team-a",
          tie: false,
          worlds: [],
        },
      }),
    );

    const complete = screen.getByTestId("unified-match-complete");
    expect(screen.queryByTestId("unified-board")).toBeNull();
    expect(complete.textContent).toContain("12/12");
    // The winner is read from the result, never recomputed here.
    expect(complete.textContent).toContain("الفائز: أسود الشمال");
    expect(complete.textContent).toContain("9");
    expect(complete.textContent).toContain("4");
    expect(screen.getAllByTestId(/^complete-position-/)).toHaveLength(12);
  });

  it("reports a tie as the server declared it", () => {
    renderRouter(
      match({
        stage: "match_complete",
        status: "completed",
        completedPositionCount: 12,
        result: {
          teams: [],
          winnerTeamId: null,
          tie: true,
          worlds: [],
        },
      }),
    );

    expect(screen.getByTestId("unified-match-complete").textContent).toContain(
      "تعادل",
    );
  });
});

describe("a refresh restores whatever stage the snapshot names", () => {
  it.each([
    ["board", "unified-board"],
    ["challenge", "unified-challenge"],
    ["match_complete", "unified-match-complete"],
  ])("lands on %s", (stage, testId) => {
    renderRouter(
      match({
        stage,
        ...(stage === "challenge" ? { currentChallenge: running } : {}),
        ...(stage === "match_complete"
          ? {
              status: "completed",
              result: {
                teams: [],
                winnerTeamId: "team-a",
                tie: false,
                worlds: [],
              },
            }
          : {}),
      }),
      {
        runtimeModeKey:
          stage === "challenge" ? "read-your-opponent" : undefined,
      },
    );

    expect(screen.getByTestId(testId)).toBeTruthy();
  });

  it("marks the rendered stage on the surface for a reload to land on", () => {
    renderRouter(match({ stage: "board" }));
    expect(document.querySelector("[data-match-stage='board']")).toBeTruthy();
  });
});

describe("fair-start presentation acknowledgement", () => {
  const gameplaySnapshot = ({
    awaiting = true,
    runtimeRevision = 7,
    sessionRevision = 4,
    modeKey = "combo",
    presentationSurface = false,
    generation,
  }: {
    awaiting?: boolean;
    runtimeRevision?: number;
    sessionRevision?: number;
    modeKey?: string;
    presentationSurface?: boolean;
    generation?: number;
  } = {}) =>
    ({
      sessionId: "session-1",
      revision: sessionRevision,
      teams: [],
      participants: [],
      availableActions: [],
      gameplay: {
        runtimeId: "runtime-1",
        revision: runtimeRevision,
        mode: { key: modeKey, version: 1 },
        status: "active",
        modeState: awaiting ? { awaitingPresentation: true } : {},
        ...(presentationSurface || generation !== undefined
          ? {
              presentationSurface: {
                running: true,
                capability: "shared" as const,
                ...(generation !== undefined ? { generation } : {}),
              },
            }
          : {}),
        transitions: [],
        availableActions: [],
      },
    }) as unknown as LiveSessionSnapshot;

  const tree = (
    snapshot: LiveSessionSnapshot,
    presentationReady: ReturnType<typeof vi.fn>,
    presentationReadySocket?: ReturnType<typeof vi.fn>,
    connectionEpoch = 1,
  ) => (
    <LiveSessionContext.Provider
      value={
        {
          snapshot,
          connection: "connected",
          connectionEpoch,
          presentationReady,
          presentationReadySocket,
          sessionId: "session-1",
        } as never
      }
    >
      <MatchGameplayRenderer actor="controller" />
    </LiveSessionContext.Provider>
  );

  const renderWith = (
    snapshot: LiveSessionSnapshot,
    presentationReady = vi.fn().mockResolvedValue(undefined),
    presentationReadySocket?: ReturnType<typeof vi.fn>,
  ) => {
    const view = render(
      tree(snapshot, presentationReady, presentationReadySocket),
    );
    return {
      ack: presentationReady,
      socketAck: presentationReadySocket,
      unmount: view.unmount,
      rerenderWith: (next: LiveSessionSnapshot, connectionEpoch = 1) =>
        view.rerender(
          tree(next, presentationReady, presentationReadySocket, connectionEpoch),
        ),
    };
  };

  it("issues exactly one acknowledgement with the on-screen revisions while awaiting (pre-connected flow)", async () => {
    const { ack } = renderWith(gameplaySnapshot());
    expect(screen.getByTestId("challenge-preparing")).toBeTruthy();
    expect(screen.queryByTestId("combo-gameplay-panel")).toBeNull();
    await waitFor(() => expect(ack).toHaveBeenCalledTimes(1));
    expect(ack).toHaveBeenCalledWith({
      expectedSessionRevision: 4,
      expectedRuntimeRevision: 7,
    });
  });

  it("acknowledges when the FIRST rendered snapshot is already awaiting (cold open)", async () => {
    // No prior non-awaiting snapshot ever reached this surface — the exact
    // cold-open case that used to drop the ack. It must still be issued, using
    // the revisions from the snapshot on screen (not any lagging provider ref).
    const { ack } = renderWith(gameplaySnapshot({ runtimeRevision: 11 }));
    await waitFor(() => expect(ack).toHaveBeenCalledTimes(1));
    expect(ack).toHaveBeenCalledWith({
      expectedSessionRevision: 4,
      expectedRuntimeRevision: 11,
    });
  });

  it("acknowledges on a fresh remount straight into an awaiting runtime (refresh)", async () => {
    const first = renderWith(gameplaySnapshot());
    await waitFor(() => expect(first.ack).toHaveBeenCalledTimes(1));
    first.unmount();
    const second = renderWith(gameplaySnapshot());
    await waitFor(() => expect(second.ack).toHaveBeenCalledTimes(1));
  });

  it("does not pin the key when an attempt is not accepted, and retries on the next snapshot", async () => {
    const ack = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValue(undefined);
    const { rerenderWith } = renderWith(gameplaySnapshot(), ack);
    await waitFor(() => expect(ack).toHaveBeenCalledTimes(1)); // failed, not pinned
    rerenderWith(gameplaySnapshot()); // same revision, new snapshot → retry
    await waitFor(() => expect(ack).toHaveBeenCalledTimes(2)); // accepted, now pinned
    rerenderWith(gameplaySnapshot());
    await waitFor(() => expect(ack).toHaveBeenCalledTimes(2)); // no further resend
  });

  it("does not resend for the same runtime revision once accepted", async () => {
    const { ack, rerenderWith } = renderWith(gameplaySnapshot());
    await waitFor(() => expect(ack).toHaveBeenCalledTimes(1));
    rerenderWith(gameplaySnapshot());
    rerenderWith(gameplaySnapshot());
    await waitFor(() => expect(ack).toHaveBeenCalledTimes(1));
  });

  it("acknowledges the new runtime when the revision changes", async () => {
    const { ack, rerenderWith } = renderWith(
      gameplaySnapshot({ runtimeRevision: 7 }),
    );
    await waitFor(() => expect(ack).toHaveBeenCalledTimes(1));
    rerenderWith(gameplaySnapshot({ runtimeRevision: 8, sessionRevision: 5 }));
    await waitFor(() => expect(ack).toHaveBeenCalledTimes(2));
    expect(ack).toHaveBeenLastCalledWith({
      expectedSessionRevision: 5,
      expectedRuntimeRevision: 8,
    });
  });

  it("does not acknowledge once activated, and a reconnect re-delivering it does not re-acknowledge", async () => {
    const { ack, rerenderWith } = renderWith(
      gameplaySnapshot({ awaiting: false }),
    );
    expect(screen.queryByTestId("challenge-preparing")).toBeNull();
    rerenderWith(gameplaySnapshot({ awaiting: false }));
    await Promise.resolve();
    expect(ack).not.toHaveBeenCalled();
  });

  it("acknowledges an awaiting Bomb runtime the same way (shared foundation)", async () => {
    const { ack } = renderWith(
      gameplaySnapshot({ modeKey: "bomb", runtimeRevision: 3 }),
    );
    await waitFor(() => expect(ack).toHaveBeenCalledTimes(1));
    expect(ack).toHaveBeenCalledWith({
      expectedSessionRevision: 4,
      expectedRuntimeRevision: 3,
    });
  });

  it("acknowledges a multi-surface runtime (RYO) over the socket and never over HTTP", async () => {
    // RYO declares `presentationSurface.running`, which is the server saying the
    // acknowledgement must be bound to this exact socket connection so a
    // disconnect can withdraw it. The HTTP channel carries no connection
    // identity, so routing the ack there would be refused server-side — the
    // renderer must pick the socket, and must not leak an HTTP ack alongside it.
    const { ack, socketAck } = renderWith(
      gameplaySnapshot({
        modeKey: "read-your-opponent",
        presentationSurface: true,
      }),
      vi.fn().mockResolvedValue(undefined),
      vi.fn().mockResolvedValue(undefined),
    );
    // Still held on the preparing loader: no mechanic screen while any surface
    // is still mounting, even for the shared screen.
    expect(screen.getByTestId("challenge-preparing")).toBeTruthy();
    expect(screen.queryByTestId("renderer-ryo")).toBeNull();

    await waitFor(() => expect(socketAck).toHaveBeenCalledTimes(1));
    expect(socketAck).toHaveBeenCalledWith({
      expectedSessionRevision: 4,
      expectedRuntimeRevision: 7,
    });
    expect(ack).not.toHaveBeenCalled();
  });

  it("keeps the HTTP acknowledgement for a single-surface mechanic", async () => {
    // No `presentationSurface` means the runtime opts into the default
    // single-surface contract, which the HTTP acknowledgement serves.
    const { ack, socketAck } = renderWith(
      gameplaySnapshot({ modeKey: "bomb", runtimeRevision: 3 }),
      vi.fn().mockResolvedValue(undefined),
      vi.fn().mockResolvedValue(undefined),
    );
    await waitFor(() => expect(ack).toHaveBeenCalledTimes(1));
    expect(socketAck).not.toHaveBeenCalled();
  });

  it("never falls back to HTTP when a multi-surface runtime has no socket channel", async () => {
    // A surface that cannot present without a connection must stay silent
    // rather than send a single-surface HTTP ack: the server would (correctly)
    // refuse it, and this surface has no connection identity to bind anyway.
    const { ack } = renderWith(
      gameplaySnapshot({
        modeKey: "read-your-opponent",
        presentationSurface: true,
        runtimeRevision: 9,
      }),
      vi.fn().mockResolvedValue(undefined),
    );
    await Promise.resolve();
    expect(screen.getByTestId("challenge-preparing")).toBeTruthy();
    expect(ack).not.toHaveBeenCalled();
  });

  it("replaces the shared preparing loader with the mechanic once activation lands", async () => {
    const socketAck = vi.fn().mockResolvedValue(undefined);
    const { ack, socketAck: onSocket, rerenderWith } = renderWith(
      gameplaySnapshot({
        modeKey: "read-your-opponent",
        presentationSurface: true,
      }),
      vi.fn().mockResolvedValue(undefined),
      socketAck,
    );
    expect(screen.getByTestId("challenge-preparing")).toBeTruthy();
    await waitFor(() => expect(onSocket).toHaveBeenCalledTimes(1));

    rerenderWith(
      gameplaySnapshot({
        modeKey: "read-your-opponent",
        presentationSurface: true,
        awaiting: false,
      }),
    );
    expect(screen.queryByTestId("challenge-preparing")).toBeNull();
    expect(screen.getByTestId("renderer-ryo")).toBeTruthy();
    await Promise.resolve();
    // Activation cleared `awaiting`, so nothing further is sent — and nothing
    // was sent over HTTP at any point.
    expect(onSocket).toHaveBeenCalledTimes(1);
    expect(ack).not.toHaveBeenCalled();
  });

  it("retries a rejected socket acknowledgement on the next snapshot and pins a success", async () => {
    // The socket channel can reject (no live connection yet). The renderer must
    // not pin an attempt that was never accepted, so a later authoritative
    // snapshot retries; once accepted, the revision is pinned like any other.
    const socketAck = vi
      .fn()
      .mockRejectedValueOnce(new Error("no live connection"))
      .mockResolvedValue(undefined);
    const { ack, socketAck: onSocket, rerenderWith } = renderWith(
      gameplaySnapshot({ presentationSurface: true }),
      vi.fn().mockResolvedValue(undefined),
      socketAck,
    );
    await waitFor(() => expect(onSocket).toHaveBeenCalledTimes(1));
    rerenderWith(gameplaySnapshot({ presentationSurface: true }));
    await waitFor(() => expect(onSocket).toHaveBeenCalledTimes(2));
    rerenderWith(gameplaySnapshot({ presentationSurface: true }));
    await waitFor(() => expect(onSocket).toHaveBeenCalledTimes(2));
    expect(ack).not.toHaveBeenCalled();
  });

  // ── Recurring generation-aware acknowledgement (Batch B) ──────────────────
  const recurring = (
    generation: number,
    over: { runtimeRevision?: number; sessionRevision?: number; awaiting?: boolean } = {},
  ) =>
    gameplaySnapshot({
      modeKey: "read-your-opponent",
      generation,
      runtimeRevision: over.runtimeRevision ?? 20 + generation,
      sessionRevision: over.sessionRevision ?? 10 + generation,
      awaiting: over.awaiting ?? true,
    });

  const socketHarness = (snapshot: LiveSessionSnapshot) => {
    const socketAck = vi.fn().mockResolvedValue(undefined);
    const httpAck = vi.fn().mockResolvedValue(undefined);
    return {
      ...renderWith(snapshot, httpAck, socketAck),
      socketAck,
      httpAck,
    };
  };

  it("acknowledges a prepared recurring generation with the exact projected generation", async () => {
    const { socketAck, httpAck } = socketHarness(recurring(1));
    await waitFor(() => expect(socketAck).toHaveBeenCalledTimes(1));
    expect(socketAck).toHaveBeenCalledWith({
      expectedSessionRevision: 11,
      expectedRuntimeRevision: 21,
      presentationGeneration: 1,
    });
    // The generation is echoed verbatim — never invented, never incremented.
    expect(httpAck).not.toHaveBeenCalled();
  });

  it("a generation-1 success does not suppress generation 2", async () => {
    const { socketAck, rerenderWith } = socketHarness(recurring(1));
    await waitFor(() => expect(socketAck).toHaveBeenCalledTimes(1));
    rerenderWith(recurring(2));
    await waitFor(() => expect(socketAck).toHaveBeenCalledTimes(2));
    expect(socketAck).toHaveBeenLastCalledWith({
      expectedSessionRevision: 12,
      expectedRuntimeRevision: 22,
      presentationGeneration: 2,
    });
  });

  it("a generation-2 success does not suppress generation 3", async () => {
    const { socketAck, rerenderWith } = socketHarness(recurring(2));
    await waitFor(() => expect(socketAck).toHaveBeenCalledTimes(1));
    rerenderWith(recurring(3));
    await waitFor(() => expect(socketAck).toHaveBeenCalledTimes(2));
    expect(socketAck).toHaveBeenLastCalledWith({
      expectedSessionRevision: 13,
      expectedRuntimeRevision: 23,
      presentationGeneration: 3,
    });
  });

  it("does not resend for the same generation across rerenders", async () => {
    const { socketAck, rerenderWith } = socketHarness(recurring(2));
    await waitFor(() => expect(socketAck).toHaveBeenCalledTimes(1));
    rerenderWith(recurring(2));
    rerenderWith(recurring(2));
    await waitFor(() => expect(socketAck).toHaveBeenCalledTimes(1));
  });

  it("a late generation-1 success cannot mark generation 2 acknowledged", async () => {
    let resolveGen1: (() => void) | undefined;
    const socketAck = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<void>((resolve) => (resolveGen1 = () => resolve())),
      )
      .mockResolvedValue(undefined);
    const httpAck = vi.fn().mockResolvedValue(undefined);
    const view = renderWith(recurring(1), httpAck, socketAck);
    await waitFor(() => expect(socketAck).toHaveBeenCalledTimes(1));
    // The server advances to generation 2 while generation 1 is still in flight.
    view.rerenderWith(recurring(2));
    await waitFor(() => expect(socketAck).toHaveBeenCalledTimes(2));
    // Generation 1 resolves late; it must not pin generation 2 as acknowledged.
    resolveGen1?.();
    await Promise.resolve();
    view.rerenderWith(recurring(2));
    // Generation 2 stays pinned by its own success — no extra send, no corruption.
    await waitFor(() => expect(socketAck).toHaveBeenCalledTimes(2));
    expect(socketAck).toHaveBeenLastCalledWith({
      expectedSessionRevision: 12,
      expectedRuntimeRevision: 22,
      presentationGeneration: 2,
    });
  });

  it("keeps the current generation retryable after a transient failure", async () => {
    const socketAck = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient"))
      .mockResolvedValue(undefined);
    const view = renderWith(recurring(2), vi.fn(), socketAck);
    await waitFor(() => expect(socketAck).toHaveBeenCalledTimes(1)); // failed
    view.rerenderWith(recurring(2));
    await waitFor(() => expect(socketAck).toHaveBeenCalledTimes(2)); // retried
    view.rerenderWith(recurring(2));
    await waitFor(() => expect(socketAck).toHaveBeenCalledTimes(2)); // pinned
  });

  it("does not spin on a stale-generation rejection; it waits for a newer snapshot", async () => {
    const socketAck = vi.fn().mockRejectedValue(new Error("stale generation"));
    const view = renderWith(recurring(1), vi.fn(), socketAck);
    await waitFor(() => expect(socketAck).toHaveBeenCalledTimes(1));
    // No new snapshot arrives: the effect is snapshot-driven, so it does not loop.
    await Promise.resolve();
    await Promise.resolve();
    expect(socketAck).toHaveBeenCalledTimes(1);
    // The authoritative newer snapshot (generation 2) drives the next attempt.
    view.rerenderWith(recurring(2));
    await waitFor(() => expect(socketAck).toHaveBeenCalledTimes(2));
  });

  it("cold-opens straight into a prepared generation 2 and acknowledges it", async () => {
    const { socketAck } = socketHarness(recurring(2));
    await waitFor(() => expect(socketAck).toHaveBeenCalledTimes(1));
    expect(socketAck).toHaveBeenCalledWith({
      expectedSessionRevision: 12,
      expectedRuntimeRevision: 22,
      presentationGeneration: 2,
    });
  });

  it("does not acknowledge a cold-open on an already-activated generation", async () => {
    const { socketAck, httpAck } = socketHarness(
      recurring(2, { awaiting: false }),
    );
    expect(screen.queryByTestId("challenge-preparing")).toBeNull();
    await Promise.resolve();
    expect(socketAck).not.toHaveBeenCalled();
    expect(httpAck).not.toHaveBeenCalled();
  });

  it("does not re-acknowledge the same prepared generation on ordinary revision bumps (no storm)", async () => {
    // The dedupe identity is semantic (generation + capability + connection epoch),
    // NOT the runtime revision — so unrelated revision updates while the same
    // generation stays prepared over the same live connection never re-acknowledge.
    const { socketAck, rerenderWith } = socketHarness(
      recurring(2, { runtimeRevision: 30 }),
    );
    await waitFor(() => expect(socketAck).toHaveBeenCalledTimes(1));
    rerenderWith(recurring(2, { runtimeRevision: 31 }), 1); // same epoch
    rerenderWith(recurring(2, { runtimeRevision: 32 }), 1);
    rerenderWith(recurring(2, { runtimeRevision: 33 }), 1);
    await waitFor(() => expect(socketAck).toHaveBeenCalledTimes(1));
  });

  it("re-acknowledges the same generation after a socket reconnect (new connection epoch)", async () => {
    // A reconnect starts a new connection epoch; the server has withdrawn the old
    // connection's readiness, so the surface must acknowledge the same generation
    // again on the new connection — distinguishable from an ordinary revision bump.
    const { socketAck, rerenderWith } = socketHarness(
      recurring(2, { runtimeRevision: 30 }),
    );
    await waitFor(() => expect(socketAck).toHaveBeenCalledTimes(1));
    // Same generation, but a NEW connection epoch (2) — a reconnect.
    rerenderWith(recurring(2, { runtimeRevision: 31 }), 2);
    await waitFor(() => expect(socketAck).toHaveBeenCalledTimes(2));
    expect(socketAck).toHaveBeenLastCalledWith({
      expectedSessionRevision: 12,
      expectedRuntimeRevision: 31,
      presentationGeneration: 2,
    });
  });

  it("shows only the safe preparing shell while a recurring generation is prepared", async () => {
    socketHarness(recurring(2));
    expect(screen.getByTestId("challenge-preparing")).toBeTruthy();
    expect(screen.queryByTestId("renderer-ryo")).toBeNull();
  });
});
