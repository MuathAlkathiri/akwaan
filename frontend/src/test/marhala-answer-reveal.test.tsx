import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSessionContext } from "@/features/live-game-session/hooks/live-session-context";
import { MatchGameplayRenderer } from "@/features/live-game-session/match/match-stage-router";
import { MARHALA_MODE_KEY } from "@/features/live-game-session/match/marhala.presentation";
import { RESOLUTION_REVEAL_MS } from "@/features/live-game-session/match/resolution-pacing";
import type { LiveSessionSnapshot } from "@/features/live-game-session/model";

/**
 * المرحلة says what the answer was before it moves anything.
 *
 * A room cannot read a movement it has not been told the reason for, and a
 * wrong answer moves no token at all — without this beat it resolved with
 * nothing on screen to explain it. The beat leads the existing replay rather
 * than running beside it, so there is still exactly one sequencer, and the board
 * never leaves the screen for either half.
 *
 * Every value shown is written by the server onto a turn that has already
 * resolved. Nothing here grades an answer or decides when a question ended.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/matches/session-1",
}));

vi.mock(
  "@/features/live-game-session/hooks/live-session-clock-context",
  () => ({
    useLiveSessionClock: () => Date.parse("2026-01-01T00:00:10.000Z"),
  }),
);

const PROMPT = "ما اسم بطل لعبة GTA San Andreas؟";
const TEAMS = [
  { id: "team-alpha", name: "أسود الشمال", active: true },
  { id: "team-beta", name: "صقور الرياض", active: true },
];

const shared = (over: Record<string, unknown> = {}) => ({
  phase: "question",
  activeTeamId: "team-alpha",
  teamIdsJson: JSON.stringify(["team-alpha", "team-beta"]),
  positionsJson: JSON.stringify({ "team-alpha": 5, "team-beta": 1 }),
  turnNumber: 3,
  availableDifficultiesJson: JSON.stringify(["easy", "medium", "hard"]),
  movementRangesJson: JSON.stringify({
    easy: { min: 1, max: 2 },
    medium: { min: 2, max: 4 },
    hard: { min: 4, max: 6 },
  }),
  selectedDifficulty: "medium",
  deadlineAt: "2026-01-01T00:00:27.000Z",
  questionPrompt: JSON.stringify({ ar: PROMPT }),
  actorTeamId: "team-alpha",
  isActiveTeam: true,
  ...over,
});

const turn = (over: Record<string, unknown> = {}) => ({
  turnNumber: 3,
  teamId: "team-alpha",
  difficulty: "medium",
  correct: true,
  resolvedBy: "answer",
  submittedAnswer: "روكستار",
  correctAnswer: "روكستار",
  movement: 3,
  baseLanding: 8,
  tile: "normal",
  finalLanding: 8,
  resolvedAt: "2026-01-01T00:00:20.000Z",
  ...over,
});

const snapshot = (modeState: Record<string, unknown>) =>
  ({
    sessionId: "session-1",
    revision: 4,
    serverTimestamp: "2026-01-01T00:00:10.000Z",
    teams: TEAMS,
    participants: [
      { id: "p-1", displayName: "مُعاذ", teamId: "team-alpha", role: "player" },
    ],
    availableActions: [],
    gameplay: {
      runtimeId: "runtime-1",
      sessionId: "session-1",
      revision: 4,
      mode: { key: MARHALA_MODE_KEY, version: 1, stateSchemaVersion: 1 },
      status: "round-active",
      availableActions: ["mode:submit-marhala-answer"],
      activeRound: {
        id: "round-1",
        sequence: 1,
        status: "active",
        modeState,
      },
      modeState,
      transitions: [],
    },
  }) as unknown as LiveSessionSnapshot;

const tree = (modeState: Record<string, unknown>, actor: "shared-screen" | "participant") => (
  <LiveSessionContext.Provider
    value={
      {
        snapshot: snapshot(modeState),
        connection: "connected",
        connectionEpoch: 1,
        presentationReady: vi.fn().mockResolvedValue(undefined),
        presentationReadySocket: vi.fn().mockResolvedValue(undefined),
        gameplayCommand: vi.fn().mockResolvedValue(undefined),
        resync: vi.fn(),
        sessionId: "session-1",
      } as never
    }
  >
    <MatchGameplayRenderer actor={actor} />
  </LiveSessionContext.Provider>
);

describe("المرحلة reveals the answer before the board moves", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const step = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

  it("shows answer truth first, movement second, without unmounting the board", () => {
    const view = render(tree(shared(), "shared-screen"));
    const board = screen.getByTestId("marhala-board");
    expect(screen.queryByTestId("marhala-answer-reveal")).toBeNull();

    view.rerender(
      tree(
        shared({
          positionsJson: JSON.stringify({ "team-alpha": 8, "team-beta": 1 }),
          lastTurnJson: JSON.stringify(turn()),
        }),
        "shared-screen",
      ),
    );

    // Beat one: what the answer was. Nothing has moved yet.
    const reveal = screen.getByTestId("marhala-answer-reveal");
    expect(reveal).toHaveAttribute("data-correct", "true");
    expect(reveal).toHaveTextContent("روكستار");
    expect(reveal).toHaveTextContent("إجابة صحيحة");
    expect(screen.queryByTestId("marhala-movement-reveal")).toBeNull();
    expect(screen.getByTestId("marhala-token-team-alpha")).toHaveAttribute(
      "data-token-position",
      "5",
    );
    // The movement overlay belongs to the movement beat: it must not sit over
    // four board squares while the answer is being read.
    expect(screen.queryByTestId("marhala-board-centre")).toBeNull();
    // And the clock of a question that has resolved is gone.
    expect(screen.queryByTestId("challenge-countdown")).toBeNull();

    // Beat two: the movement presentation that already existed.
    step(RESOLUTION_REVEAL_MS);
    expect(screen.queryByTestId("marhala-answer-reveal")).toBeNull();
    expect(screen.getByTestId("marhala-movement-reveal")).toBeInTheDocument();

    // The board was never torn down for either beat.
    expect(screen.getByTestId("marhala-board")).toBe(board);
  });

  it("reveals a wrong answer, which moves nothing at all", () => {
    const view = render(tree(shared(), "shared-screen"));
    view.rerender(
      tree(
        shared({
          lastTurnJson: JSON.stringify(
            turn({
              correct: false,
              submittedAnswer: "إجابة خاطئة",
              movement: undefined,
              baseLanding: undefined,
              finalLanding: undefined,
            }),
          ),
        }),
        "shared-screen",
      ),
    );

    const reveal = screen.getByTestId("marhala-answer-reveal");
    expect(reveal).toHaveAttribute("data-correct", "false");
    expect(reveal).toHaveTextContent("إجابة خاطئة");
    expect(reveal).toHaveTextContent("روكستار");
    // Nothing moved, so no movement presentation follows this one.
    step(RESOLUTION_REVEAL_MS);
    expect(screen.queryByTestId("marhala-movement-reveal")).toBeNull();
  });

  it("invents no submission for a timeout", () => {
    const view = render(tree(shared(), "shared-screen"));
    view.rerender(
      tree(
        shared({
          lastTurnJson: JSON.stringify(
            turn({
              correct: false,
              resolvedBy: "timeout",
              submittedAnswer: null,
              movement: undefined,
              baseLanding: undefined,
              finalLanding: undefined,
            }),
          ),
        }),
        "shared-screen",
      ),
    );
    const reveal = screen.getByTestId("marhala-answer-reveal");
    expect(reveal).toHaveTextContent("ما تم إرسال إجابة");
    expect(reveal).toHaveTextContent("انتهى الوقت");
    expect(reveal).toHaveTextContent("روكستار");
  });

  it("gives the phone the same beat, compact, with no stale controls", () => {
    const view = render(tree(shared(), "participant"));
    // The answer field is there while the question is live.
    expect(screen.getByTestId("marhala-phone")).toBeInTheDocument();
    const answerable = document.querySelectorAll("input, button").length;
    expect(answerable).toBeGreaterThan(0);

    view.rerender(
      tree(
        shared({
          positionsJson: JSON.stringify({ "team-alpha": 8, "team-beta": 1 }),
          lastTurnJson: JSON.stringify(turn()),
        }),
        "participant",
      ),
    );

    // The shell and the challenge frame stay; only the action region changed.
    expect(screen.getByTestId("marhala-phone")).toBeInTheDocument();
    expect(screen.getByTestId("marhala-answer-reveal")).toHaveTextContent(
      "روكستار",
    );
    // No stale submit controls survive into the reveal, and no clock.
    expect(document.querySelectorAll("input, button")).toHaveLength(0);
    expect(screen.queryByTestId("challenge-countdown")).toBeNull();
    // And no full-screen loader took the page.
    expect(screen.queryByTestId("akwaan-loader")).toBeNull();
  });
});
