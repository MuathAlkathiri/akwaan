import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSessionContext } from "@/features/live-game-session/hooks/live-session-context";
import { MatchStageRouter } from "@/features/live-game-session/match/match-stage-router";
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

const mocks = vi.hoisted(() => ({ resync: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/features/match-setup", () => ({
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
vi.mock(
  "@/features/live-game-session/components/top5-panel",
  () => ({ Top5Panel: () => <div data-testid="renderer-top5" /> }),
);
vi.mock(
  "@/features/live-game-session/components/closest-gameplay-panel",
  () => ({ ClosestGameplayPanel: () => <div data-testid="renderer-closest" /> }),
);
vi.mock(
  "@/features/live-game-session/components/distributed-information-panel",
  () => ({
    DistributedInformationPanel: () => (
      <div data-testid="renderer-distributed-phone" />
    ),
  }),
);
vi.mock(
  "@/features/live-game-session/components/distributed-information-screen",
  () => ({
    DistributedInformationScreen: () => (
      <div data-testid="renderer-distributed-screen" />
    ),
  }),
);

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
});

describe("a running challenge is routed by its runtime mode key", () => {
  it.each([
    ["read-your-opponent", "renderer-ryo"],
    ["closest", "renderer-closest"],
    ["top-5", "renderer-top5"],
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
      runtimeModeKey: "distributed-information",
    });
    expect(screen.getByTestId("renderer-distributed-phone")).toBeTruthy();
    phone.unmount();

    for (const actor of ["controller", "shared-screen"] as const) {
      const view = renderRouter(state, {
        actor,
        runtimeModeKey: "distributed-information",
      });
      expect(screen.getByTestId("renderer-distributed-screen")).toBeTruthy();
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
    expect(screen.getByTestId("selecting-team-board").textContent).toContain("صقور الرياض");
    expect(screen.getByTestId("unified-board").textContent).toContain("3");
  });

  it("leaves the finished position unselectable without hiding it", () => {
    renderRouter(
      match({ stage: "board", positions: completed, completedPositionCount: 1 }),
    );

    const finished = screen.getByTestId("unified-position-1#slot_2");
    expect(finished.textContent).not.toContain("اختيار هذا التحدي");
    // The eleven others are still offered.
    expect(screen.getAllByTestId(/^unified-position-/).filter((node) => node.tagName === "BUTTON")).toHaveLength(11);
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
      { runtimeModeKey: stage === "challenge" ? "read-your-opponent" : undefined },
    );

    expect(screen.getByTestId(testId)).toBeTruthy();
  });

  it("marks the rendered stage on the surface for a reload to land on", () => {
    renderRouter(match({ stage: "board" }));
    expect(
      document.querySelector("[data-match-stage='board']"),
    ).toBeTruthy();
  });
});
