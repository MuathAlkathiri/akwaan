import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { LiveSessionContext } from "@/features/live-game-session/hooks/live-session-context";
import { MatchStageRouter } from "@/features/live-game-session/match/match-stage-router";
import type {
  LiveSessionMatchSnapshot,
  MatchActor,
  MatchChallengeResult,
} from "@/features/live-game-session/match/types";
import type { LiveSessionSnapshot } from "@/features/live-game-session/model";

/**
 * The completed "الكومبو" challenge, as the Match records it.
 *
 * The point of this screen is that the two Runs are the story, so the tests hold
 * two lines: every number and every outcome line comes from the completion
 * summary, and the mechanic's banked points never read as Match score.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/features/match-setup", () => ({
  prepareUnifiedChallenge: vi.fn(),
  launchUnifiedChallenge: vi.fn(),
  cancelUnifiedPreflight: vi.fn(),
  continueFromChallengeResult: vi.fn().mockResolvedValue({}),
  occurrenceLabel: (index: number) =>
    ["العالم الأول", "العالم الثاني", "العالم الثالث"][index],
}));

const TEAM_A = "team-a";
const TEAM_B = "team-b";

/** Exactly the shape `ComboChallengeLauncher.buildCompletionSummary` records. */
type ComboRun = {
  teamId: string;
  bankedPoints: number;
  questionsAnswered: number;
  endedBy: "cash-out" | "combo-break" | "timeout" | "final-question";
  brokenByTeamId: string | null;
};

function comboResult(
  overrides: {
    winnerTeamId?: string | null;
    tie?: boolean;
    points?: Record<string, number>;
    runs?: ComboRun[] | undefined;
    matchPoints?: Array<{ teamId: string; points: number }>;
  } = {},
): MatchChallengeResult {
  return {
    id: "result-combo",
    positionKey: "0#slot_2",
    occurrenceIndex: 0,
    slotKey: "slot_2",
    worldId: "world-anime",
    worldName: "انمي",
    challengeTypeId: "type-combo",
    challengeKey: "combo",
    challengeName: "الكومبو",
    selectedScopeIds: ["s0", "s1", "s2", "s3"],
    winnerTeamId:
      overrides.winnerTeamId === undefined ? TEAM_A : overrides.winnerTeamId,
    tie: overrides.tie ?? false,
    // The Match point — never the mechanic's 5-2, which lives in `details`.
    matchPoints: overrides.matchPoints ?? [
      { teamId: TEAM_A, points: 1 },
      { teamId: TEAM_B, points: 0 },
    ],
    details: {
      points: overrides.points ?? { [TEAM_A]: 5, [TEAM_B]: 2 },
      tie: overrides.tie ?? false,
      ...("runs" in overrides
        ? { runs: overrides.runs }
        : {
            runs: [
              {
                teamId: TEAM_A,
                bankedPoints: 5,
                questionsAnswered: 4,
                endedBy: "final-question",
                brokenByTeamId: null,
              },
              {
                teamId: TEAM_B,
                bankedPoints: 2,
                questionsAnswered: 2,
                endedBy: "cash-out",
                brokenByTeamId: null,
              },
            ] as ComboRun[],
          }),
    },
    startedAt: "2026-08-07T10:00:00.000Z",
    completedAt: "2026-08-07T10:04:00.000Z",
  } as MatchChallengeResult;
}

function matchOf(result?: MatchChallengeResult): LiveSessionMatchSnapshot {
  return {
    id: "match-1",
    revision: 12,
    status: "active",
    stage: {
      key: "challenge_result",
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
        completedPositionCount: 1,
      },
      selectingTeamId: TEAM_A,
    },
    scoring: {
      matchTotals: [
        { teamId: TEAM_A, signedTotal: 1, displayTotal: 1 },
        { teamId: TEAM_B, signedTotal: 0, displayTotal: 0 },
      ],
      worldSubtotals: [],
    },
    standings: [],
    ...(result ? { challengeResult: result } : {}),
    challengeHistory: [],
    availableActions: ["match:continue-from-result"],
  } as unknown as LiveSessionMatchSnapshot;
}

function renderResult(
  result: MatchChallengeResult,
  options: { actor?: MatchActor; participantId?: string } = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <LiveSessionContext.Provider
        value={
          {
            snapshot: {
              sessionId: "session-1",
              mode: { key: "core-timed-turns", version: 1 },
              status: "active",
              revision: 4,
              serverTimestamp: "2026-08-07T10:05:00.000Z",
              round: { number: 1 },
              teams: [
                { id: TEAM_A, name: "أسود الشمال", active: true },
                { id: TEAM_B, name: "صقور الرياض", active: true },
              ],
              participants: [],
              availableActions: [],
              match: matchOf(result),
            } as unknown as LiveSessionSnapshot,
            connection: "connected",
            command: vi.fn(),
            gameplayCommand: vi.fn(),
            resync: vi.fn(),
          } as never
        }
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

describe("completed الكومبو challenge", () => {
  it("gives each team its own banked Combo total", () => {
    renderResult(comboResult());

    expect(screen.getByTestId(`combo-points-${TEAM_A}`)).toHaveTextContent("5");
    expect(screen.getByTestId(`combo-points-${TEAM_B}`)).toHaveTextContent("2");
    // Labelled as the mechanic's own points, not as a score.
    expect(
      within(screen.getByTestId(`combo-result-${TEAM_A}`)).getByText(
        "نقاط الكومبو",
      ),
    ).toBeInTheDocument();
  });

  it("declares the winner the server declared", () => {
    renderResult(comboResult());
    expect(screen.getByTestId("combo-verdict")).toHaveTextContent(
      "أسود الشمال يفوز بالكومبو",
    );
  });

  it("renders a tie without naming a winner", () => {
    renderResult(
      comboResult({
        winnerTeamId: null,
        tie: true,
        points: { [TEAM_A]: 3, [TEAM_B]: 3 },
        matchPoints: [
          { teamId: TEAM_A, points: 0 },
          { teamId: TEAM_B, points: 0 },
        ],
      }),
    );

    expect(screen.getByTestId("combo-verdict")).toHaveTextContent(
      "تعادل في الكومبو",
    );
    expect(screen.getByTestId("combo-verdict").textContent).not.toContain(
      "يفوز",
    );
    // No Match point exists on a tie, and the screen says so rather than
    // showing an empty reward slot.
    expect(screen.getByTestId("combo-match-reward-none")).toBeInTheDocument();
    expect(screen.queryByTestId("combo-match-reward")).toBeNull();
  });

  it("keeps the Match point separate from the Combo total", () => {
    renderResult(comboResult());

    const reward = screen.getByTestId("combo-match-reward");
    // The Match point is +1 for winning a challenge — never the 5 banked.
    expect(reward).toHaveTextContent("+1 نقطة للمباراة");
    expect(reward.textContent).not.toContain("5");
    // And the screen states the rule, so the big number cannot be misread.
    expect(
      screen.getByText("نقاط الكومبو لا تُضاف إلى نتيجة المباراة"),
    ).toBeInTheDocument();
  });

  it("tells each Run's story from endedBy, not from its point total", () => {
    renderResult(
      comboResult({
        points: { [TEAM_A]: 3, [TEAM_B]: 0 },
        winnerTeamId: TEAM_A,
        runs: [
          {
            teamId: TEAM_A,
            bankedPoints: 3,
            questionsAnswered: 3,
            endedBy: "cash-out",
            brokenByTeamId: null,
          },
          {
            teamId: TEAM_B,
            bankedPoints: 0,
            questionsAnswered: 2,
            endedBy: "combo-break",
            brokenByTeamId: TEAM_A,
          },
        ],
      }),
    );

    expect(screen.getByTestId(`combo-outcome-${TEAM_A}`)).toHaveTextContent(
      "ثبّت 3",
    );
    // Named the breaker, because the summary recorded who it was.
    expect(screen.getByTestId(`combo-outcome-${TEAM_B}`)).toHaveTextContent(
      "كسره أسود الشمال",
    );
  });

  it("distinguishes clearing the run from being broken on it", () => {
    renderResult(comboResult());
    expect(screen.getByTestId(`combo-outcome-${TEAM_A}`)).toHaveTextContent(
      "أكمل الكومبو للنهاية",
    );
    expect(screen.getByTestId(`combo-outcome-${TEAM_B}`)).toHaveTextContent(
      "ثبّت 2",
    );
  });

  it("never infers an outcome when the summary carries no Run history", () => {
    // Zero points does not prove a Combo Break — a team can cash out nothing.
    // With no `runs`, the totals still render and no story is invented.
    renderResult(
      comboResult({ runs: undefined, points: { [TEAM_A]: 4, [TEAM_B]: 0 } }),
    );

    expect(screen.getByTestId(`combo-points-${TEAM_B}`)).toHaveTextContent("0");
    expect(screen.queryByTestId(`combo-outcome-${TEAM_A}`)).toBeNull();
    expect(screen.queryByTestId(`combo-outcome-${TEAM_B}`)).toBeNull();
    expect(screen.queryByTestId(`combo-trail-${TEAM_B}`)).toBeNull();
    const body = screen.getByTestId("combo-challenge-result").textContent ?? "";
    expect(body).not.toContain("انكسر الكومبو");
    expect(body).not.toContain("أكمل الكومبو للنهاية");
  });

  it("marks the question a broken Run was lost on", () => {
    renderResult(
      comboResult({
        runs: [
          {
            teamId: TEAM_A,
            bankedPoints: 0,
            questionsAnswered: 3,
            endedBy: "combo-break",
            brokenByTeamId: TEAM_B,
          },
        ],
      }),
    );

    // Ended on question 3: two cleared, the third lost, the fourth never played.
    expect(
      screen.getByTestId(`combo-trail-${TEAM_A}`).getAttribute("aria-label"),
    ).toContain("2 من 4");
  });

  it("shows no internal runtime vocabulary anywhere on the screen", () => {
    renderResult(comboResult());
    const screenText =
      screen.getByTestId("unified-challenge-result").textContent ?? "";

    // Board coordinates and runtime phases are internals, not player copy.
    for (const leak of [
      "الخانة",
      "slot_2",
      "phase",
      "runtime",
      "combo-break",
      "final-question",
      "cash-out",
      "runResultsJson",
    ]) {
      expect(screenText).not.toContain(leak);
    }
  });

  it("keeps the host's single return action", () => {
    renderResult(comboResult());
    expect(screen.getByTestId("challenge-result-continue")).toHaveTextContent(
      "العودة إلى الأكوان",
    );
  });

  it("leaves the phone on its own combined result-and-wait screen", () => {
    // Deliberately not this recap: a phone already gets one screen that is both
    // the result and the wait for what comes next, on the socket it joined on.
    // This screen is the host and shared-screen surface, and redesigning it must
    // not start rendering it on phones.
    renderResult(comboResult(), {
      actor: "participant",
      participantId: "p-a1",
    });

    expect(screen.queryByTestId("combo-challenge-result")).toBeNull();
    expect(screen.queryByTestId("unified-challenge-result")).toBeNull();
    expect(screen.queryByTestId("challenge-result-continue")).toBeNull();
    // And the phone still learns the outcome from the same record.
    expect(document.body.textContent).toContain("أسود الشمال");
  });

  it("stacks the two team cards without dropping any result detail", () => {
    // Narrow layout is a grid that collapses; the information must not be
    // conditional on width, which a hidden-on-mobile branch would make it.
    renderResult(comboResult());
    const cards = [TEAM_A, TEAM_B].map((id) =>
      screen.getByTestId(`combo-result-${id}`),
    );
    for (const card of cards) {
      expect(card.className).not.toContain("hidden");
      expect(card.className).not.toContain("sm:hidden");
    }
    const grid = cards[0].parentElement!;
    expect(grid.className).toContain("grid");
    expect(grid.className).toContain("sm:grid-cols-2");
    expect(grid.className).not.toContain("overflow-x");
  });
});
