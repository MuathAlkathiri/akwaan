import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { LiveSessionContext } from "@/features/live-game-session/hooks/live-session-context";
import { MatchStageRouter } from "@/features/live-game-session/match/match-stage-router";
import type {
  LiveSessionMatchSnapshot,
  MatchActor,
  MatchSlotKey,
  UnifiedBoardPosition,
  UnifiedPreflight,
} from "@/features/live-game-session/match/types";
import type { LiveSessionSnapshot } from "@/features/live-game-session/model";

/**
 * A phone's lifecycle: waiting → preflight → gameplay → waiting.
 *
 * The phone never leaves the page it joined on and never shows the host's board,
 * which belongs to a different device. Between challenges it waits, with its
 * socket open, until the server puts it back into a challenge — no redirect and
 * no reload anywhere in the cycle.
 */

const SLOTS: MatchSlotKey[] = ["slot_1", "slot_2", "slot_3", "slot_4"];

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

vi.mock("@/features/live-game-session/components/ryo-gameplay-panel", () => ({
  RyoGameplayPanel: () => <div data-testid="renderer-ryo" />,
}));

const position = (
  occurrenceIndex: number,
  slotKey: MatchSlotKey,
): UnifiedBoardPosition => ({
  positionKey: `${occurrenceIndex}#${slotKey}`,
  occurrenceIndex,
  worldId: "world-1",
  worldName: "انمي",
  slotKey,
  challengeTypeId: "type-1",
  challengeKey: "read-your-opponent",
  challengeName: "اقرأ خصمك",
  requiresPhones: true,
  launchability: "launchable",
  status: "available",
});

function preflight(
  overrides: Partial<UnifiedPreflight> = {},
): UnifiedPreflight {
  return {
    positionKey: "0#slot_1",
    occurrenceIndex: 0,
    slotKey: "slot_1",
    worldId: "world-1",
    worldName: "انمي",
    challengeTypeId: "type-1",
    challengeKey: "read-your-opponent",
    challengeName: "اقرأ خصمك",
    requiresPhones: true,
    selectedScopes: [],
    teams: [
      {
        teamId: "team-a",
        teamName: "أسود الشمال",
        connectedCount: 1,
        minimum: 1,
        ready: true,
        participants: [],
      },
    ],
    allTeamsReady: true,
    readyToLaunch: true,
    blockingReasons: [],
    preparedAt: "2026-08-07T00:00:00.000Z",
    ...overrides,
  };
}

function match(
  overrides: {
    stage?: string;
    preflight?: UnifiedPreflight;
    currentChallenge?: LiveSessionMatchSnapshot["currentChallenge"];
  } = {},
): LiveSessionMatchSnapshot {
  return {
    id: "match-1",
    revision: 4,
    status: overrides.stage === "match_complete" ? "completed" : "active",
    stage: {
      key: overrides.stage ?? "board",
      enteredAt: "2026-08-07T00:00:00.000Z",
      minimumDisplayDurationMs: 0,
      audioCue: null,
      animationCue: null,
    },
    unified: {
      occurrences: [0, 1, 2].map((occurrenceIndex) => ({
        occurrenceIndex,
        worldId: "world-1",
        worldName: "انمي",
        selectedScopeIds: ["s0", "s1", "s2", "s3"],
        selectedScopes: [],
        subtotals: [],
      })),
      board: {
        positions: [0, 1, 2].flatMap((occurrenceIndex) =>
          SLOTS.map((slotKey) => position(occurrenceIndex, slotKey)),
        ),
        totalPositionCount: 12,
        completedPositionCount: 0,
      },
      selectingTeamId: "team-a",
      ...(overrides.preflight ? { preflight: overrides.preflight } : {}),
    },
    ...(overrides.currentChallenge
      ? { currentChallenge: overrides.currentChallenge }
      : {}),
    scoring: {
      matchTotals: [
        { teamId: "team-a", signedTotal: 0, displayTotal: 0 },
        { teamId: "team-b", signedTotal: 0, displayTotal: 0 },
      ],
      worldSubtotals: [],
    },
    standings: [
      { teamId: "team-a", name: "أسود الشمال", signedTotal: 0, displayTotal: 0 },
      { teamId: "team-b", name: "صقور الرياض", signedTotal: 0, displayTotal: 0 },
    ],
    ...(overrides.stage === "match_complete"
      ? {
          result: {
            teams: [],
            winnerTeamId: "team-a",
            tie: false,
            worlds: [],
          },
        }
      : {}),
    availableActions: [],
  } as LiveSessionMatchSnapshot;
}

function renderPhone(
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
    revision: 3,
    serverTimestamp: "2026-08-07T00:00:00.000Z",
    round: { number: 1 },
    teams: [
      { id: "team-a", name: "أسود الشمال", active: true },
      { id: "team-b", name: "صقور الرياض", active: true },
    ],
    participants: [
      {
        id: "participant-1",
        displayName: "لاعب اول",
        role: "team-player",
        teamId: "team-a",
        connected: true,
      },
    ],
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
            resync: vi.fn(),
            sessionId: "session-1",
          } as never
        }
      >
        <MatchStageRouter
          actor={options.actor ?? "participant"}
          participantId="participant-1"
        />
      </LiveSessionContext.Provider>
    </QueryClientProvider>,
  );
}

const running = {
  occurrenceIndex: 0,
  slotKey: "slot_1" as MatchSlotKey,
  challengeKey: "read-your-opponent",
  runtimeId: "runtime-1",
  startedAt: "2026-08-07T00:01:00.000Z",
};

describe("a phone waits instead of showing the host board", () => {
  it("shows the waiting screen while the Match is at its board", () => {
    renderPhone(match({ stage: "board" }));

    const waiting = screen.getByTestId("participant-waiting");
    expect(waiting.textContent).toContain("ما فيه تحدي يحتاج الجوال الحين");
    expect(waiting.textContent).toContain(
      "بنفتح التحدي الجاي هنا. خلّ جوالك معك.",
    );
    expect(waiting.textContent).toContain("أسود الشمال");
    // Never the host's screen.
    expect(screen.queryByTestId("unified-board")).toBeNull();
    expect(screen.queryAllByTestId(/^unified-position-/)).toHaveLength(0);
  });

  it("offers nothing to press, so there is nowhere to navigate", () => {
    renderPhone(match({ stage: "board" }));
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("still gives the host the board", () => {
    renderPhone(match({ stage: "board" }), { actor: "controller" });
    expect(screen.getByTestId("unified-board")).toBeTruthy();
    expect(screen.queryByTestId("participant-waiting")).toBeNull();
  });

  it("waits at the end of the Match rather than showing the result board", () => {
    renderPhone(match({ stage: "match_complete" }));

    const waiting = screen.getByTestId("participant-waiting");
    expect(waiting.dataset.matchComplete).toBe("true");
    expect(waiting.textContent).toContain("انتهت المباراة");
    expect(screen.queryByTestId("unified-match-complete")).toBeNull();
  });
});

describe("a phone follows the challenge lifecycle", () => {
  it("enters the preflight when the challenge wants phones", () => {
    renderPhone(match({ stage: "preflight", preflight: preflight() }));

    // A phone is not a small shared screen: it is told it is in, on which team,
    // and what is starting — never the host's readiness counters.
    const mine = screen.getByTestId("participant-preflight");
    expect(mine).toBeTruthy();
    expect(mine.textContent).toContain("أنت في المباراة");
    expect(screen.queryByTestId("preflight-waiting")).toBeNull();
    expect(screen.queryByTestId("participant-waiting")).toBeNull();
  });

  it("keeps waiting through a preflight that does not want phones", () => {
    renderPhone(
      match({
        stage: "preflight",
        preflight: preflight({ requiresPhones: false }),
      }),
    );

    expect(screen.getByTestId("participant-waiting")).toBeTruthy();
    expect(screen.queryByTestId("participant-preflight")).toBeNull();
  });

  it("enters gameplay when the runtime starts", () => {
    renderPhone(match({ stage: "challenge", currentChallenge: running }), {
      runtimeModeKey: "read-your-opponent",
    });

    expect(screen.getByTestId("renderer-ryo")).toBeTruthy();
    expect(screen.queryByTestId("participant-waiting")).toBeNull();
  });

  it("returns to waiting after the challenge, on the same page", () => {
    // The whole cycle, driven only by the stage the server reports.
    const cycle = [
      { state: match({ stage: "board" }), waiting: true },
      {
        state: match({ stage: "preflight", preflight: preflight() }),
        waiting: false,
      },
      {
        state: match({ stage: "challenge", currentChallenge: running }),
        waiting: false,
        runtimeModeKey: "read-your-opponent",
      },
      { state: match({ stage: "board" }), waiting: true },
    ];

    for (const step of cycle) {
      const view = renderPhone(step.state, {
        ...(step.runtimeModeKey
          ? { runtimeModeKey: step.runtimeModeKey }
          : {}),
      });
      expect(Boolean(screen.queryByTestId("participant-waiting"))).toBe(
        step.waiting,
      );
      expect(screen.queryByTestId("unified-board")).toBeNull();
      view.unmount();
    }
  });
});
