import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSessionContext } from "@/features/live-game-session/hooks/live-session-context";
import { MatchStageRouter } from "@/features/live-game-session/match/match-stage-router";
import type {
  LiveSessionMatchSnapshot,
  MatchSlotKey,
  UnifiedBoardPosition,
} from "@/features/live-game-session/match/types";
import type { LiveSessionSnapshot } from "@/features/live-game-session/model";

/**
 * The handoff from creation to the board.
 *
 * A preconfigured Match arrives at `board` with twelve positions, and the router
 * must show that whole board — never the sequential setup screens it was created
 * past, and never a legacy world-by-world board built from `currentOccurrence`.
 */

const ANIME = "world-anime";
const FOOTBALL = "world-football";

const api = vi.hoisted(() => ({
  createMatch: vi.fn(),
  startMatch: vi.fn(),
  resolveMatchCoinToss: vi.fn(),
  listMatchWorlds: vi.fn(),
  selectMatchWorld: vi.fn(),
  listMatchScopes: vi.fn(),
  selectMatchScopes: vi.fn(),
  launchMatchChallenge: vi.fn(),
  continueMatchWorld: vi.fn(),
  cancelMatch: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/features/live-game-session/match/api/match-api", () => api);

vi.mock("@/features/worlds/hooks/use-player-catalog", () => ({
  usePlayableWorlds: () => ({
    data: [
      { id: ANIME, name: "انمي" },
      { id: FOOTBALL, name: "كرة القدم" },
    ],
    isLoading: false,
    isError: false,
    isSuccess: true,
  }),
  usePlayableWorld: () => ({ data: undefined, isLoading: false }),
  usePlayableScopes: () => ({ data: [], isLoading: false, isSuccess: true }),
}));

const SLOTS: MatchSlotKey[] = ["slot_1", "slot_2", "slot_3", "slot_4"];

const position = (
  occurrenceIndex: number,
  worldId: string,
  slotKey: MatchSlotKey,
  index: number,
): UnifiedBoardPosition => ({
  positionKey: `${occurrenceIndex}#${slotKey}`,
  occurrenceIndex,
  worldId,
  slotKey,
  challengeTypeId: `${worldId}-type-${index}`,
  challengeKey: index === 1 ? "read-your-opponent" : `mechanic-${index}`,
  challengeName: `تحدي ${occurrenceIndex}-${index}`,
  requiresPhones: true,
  launchability: index === 1 ? "launchable" : "configured_but_unimplemented",
  ...(index === 1
    ? {}
    : { unavailableReason: "launcher_not_implemented" as const }),
  status: "available",
});

const OCCURRENCE_WORLDS = [ANIME, FOOTBALL, ANIME];

function unifiedMatch(
  overrides: Partial<LiveSessionMatchSnapshot> = {},
): LiveSessionMatchSnapshot {
  return {
    id: "match-1",
    revision: 0,
    setupMode: "unified_preconfigured",
    status: "active",
    stage: {
      key: "board",
      enteredAt: "2026-08-01T00:00:00.000Z",
      minimumDisplayDurationMs: 0,
      audioCue: null,
      animationCue: null,
    },
    coinToss: {
      status: "resolved",
      winnerTeamId: "team-a",
      firstChooserTeamId: "team-a",
    },
    worldSelection: {
      selections: OCCURRENCE_WORLDS.map((worldId, occurrenceIndex) => ({
        occurrenceIndex,
        worldId,
        method: "preconfigured" as const,
        selectedAt: "2026-08-01T00:00:00.000Z",
      })),
      requiresAgreement: false,
      remainingCount: 0,
      complete: true,
    },
    unified: {
      occurrences: OCCURRENCE_WORLDS.map((worldId, occurrenceIndex) => ({
        occurrenceIndex,
        worldId,
        worldName: worldId === ANIME ? "انمي" : "كرة القدم",
        selectedScopeIds: SLOTS.map(
          (_, index) => `scope-${occurrenceIndex}-${index}`,
        ),
        selectedScopes: SLOTS.map((_, index) => ({
          scopeId: `scope-${occurrenceIndex}-${index}`,
          name: `نطاق ${occurrenceIndex}-${index}`,
        })),
        subtotals: [],
      })),
      board: {
        positions: OCCURRENCE_WORLDS.flatMap((worldId, occurrenceIndex) =>
          SLOTS.map((slotKey, index) =>
            position(occurrenceIndex, worldId, slotKey, index),
          ),
        ),
        totalPositionCount: 12,
        completedPositionCount: 0,
      },
      selectingTeamId: "team-a",
    },
    scoring: {
      matchTotals: [
        { teamId: "team-a", signedTotal: 0, displayTotal: 0 },
        { teamId: "team-b", signedTotal: 0, displayTotal: 0 },
      ],
      worldSubtotals: [],
    },
    availableActions: ["match:launch-challenge", "match:cancel"],
    ...overrides,
  };
}

function snapshot(match: LiveSessionMatchSnapshot): LiveSessionSnapshot {
  return {
    sessionId: "session-1",
    mode: { key: "core-timed-turns", version: 1 },
    status: "active",
    revision: 4,
    serverTimestamp: "2026-08-01T00:00:00.000Z",
    round: { number: 1 },
    teams: [
      {
        id: "team-a",
        name: "البنفسجي",
        active: true,
        clock: {
          remainingMs: 1000,
          running: false,
          expired: false,
          budgetMs: 1000,
        },
      },
      {
        id: "team-b",
        name: "الأخضر",
        active: true,
        clock: {
          remainingMs: 1000,
          running: false,
          expired: false,
          budgetMs: 1000,
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
    availableActions: [],
    createdAt: "2026-08-01T00:00:00.000Z",
    lastTransitionAt: "2026-08-01T00:00:00.000Z",
    expiresAt: "2026-08-02T00:00:00.000Z",
    match,
  } as unknown as LiveSessionSnapshot;
}

function renderRouter(match: LiveSessionMatchSnapshot) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <LiveSessionContext.Provider
        value={
          {
            snapshot: snapshot(match),
            connection: "connected",
            error: undefined,
            resync: vi.fn(),
            sessionId: "session-1",
          } as never
        }
      >
        <MatchStageRouter actor="controller" />
      </LiveSessionContext.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  for (const mock of Object.values(api)) mock.mockReset();
  api.listMatchWorlds.mockResolvedValue([]);
});

describe("unified Match board handoff", () => {
  it("renders all twelve positions grouped by occurrence", () => {
    renderRouter(unifiedMatch());

    const board = screen.getByTestId("unified-board");
    expect(board).toBeTruthy();
    expect(screen.getByTestId("board-progress").textContent).toBe("0/12");
    for (let occurrenceIndex = 0; occurrenceIndex < 3; occurrenceIndex += 1) {
      const section = screen.getByTestId(
        `unified-occurrence-${occurrenceIndex}`,
      );
      for (const slotKey of SLOTS) {
        expect(
          within(section).getByTestId(
            `unified-position-${occurrenceIndex}#${slotKey}`,
          ),
        ).toBeTruthy();
      }
    }
    // Twelve positions, keyed by occurrence and slot.
    expect(
      screen
        .getAllByTestId(/^unified-position-/)
        .map((node) => node.dataset.testid),
    ).toHaveLength(12);
  });

  it("keeps two occurrences of one World separate", () => {
    renderRouter(unifiedMatch());

    const first = screen.getByTestId("unified-occurrence-0");
    const third = screen.getByTestId("unified-occurrence-2");
    // Same World name at both, and four distinct positions each.
    expect(first.textContent).toContain("انمي");
    expect(third.textContent).toContain("انمي");
    expect(first.textContent).toContain("نطاق 0-0");
    expect(third.textContent).toContain("نطاق 2-0");
    expect(first.textContent).not.toContain("نطاق 2-0");
    expect(
      within(first).getByTestId("unified-position-0#slot_2"),
    ).not.toBe(within(third).getByTestId("unified-position-2#slot_2"));
  });

  it("never renders the sequential setup board or its selectable-World list", () => {
    renderRouter(unifiedMatch());

    // The legacy board keys on currentOccurrence, which a unified Match has none of.
    expect(screen.queryByLabelText("لوحة تحديات العالم")).toBeNull();
    expect(screen.queryByText(/العالم 1 من 3/)).toBeNull();
    // And the sequential Worlds endpoint is never called for it.
    expect(api.listMatchWorlds).not.toHaveBeenCalled();
  });

  it("refuses to render a sequential setup stage for a unified Match", () => {
    for (const key of [
      "lobby",
      "coin_toss",
      "world_selection",
      "scope_selection",
      "world_complete",
    ] as const) {
      const view = renderRouter(
        unifiedMatch({
          stage: {
            key,
            enteredAt: "2026-08-01T00:00:00.000Z",
            minimumDisplayDurationMs: 0,
            audioCue: null,
            animationCue: null,
          },
        }),
      );
      expect(screen.queryByTestId("unified-board")).toBeNull();
      expect(screen.queryByLabelText("اختيار العالم")).toBeNull();
      // Reported as a client/server disagreement instead of being rendered.
      expect(screen.getByText(/تحديث|مزامنة|غير مدعومة/)).toBeTruthy();
      view.unmount();
    }
  });

  it("shows a completed position without touching the other eleven", () => {
    const match = unifiedMatch();
    const board = match.unified!.board;
    renderRouter({
      ...match,
      unified: {
        ...match.unified!,
        board: {
          ...board,
          completedPositionCount: 1,
          positions: board.positions.map((entry) =>
            entry.positionKey === "2#slot_2"
              ? {
                  ...entry,
                  status: "completed" as const,
                  scoreSummary: [
                    { teamId: "team-a", signedTotal: 2, displayTotal: 2 },
                  ],
                }
              : entry,
          ),
        },
        selectingTeamId: "team-b",
      },
    });

    expect(screen.getByTestId("board-progress").textContent).toBe("1/12");
    const completed = screen.getByTestId("unified-position-2#slot_2");
    expect(within(completed).getByLabelText("مكتمل")).toBeTruthy();
    expect(completed.textContent).toContain("البنفسجي: 2");
    // The identically-slotted position of the repeated World is untouched.
    expect(
      within(screen.getByTestId("unified-position-0#slot_2")).queryByLabelText(
        "مكتمل",
      ),
    ).toBeNull();
    // Selection alternated to the other team.
    expect(screen.getByTestId("selecting-team").textContent).toContain(
      "الأخضر",
    );
  });
});
