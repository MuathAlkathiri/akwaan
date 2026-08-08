import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSessionContext } from "@/features/live-game-session/hooks/live-session-context";
import { MatchStageRouter } from "@/features/live-game-session/match/match-stage-router";
import { MatchShell } from "@/features/live-game-session/match/components/match-shell";
import { Top5ResultReveal } from "@/features/live-game-session/match/components/top5-result-reveal";
import type {
  LiveSessionMatchSnapshot,
  MatchActor,
  MatchChallengeResult,
} from "@/features/live-game-session/match/types";
import type { LiveSessionSnapshot } from "@/features/live-game-session/model";

/**
 * The challenge result as a real Match stage.
 *
 * Three things are load-bearing. The result screen is what the server's stage
 * says, not a frontend interlude — so a refresh mid-reveal comes back to the
 * reveal. Nothing on it is computed here: the winner, the points, and the
 * ownership reveal order all arrive from the record. And a phone gets one
 * combined result/waiting screen on the page it already joined on.
 */

const mocks = vi.hoisted(() => ({
  resync: vi.fn(),
  continueFromChallengeResult: vi.fn().mockResolvedValue({}),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/features/match-setup", () => ({
  prepareUnifiedChallenge: vi.fn(),
  launchUnifiedChallenge: vi.fn(),
  cancelUnifiedPreflight: vi.fn(),
  continueFromChallengeResult: mocks.continueFromChallengeResult,
  occurrenceLabel: (index: number) =>
    ["العالم الأول", "العالم الثاني", "العالم الثالث"][index],
}));

const TEAM_A = "team-a";
const TEAM_B = "team-b";

/** Five ranked and five traps, exactly as the server records them. */
const ENTRIES = [
  ...[1, 2, 3, 4, 5].map((rank) => ({
    id: `real-${rank}`,
    label: `حقيقي ${rank}`,
    rank,
  })),
  ...[1, 2, 3, 4, 5].map((index) => ({
    id: `trap-${index}`,
    label: `فخ ${index}`,
    rank: null,
  })),
];

/** Team A owns three of the real five and two traps; team B the rest. */
const OWNERSHIP = [
  { entryId: "real-1", ownerTeamId: TEAM_A },
  { entryId: "real-2", ownerTeamId: TEAM_B },
  { entryId: "real-3", ownerTeamId: TEAM_A },
  { entryId: "real-4", ownerTeamId: TEAM_B },
  { entryId: "real-5", ownerTeamId: TEAM_A },
  { entryId: "trap-1", ownerTeamId: TEAM_A },
  { entryId: "trap-2", ownerTeamId: TEAM_B },
  { entryId: "trap-3", ownerTeamId: TEAM_A },
  { entryId: "trap-4", ownerTeamId: TEAM_B },
  { entryId: "trap-5", ownerTeamId: TEAM_B },
];

/** Deliberately not the ranked order: this is the suspense order. */
const REVEAL_ORDER = [
  "trap-3",
  "real-2",
  "trap-5",
  "real-4",
  "real-1",
  "trap-1",
  "real-5",
  "trap-2",
  "real-3",
  "trap-4",
];

function top5Result(
  overrides: Partial<MatchChallengeResult> = {},
): MatchChallengeResult {
  return {
    id: "result-1",
    positionKey: "0#slot_1",
    occurrenceIndex: 0,
    slotKey: "slot_1",
    worldId: "world-1",
    worldName: "كرة القدم",
    challengeTypeId: "type-top5",
    challengeKey: "top-5",
    challengeName: "أفضل 5",
    selectedScopeIds: ["s0", "s1", "s2", "s3"],
    winnerTeamId: TEAM_A,
    tie: false,
    // The Match point, not the mechanic's 3-2. Those live in `details`.
    matchPoints: [
      { teamId: TEAM_A, points: 1 },
      { teamId: TEAM_B, points: 0 },
    ],
    details: {
      title: "أفضل 5 هدافين",
      entries: ENTRIES,
      ownership: OWNERSHIP,
      top5Counts: { [TEAM_A]: 3, [TEAM_B]: 2 },
      trapCounts: { [TEAM_A]: 2, [TEAM_B]: 3 },
      revealOrder: REVEAL_ORDER,
      winnerTeamId: TEAM_A,
    },
    startedAt: "2026-08-07T10:00:00.000Z",
    completedAt: "2026-08-07T10:05:00.000Z",
    ...overrides,
  };
}

function ryoResult(): MatchChallengeResult {
  return {
    ...top5Result(),
    id: "result-ryo",
    challengeKey: "read-your-opponent",
    challengeName: "اقرأ خصمك",
    winnerTeamId: TEAM_B,
    tie: false,
    // One Match point to the winner, however the payoff matrix swung.
    matchPoints: [
      { teamId: TEAM_A, points: 0 },
      { teamId: TEAM_B, points: 1 },
    ],
    details: {
      itemsPlayed: 3,
      // The challenge's own signed totals — what the three items add up to.
      mechanicTotals: { [TEAM_A]: 1, [TEAM_B]: 2 },
      tie: false,
      items: [0, 1, 2].map((index) => ({
        itemIndex: index,
        prompt: `سؤال ${index + 1}`,
        answeringTeamId: index % 2 === 0 ? TEAM_A : TEAM_B,
        answererParticipantId: index % 2 === 0 ? "p-a1" : "p-b1",
        selectedAnswer: "أ",
        correctAnswer: "أ",
        correct: index !== 1,
        opposingTeamId: index % 2 === 0 ? TEAM_B : TEAM_A,
        deciderParticipantId: index % 2 === 0 ? "p-b1" : "p-a1",
        decision: index === 1 ? "steal" : "trust",
        mechanicPoints: [
          { teamId: index % 2 === 0 ? TEAM_A : TEAM_B, points: 1 },
        ],
      })),
    },
  };
}

function match(
  overrides: {
    stage?: string;
    challengeResult?: MatchChallengeResult;
    challengeHistory?: MatchChallengeResult[];
    completedPositionCount?: number;
    matchTotals?: Array<{
      teamId: string;
      signedTotal: number;
      displayTotal: number;
    }>;
  } = {},
): LiveSessionMatchSnapshot {
  return {
    id: "match-1",
    revision: 12,
    status: "active",
    stage: {
      key: overrides.stage ?? "challenge_result",
      enteredAt: "2026-08-07T10:05:00.000Z",
      minimumDisplayDurationMs: 0,
      audioCue: null,
      animationCue: null,
    },
    unified: {
      occurrences: [],
      board: {
        positions: [],
        totalPositionCount: 12,
        completedPositionCount: overrides.completedPositionCount ?? 1,
      },
      selectingTeamId: TEAM_A,
    },
    scoring: {
      matchTotals: overrides.matchTotals ?? [
        { teamId: TEAM_A, signedTotal: 1, displayTotal: 1 },
        { teamId: TEAM_B, signedTotal: 0, displayTotal: 0 },
      ],
      worldSubtotals: [],
    },
    standings: (
      overrides.matchTotals ?? [
        { teamId: TEAM_A, signedTotal: 1, displayTotal: 1 },
        { teamId: TEAM_B, signedTotal: 0, displayTotal: 0 },
      ]
    ).map((score) => ({
      ...score,
      name: score.teamId === TEAM_A ? "الأخضر" : "الوردي",
    })),
    ...(overrides.challengeResult
      ? { challengeResult: overrides.challengeResult }
      : {}),
    challengeHistory: overrides.challengeHistory ?? [],
    availableActions: ["match:continue-from-result", "match:cancel"],
  } as LiveSessionMatchSnapshot;
}

function snapshotOf(value: LiveSessionMatchSnapshot): LiveSessionSnapshot {
  return {
    sessionId: "session-1",
    mode: { key: "core-timed-turns", version: 1 },
    status: "active",
    revision: 4,
    serverTimestamp: "2026-08-07T10:05:00.000Z",
    round: { number: 1 },
    teams: [
      { id: TEAM_A, name: "البنفسجي", active: true },
      { id: TEAM_B, name: "الأخضر", active: true },
    ],
    participants: [
      {
        id: "p-a1",
        displayName: "أحمد",
        role: "team-player",
        teamId: TEAM_A,
        ready: true,
        connected: true,
      },
      {
        id: "p-b1",
        displayName: "خالد",
        role: "team-player",
        teamId: TEAM_B,
        ready: true,
        connected: true,
      },
    ],
    availableActions: [],
    match: value,
  } as unknown as LiveSessionSnapshot;
}

function renderRouter(
  value: LiveSessionMatchSnapshot,
  options: { actor?: MatchActor; participantId?: string } = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <LiveSessionContext.Provider
        value={{
          snapshot: snapshotOf(value),
          connection: "connected",
          nowMs: Date.parse("2026-08-07T10:05:00.000Z"),
          command: vi.fn(),
          gameplayCommand: vi.fn(),
          resync: mocks.resync,
        }}
      >
        <MatchStageRouter
          actor={options.actor ?? "controller"}
          {...(options.participantId
            ? { participantId: options.participantId }
            : {})}
        />
      </LiveSessionContext.Provider>
    </QueryClientProvider>,
  );
}

/** The Match shell around the stage, for the header scoreboard. */
function renderShell(value: LiveSessionMatchSnapshot) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <LiveSessionContext.Provider
        value={{
          snapshot: snapshotOf(value),
          connection: "connected",
          nowMs: Date.parse("2026-08-07T10:05:00.000Z"),
          command: vi.fn(),
          gameplayCommand: vi.fn(),
          resync: mocks.resync,
        }}
      >
        <MatchShell actor="controller">
          <MatchStageRouter actor="controller" />
        </MatchShell>
      </LiveSessionContext.Provider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("challenge result is an authoritative Match stage", () => {
  it("renders the result rather than the board when the server says so", () => {
    renderRouter(match({ challengeResult: top5Result() }));
    expect(screen.getByTestId("unified-challenge-result")).toBeTruthy();
    expect(screen.queryByTestId("unified-board")).toBeNull();
  });

  it("restores the same result after a refresh", () => {
    // A refresh is just another snapshot; nothing about the reveal was local.
    const { unmount } = renderRouter(match({ challengeResult: top5Result() }));
    unmount();
    renderRouter(match({ challengeResult: top5Result() }));
    expect(screen.getByTestId("top5-result-reveal")).toBeTruthy();
  });

  it("reports a stage that claims a result the server did not send", () => {
    // Falling back to the board here would show the host a Match state the
    // server does not believe in.
    renderRouter(match({ challengeResult: undefined }));
    expect(screen.getByTestId("challenge-result-missing")).toBeTruthy();
    expect(screen.queryByTestId("unified-board")).toBeNull();
  });

  it("moves on only through the host's explicit continue command", async () => {
    renderRouter(match({ challengeResult: top5Result() }));
    const button = screen.getByTestId("challenge-result-continue");
    expect(button.textContent).toContain("العودة إلى الأكوان");
    await userEvent.click(button);
    expect(mocks.continueFromChallengeResult).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "session-1",
        expectedMatchRevision: 12,
      }),
    );
  });

  it("offers to end the Match instead when the last position is done", () => {
    renderRouter(
      match({ challengeResult: top5Result(), completedPositionCount: 12 }),
    );
    expect(
      screen.getByTestId("challenge-result-continue").textContent,
    ).toContain("إنهاء المباراة");
  });

  it("gives a non-host screen no way to advance the Match", () => {
    renderRouter(match({ challengeResult: top5Result() }), {
      actor: "shared-screen",
    });
    expect(screen.queryByTestId("challenge-result-continue")).toBeNull();
  });
});

describe("Top 5 ownership reveal", () => {
  const result = top5Result();
  const snapshot = snapshotOf(match({ challengeResult: result }));

  it("starts with every field neutral and no winner", () => {
    render(<Top5ResultReveal result={result} snapshot={snapshot} />);
    for (const entry of ENTRIES) {
      expect(
        screen.getByTestId(`top5-field-${entry.id}`).dataset.revealed,
      ).toBe("false");
    }
    expect(screen.queryByTestId("top5-winner")).toBeNull();
    expect(screen.getByTestId(`top5-live-count-${TEAM_A}`).textContent).toBe(
      "0",
    );
  });

  it("keeps the factual order stable while the colours arrive out of order", () => {
    render(<Top5ResultReveal result={result} snapshot={snapshot} />);
    const ranked = screen.getAllByTestId(/^top5-field-real-/);
    // Ranked 1..5 in order, regardless of the reveal order.
    expect(
      ranked.map((node) => node.getAttribute("data-testid")),
    ).toEqual([
      "top5-field-real-1",
      "top5-field-real-2",
      "top5-field-real-3",
      "top5-field-real-4",
      "top5-field-real-5",
    ]);
  });

  it("reveals ownership in the server's order and scores only the real five", async () => {
    vi.useFakeTimers();
    try {
      render(
        <Top5ResultReveal result={result} snapshot={snapshot} stepMs={10} />,
      );
      // First in the reveal order is a trap: it takes a colour and pays nothing.
      await act(async () => {
        vi.advanceTimersByTime(10);
      });
      const firstTrap = screen.getByTestId("top5-field-trap-3");
      expect(firstTrap.dataset.revealed).toBe("true");
      expect(firstTrap.getAttribute("data-owner-team")).toBe(TEAM_A);
      expect(within(firstTrap).queryByTestId("top5-point-badge")).toBeNull();
      expect(screen.getByTestId(`top5-live-count-${TEAM_A}`).textContent).toBe(
        "0",
      );

      // Second is a real entry owned by team B: +1 and the counter moves.
      await act(async () => {
        vi.advanceTimersByTime(10);
      });
      const firstReal = screen.getByTestId("top5-field-real-2");
      expect(firstReal.dataset.revealed).toBe("true");
      expect(within(firstReal).getByTestId("top5-point-badge")).toBeTruthy();
      expect(screen.getByTestId(`top5-live-count-${TEAM_B}`).textContent).toBe(
        "1",
      );
      // The winner is still withheld: six fields are still neutral.
      expect(screen.queryByTestId("top5-winner")).toBeNull();

      // One step per flush: each tick's state update schedules the next timer.
      for (let step = 0; step < 8; step += 1) {
        await act(async () => {
          vi.advanceTimersByTime(10);
        });
      }
      expect(screen.getByTestId(`top5-live-count-${TEAM_A}`).textContent).toBe(
        "3",
      );
      expect(screen.getByTestId(`top5-live-count-${TEAM_B}`).textContent).toBe(
        "2",
      );
      const winner = screen.getByTestId("top5-winner");
      expect(winner.textContent).toContain("البنفسجي");
      expect(winner.textContent).toContain("3 من أفضل 5");
      expect(winner.textContent).toContain("+1 نقطة للمباراة");
    } finally {
      vi.useRealTimers();
    }
  });

  it("says so rather than guessing when the record is unreadable", () => {
    render(
      <Top5ResultReveal
        result={{ ...result, details: { nonsense: true } }}
        snapshot={snapshot}
      />,
    );
    expect(screen.getByTestId("top5-result-unreadable")).toBeTruthy();
  });
});

describe("the Match scoreboard counts challenge wins, not mechanic points", () => {
  it("reads 1-0 after one challenge that finished 3-2 inside itself", () => {
    // The server has already normalised this: one completed challenge, one
    // Match point. The shell simply shows what the Match ledger says, while the
    // result below it still shows the mechanic's own 3-2.
    renderShell(
      match({
        challengeResult: top5Result(),
        matchTotals: [
          { teamId: TEAM_A, signedTotal: 1, displayTotal: 1 },
          { teamId: TEAM_B, signedTotal: 0, displayTotal: 0 },
        ],
      }),
    );
    const scores = screen
      .getByTestId("team-scoreboard")
      .querySelectorAll(".akwaan-numeral");
    expect([...scores].map((node) => node.textContent)).toEqual(["1", "0"]);
    // Named for what it counts, so nobody reads it as a mechanic total.
    expect(
      screen.getByTestId("team-scoreboard").getAttribute("aria-label"),
    ).toContain("التحديات");
  });

  it("shows the RYO challenge totals and its single Match point separately", () => {
    renderRouter(match({ challengeResult: ryoResult() }));
    // The mechanic's own signed totals: +1 / +2 across three items.
    const totals = screen.getByTestId("ryo-mechanic-totals");
    expect(totals.textContent).toContain("+2");
    // And exactly one Match point, stated as its own line.
    expect(screen.getByTestId("ryo-match-point").textContent).toContain(
      "+1 نقطة للمباراة",
    );
  });

  it("states a tied challenge as awarding no Match point", () => {
    const tied = {
      ...ryoResult(),
      winnerTeamId: null,
      tie: true,
      matchPoints: [
        { teamId: TEAM_A, points: 0 },
        { teamId: TEAM_B, points: 0 },
      ],
    };
    renderRouter(match({ challengeResult: tied }));
    expect(screen.getByTestId("ryo-result-winner").dataset.tie).toBe("true");
    expect(screen.getByTestId("ryo-match-point").textContent).toContain(
      "لا نقطة مباراة",
    );
  });
});

describe("RYO result recap", () => {
  it("explains all three interactions and names both authoritative players", () => {
    renderRouter(match({ challengeResult: ryoResult() }));
    const recap = screen.getByTestId("ryo-result-recap");
    expect(within(recap).getAllByTestId(/^ryo-result-item-/)).toHaveLength(3);
    const first = screen.getByTestId("ryo-result-item-0");
    expect(first.textContent).toContain("أحمد");
    expect(first.textContent).toContain("خالد");
    expect(first.textContent).toContain("وثق");
    const second = screen.getByTestId("ryo-result-item-1");
    expect(second.textContent).toContain("سرق");
    expect(second.textContent).toContain("خطأ");
    expect(screen.getByTestId("ryo-result-winner").textContent).toContain(
      "الأخضر",
    );
  });
});

describe("phone lifecycle across a challenge result", () => {
  it("shows one combined result and waiting screen, and no board", () => {
    renderRouter(match({ challengeResult: top5Result() }), {
      actor: "participant",
      participantId: "p-a1",
    });
    const waiting = screen.getByTestId("participant-waiting");
    expect(waiting.dataset.showingResult).toBe("true");
    expect(waiting.textContent).toContain("انتهى التحدي");
    expect(waiting.textContent).toContain("البنفسجي");
    expect(waiting.textContent).toContain("بانتظار التحدي القادم");
    // No board, no result page of its own, and nothing to press.
    expect(screen.queryByTestId("unified-board")).toBeNull();
    expect(screen.queryByTestId("unified-challenge-result")).toBeNull();
    expect(screen.queryByTestId("challenge-result-continue")).toBeNull();
  });

  it("stays on the same waiting screen when the Match returns to its board", () => {
    renderRouter(match({ stage: "board" }), {
      actor: "participant",
      participantId: "p-a1",
    });
    const waiting = screen.getByTestId("participant-waiting");
    expect(waiting.dataset.showingResult).toBe("false");
    expect(waiting.textContent).toContain("لا يوجد تحدٍ يحتاج الجوال");
  });

  it("says the Match is over when it is", () => {
    renderRouter(match({ stage: "match_complete" }), {
      actor: "participant",
      participantId: "p-a1",
    });
    expect(
      screen.getByTestId("participant-waiting").dataset.matchComplete,
    ).toBe("true");
  });
});
