import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
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
 * Choosing a challenge from the unified board.
 *
 * A tile click *prepares* a position — it never starts a runtime. The load-bearing
 * assertions: any occurrence can go first, and the request carries no ContentItem
 * id. What happens next belongs to the preflight, which has its own suite.
 */

const ANIME = "world-anime";
const FOOTBALL = "world-football";
const SLOTS: MatchSlotKey[] = ["slot_1", "slot_2", "slot_3", "slot_4"];
const OCCURRENCE_WORLDS = [ANIME, FOOTBALL, ANIME];

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  resync: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/features/match-setup", () => ({
  prepareUnifiedChallenge: mocks.prepare,
  occurrenceLabel: (index: number) =>
    ["العالم الأول", "العالم الثاني", "العالم الثالث"][index],
}));

const position = (
  occurrenceIndex: number,
  worldId: string,
  slotKey: MatchSlotKey,
  index: number,
  overrides: Partial<UnifiedBoardPosition> = {},
): UnifiedBoardPosition => ({
  positionKey: `${occurrenceIndex}#${slotKey}`,
  occurrenceIndex,
  worldId,
  worldName: worldId === ANIME ? "انمي" : "كرة القدم",
  slotKey,
  challengeTypeId: `${worldId}-type-${index}`,
  challengeKey: index === 1 ? "read-your-opponent" : `mechanic-${index}`,
  challengeName: `تحدي ${occurrenceIndex}-${index}`,
  description: `وصف ${occurrenceIndex}-${index}`,
  instructions: `تعليمات ${occurrenceIndex}-${index}`,
  // Only the mechanic in slot_2 has a launcher; only slot_3 says it needs phones,
  // so the warning cannot be coming from a slug list on this side.
  requiresPhones: slotKey === "slot_3" || slotKey === "slot_2",
  launchability: index === 1 ? "launchable" : "configured_but_unimplemented",
  ...(index === 1
    ? {}
    : { unavailableReason: "launcher_not_implemented" as const }),
  status: "available",
  ...overrides,
});

function unifiedMatch(
  overrides: {
    positions?: UnifiedBoardPosition[];
    selectingTeamId?: string;
    stage?: string;
    completedPositionCount?: number;
  } = {},
): LiveSessionMatchSnapshot {
  const positions =
    overrides.positions ??
    OCCURRENCE_WORLDS.flatMap((worldId, occurrenceIndex) =>
      SLOTS.map((slotKey, index) =>
        position(occurrenceIndex, worldId, slotKey, index),
      ),
    );
  return {
    id: "match-1",
    revision: 7,
    status: "active",
    stage: {
      key: overrides.stage ?? "board",
      enteredAt: "2026-08-01T00:00:00.000Z",
      minimumDisplayDurationMs: 0,
      audioCue: null,
      animationCue: null,
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
        positions,
        totalPositionCount: 12,
        completedPositionCount: overrides.completedPositionCount ?? 0,
      },
      selectingTeamId: overrides.selectingTeamId ?? "team-a",
    },
    scoring: {
      matchTotals: [
        { teamId: "team-a", signedTotal: 0, displayTotal: 0 },
        { teamId: "team-b", signedTotal: 0, displayTotal: 0 },
      ],
      worldSubtotals: [],
    },
    standings: [
      { teamId: "team-a", name: "البنفسجي", signedTotal: 0, displayTotal: 0 },
      { teamId: "team-b", name: "الأخضر", signedTotal: 0, displayTotal: 0 },
    ],
    availableActions: ["match:launch-challenge", "match:cancel"],
  } as LiveSessionMatchSnapshot;
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
      { id: "team-a", name: "البنفسجي", active: true },
      { id: "team-b", name: "الأخضر", active: true },
    ],
    participants: [],
    availableActions: [],
    match,
  } as unknown as LiveSessionSnapshot;
}

function renderBoard(
  match: LiveSessionMatchSnapshot,
  actor: "controller" | "shared-screen" = "controller",
) {
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
            resync: mocks.resync,
            sessionId: "session-1",
          } as never
        }
      >
        <MatchStageRouter actor={actor} />
      </LiveSessionContext.Provider>
    </QueryClientProvider>,
  );
}

const tile = (positionKey: string) =>
  screen.getByTestId(`unified-position-${positionKey}`);

beforeEach(() => {
  mocks.prepare.mockReset();
  mocks.resync.mockReset();
  mocks.prepare.mockResolvedValue({ sessionId: "session-1" });
});

describe("unified board", () => {
  it("shows three occurrences, twelve positions, progress and the turn", () => {
    renderBoard(unifiedMatch());

    expect(screen.getAllByTestId(/^unified-occurrence-/)).toHaveLength(3);
    expect(screen.getAllByTestId(/^unified-position-/)).toHaveLength(12);
    expect(screen.getByTestId("board-progress").textContent).toBe("0/12");
    // Whose turn it is belongs to the board; the running scoreboard belongs to
    // the Match shell around it, so the board no longer restates both totals.
    expect(screen.getByTestId("selecting-team-board").textContent).toContain(
      "البنفسجي",
    );
    expect(screen.queryByTestId("team-scoreboard")).toBeNull();
  });

  it("shows every occurrence its own four Scopes, repeats included", () => {
    renderBoard(unifiedMatch());

    const first = screen.getByTestId("unified-occurrence-0");
    const third = screen.getByTestId("unified-occurrence-2");
    // The occurrence is headed by its World artwork: the occurrence label is the
    // eyebrow and the World name is the title, so both read on the same header.
    expect(first.textContent).toContain("العالم الأول");
    expect(first.textContent).toContain("انمي");
    expect(third.textContent).toContain("العالم الثالث");
    for (let index = 0; index < 4; index += 1) {
      expect(first.textContent).toContain(`نطاق 0-${index}`);
      expect(third.textContent).toContain(`نطاق 2-${index}`);
    }
    expect(first.textContent).not.toContain("نطاق 2-0");
    expect(within(first).getAllByTestId(/^unified-position-/)).toHaveLength(4);
    expect(within(third).getAllByTestId(/^unified-position-/)).toHaveLength(4);
  });

  it("prepares a position from the third occurrence first, naming no content", async () => {
    const user = userEvent.setup();
    renderBoard(unifiedMatch());

    // Occurrence 2 while occurrences 0 and 1 are untouched.
    await user.click(tile("2#slot_2"));

    await waitFor(() => expect(mocks.prepare).toHaveBeenCalledTimes(1));
    const request = mocks.prepare.mock.calls[0][0];
    expect(request).toMatchObject({
      sessionId: "session-1",
      expectedMatchRevision: 7,
      occurrenceIndex: 2,
      slotKey: "slot_2",
      selectingTeamId: "team-a",
    });
    // The whole point: no ContentItem id anywhere in the request.
    expect(JSON.stringify(request)).not.toContain("contentItem");
    expect(Object.keys(request).sort()).toEqual([
      "commandId",
      "expectedMatchRevision",
      "occurrenceIndex",
      "selectingTeamId",
      "sessionId",
      "slotKey",
    ]);
    // The board defers to the server for what comes next.
    expect(mocks.resync).toHaveBeenCalled();
  });

  it("prepares a position from any occurrence, in any order", async () => {
    const user = userEvent.setup();
    for (const [occurrenceIndex, expected] of [
      [1, "1#slot_2"],
      [0, "0#slot_2"],
    ] as const) {
      mocks.prepare.mockClear();
      const view = renderBoard(unifiedMatch());
      await user.click(tile(expected));
      await waitFor(() =>
        expect(mocks.prepare.mock.calls[0][0]).toMatchObject({
          occurrenceIndex,
        }),
      );
      view.unmount();
    }
  });

  it("does not prepare twice while a request is in flight", async () => {
    const user = userEvent.setup();
    let release: (value: unknown) => void = () => {};
    mocks.prepare.mockImplementation(
      () => new Promise((resolve) => (release = resolve)),
    );
    renderBoard(unifiedMatch());

    const choose = tile("0#slot_2");
    await user.click(choose);
    await user.click(choose);
    await user.click(choose);

    expect(mocks.prepare).toHaveBeenCalledTimes(1);
    release({ sessionId: "session-1" });
  });

  it("marks a phone-required tile without deciding anything itself", () => {
    renderBoard(unifiedMatch());

    // The badge is driven by the server capability, per position.
    expect(
      within(tile("0#slot_2")).getByText("يحتاج جوالات"),
    ).toBeTruthy();
    const positions = OCCURRENCE_WORLDS.flatMap((worldId, occurrenceIndex) =>
      SLOTS.map((slotKey, index) =>
        position(occurrenceIndex, worldId, slotKey, index, {
          requiresPhones: false,
        }),
      ),
    );
    renderBoard(unifiedMatch({ positions })).unmount();
  });

  it("says a mechanic has no launcher rather than calling it unfinished", () => {
    renderBoard(unifiedMatch());

    const locked = tile("0#slot_1");
    expect(locked.textContent).toContain("هذا التحدي غير مفعّل في أكوان");
    // The old detail named our internals at a room full of players.
    expect(locked.textContent).not.toContain("الخادم");
    // None of the "nearly ready" language this phase exists to remove.
    for (const obsolete of ["قيد التجهيز", "قريبًا", "قريباً"]) {
      expect(locked.textContent).not.toContain(obsolete);
    }
    expect(locked.tagName).toBe("ARTICLE");
  });

  it("never labels an unlaunchable position as available for selection", () => {
    renderBoard(unifiedMatch());

    // The server says status=available *and* launchability=configured_but_
    // unimplemented for this one. The tile must not claim both.
    const locked = tile("0#slot_1");
    expect(locked.dataset.status).toBe("available");
    expect(locked.dataset.launchability).toBe("configured_but_unimplemented");
    expect(locked.textContent).not.toContain("متاح للاختيار");
    expect(tile("0#slot_2").tagName).toBe("BUTTON");
  });

  it("tells a broken position apart from an unimplemented mechanic", () => {
    const positions = OCCURRENCE_WORLDS.flatMap((worldId, occurrenceIndex) =>
      SLOTS.map((slotKey, index) =>
        position(occurrenceIndex, worldId, slotKey, index, {
          ...(occurrenceIndex === 0 && slotKey === "slot_4"
            ? {
                status: "unavailable" as const,
                launchability: "unavailable" as const,
                unavailableReason: "invalid_configuration" as const,
              }
            : {}),
        }),
      ),
    );
    renderBoard(unifiedMatch({ positions }));

    const broken = tile("0#slot_4");
    expect(broken.textContent).toContain("ليست ضمن إعداد هذه المباراة");
    // And the unimplemented-mechanic tile still reads the other way round: the
    // server's two reasons stay two different sentences on the board.
    expect(broken.textContent).not.toContain("غير مفعّل في أكوان");
    expect(tile("0#slot_1").textContent).toContain("هذا التحدي غير مفعّل في أكوان");
    expect(tile("0#slot_1").textContent).not.toContain("ليست ضمن إعداد");
  });

  it("does not render a mechanic as unavailable just because a slug is unfamiliar", () => {
    // Same unknown slug, but the server says it is launchable — so it is offered.
    const positions = OCCURRENCE_WORLDS.flatMap((worldId, occurrenceIndex) =>
      SLOTS.map((slotKey, index) =>
        position(occurrenceIndex, worldId, slotKey, index, {
          challengeKey: "a-mechanic-this-client-has-never-heard-of",
          launchability: "launchable" as const,
        }),
      ),
    ).map((entry) => {
      const { unavailableReason: _dropped, ...rest } = entry;
      return rest as UnifiedBoardPosition;
    });
    renderBoard(unifiedMatch({ positions }));

    expect(screen.getAllByTestId(/^unified-position-/).filter((node) => node.tagName === "BUTTON")).toHaveLength(12);
  });

  it("reports a board that arrived with no positions instead of drawing an empty grid", () => {
    renderBoard(unifiedMatch({ positions: [] }));

    expect(screen.getByTestId("board-empty")).toBeTruthy();
    expect(screen.queryAllByTestId(/^unified-position-/)).toHaveLength(0);
  });

  it("keeps a completed position in place and unlaunchable", () => {
    const positions = OCCURRENCE_WORLDS.flatMap((worldId, occurrenceIndex) =>
      SLOTS.map((slotKey, index) =>
        position(occurrenceIndex, worldId, slotKey, index, {
          ...(occurrenceIndex === 2 && slotKey === "slot_2"
            ? {
                status: "completed" as const,
                completedAt: "2026-08-01T00:05:00.000Z",
                scoreSummary: [
                  { teamId: "team-a", signedTotal: 2, displayTotal: 2 },
                  { teamId: "team-b", signedTotal: 0, displayTotal: 0 },
                ],
              }
            : {}),
        }),
      ),
    );
    renderBoard(
      unifiedMatch({
        positions,
        completedPositionCount: 1,
        selectingTeamId: "team-b",
      }),
    );

    // Still on the board, still twelve, with its result shown.
    expect(screen.getAllByTestId(/^unified-position-/)).toHaveLength(12);
    const completed = tile("2#slot_2");
    expect(within(completed).getByLabelText("مكتمل")).toBeTruthy();
    expect(completed.textContent).toContain("البنفسجي");
    expect(completed.textContent).toContain("2");
    expect(completed.tagName).toBe("ARTICLE");
    // The identically-slotted position of the repeated World is still open.
    expect(tile("0#slot_2").tagName).toBe("BUTTON");
    // The turn alternated, and the progress moved by one.
    expect(screen.getByTestId("board-progress").textContent).toBe("1/12");
    expect(screen.getByTestId("selecting-team-board").textContent).toContain("الأخضر");
  });

  it("offers a way back into a running challenge", () => {
    const positions = OCCURRENCE_WORLDS.flatMap((worldId, occurrenceIndex) =>
      SLOTS.map((slotKey, index) =>
        position(occurrenceIndex, worldId, slotKey, index, {
          ...(occurrenceIndex === 1 && slotKey === "slot_2"
            ? { status: "in_progress" as const, runtimeId: "runtime-1" }
            : {}),
        }),
      ),
    );
    renderBoard(unifiedMatch({ positions }));

    const running = tile("1#slot_2");
    expect(running.dataset.status).toBe("in_progress");
    expect(running.tagName).toBe("BUTTON");
    expect(running.textContent).toContain("قيد اللعب");
  });

  it("gives a shared screen no launch controls", () => {
    renderBoard(unifiedMatch(), "shared-screen");

    expect(screen.getAllByTestId(/^unified-position-/).every((node) => node.tagName !== "BUTTON")).toBe(true);
    expect(screen.getByTestId("unified-board").textContent).toContain(
      "بانتظار المتحكّم",
    );
    // It still sees the whole board and whose turn it is.
    expect(screen.getAllByTestId(/^unified-position-/)).toHaveLength(12);
    expect(screen.getByTestId("selecting-team-board")).toBeTruthy();
  });

  it("surfaces a refused preparation without leaving the board", async () => {
    const user = userEvent.setup();
    mocks.prepare.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          code: "CHALLENGE_NOT_LAUNCHABLE",
          message: "The mechanic in the slot_2 position is unavailable",
        },
      },
    });
    renderBoard(unifiedMatch());

    await user.click(tile("0#slot_2"));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(mocks.resync).not.toHaveBeenCalled();
    // The board is intact and the position is still offered.
    expect(screen.getAllByTestId(/^unified-position-/)).toHaveLength(12);
    expect(tile("0#slot_2").tagName).toBe("BUTTON");
  });

  it("routes the last position to the Match complete screen", () => {
    const positions = OCCURRENCE_WORLDS.flatMap((worldId, occurrenceIndex) =>
      SLOTS.map((slotKey, index) =>
        position(occurrenceIndex, worldId, slotKey, index, {
          status: "completed" as const,
          scoreSummary: [
            { teamId: "team-a", signedTotal: 1, displayTotal: 1 },
            { teamId: "team-b", signedTotal: 0, displayTotal: 0 },
          ],
        }),
      ),
    );
    const match = unifiedMatch({
      positions,
      completedPositionCount: 12,
      stage: "match_complete",
    });
    renderBoard({
      ...match,
      status: "completed",
      result: {
        teams: match.scoring.matchTotals,
        winnerTeamId: "team-a",
        tie: false,
        worlds: [],
      },
    });

    expect(screen.queryByTestId("unified-board")).toBeNull();
    const complete = screen.getByTestId("unified-match-complete");
    expect(complete.textContent).toContain("انتهت المباراة");
    expect(complete.textContent).toContain("12/12 تحديًا مكتمل");
    expect(complete.textContent).toContain("الفائز: البنفسجي");
    // All twelve are still listed, grouped by occurrence.
    expect(screen.getAllByTestId(/^complete-occurrence-/)).toHaveLength(3);
    expect(screen.getAllByTestId(/^complete-position-/)).toHaveLength(12);
    // No setup screen and no session restart.
    expect(complete.textContent).not.toContain("اختر");
  });
});
