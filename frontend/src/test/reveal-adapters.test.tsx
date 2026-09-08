import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSessionContext } from "@/features/live-game-session/hooks/live-session-context";
import { ComboGameplayPanel } from "@/features/live-game-session/components/combo-gameplay-panel";
import { RESOLUTION_REVEAL_MS } from "@/features/live-game-session/match/resolution-pacing";
import type { GameplayRuntimeSnapshot } from "@/features/live-game-session/model";

/**
 * The reveal beat, per mechanic.
 *
 * Two rules are shared by every adapter and both are asserted here rather than
 * assumed. The canonical answer is only ever read from a record the server
 * wrote *after* resolving the item — nothing on screen is graded on the client.
 * And the mechanic's own consequence, which the runtime has usually already
 * entered, is held back visually until the beat is over, so a team is never
 * asked to decide before it has been told what happened.
 *
 * The beat is measured against the server's `resolvedAt` and the session clock,
 * not a local timer, which is what makes it survive a reconnect: rejoining late
 * shows the current state, not a replayed reveal.
 */

const NOW = Date.parse("2026-01-01T00:00:20.000Z");

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/matches/session-1",
}));

const clock = vi.hoisted(() => ({ now: Date.parse("2026-01-01T00:00:20.000Z") }));
vi.mock(
  "@/features/live-game-session/hooks/live-session-clock-context",
  () => ({ useLiveSessionClock: () => clock.now }),
);

const TEAM_A = "team-alpha";
const TEAM_B = "team-beta";
const TEAMS = [
  { id: TEAM_A, name: "أسود الشمال" },
  { id: TEAM_B, name: "صقور الرياض" },
];

const context = (over: Record<string, unknown> = {}) =>
  ({
    snapshot: {
      sessionId: "session-1",
      revision: 4,
      serverTimestamp: "2026-01-01T00:00:20.000Z",
      teams: TEAMS,
      participants: [
        { id: "p-1", displayName: "مُعاذ", teamId: TEAM_A, role: "player" },
      ],
      availableActions: [],
    },
    connection: "connected",
    gameplayCommand: vi.fn().mockResolvedValue(undefined),
    resync: vi.fn(),
    sessionId: "session-1",
    ...over,
  }) as never;

const comboRuntime = (modeState: Record<string, unknown>) =>
  ({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    revision: 4,
    mode: { key: "combo", version: 1, stateSchemaVersion: 1 },
    status: "round-active",
    availableActions: ["mode:cash-out-combo", "mode:continue-combo"],
    activeRound: { id: "round-1", sequence: 1, status: "active", modeState },
    modeState,
  }) as unknown as GameplayRuntimeSnapshot;

const comboState = (over: Record<string, unknown> = {}) => ({
  phase: "decision",
  runIndex: 0,
  questionIndex: 0,
  questionNumber: 1,
  questionsPerRun: 4,
  activeTeamId: TEAM_A,
  unbankedPoints: 1,
  forcedQuestion: false,
  teamIdsJson: JSON.stringify([TEAM_A, TEAM_B]),
  runResultsJson: JSON.stringify([]),
  chargesJson: JSON.stringify({ [TEAM_A]: "available", [TEAM_B]: "available" }),
  actorTeamId: TEAM_A,
  isActiveTeam: true,
  ...over,
});

const comboReveal = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    questionIndex: 0,
    teamId: TEAM_A,
    submittedAnswer: "جدة",
    correctAnswer: "جدة",
    correct: true,
    resolvedBy: "answer",
    earned: 1,
    resolvedAt: "2026-01-01T00:00:19.000Z",
    ...over,
  });

describe("الكومبو reveals the answer before its consequence", () => {
  beforeEach(() => {
    clock.now = NOW;
  });
  afterEach(() => {
    clock.now = NOW;
  });

  const tree = (modeState: Record<string, unknown>) => (
    <LiveSessionContext.Provider value={context()}>
      <ComboGameplayPanel runtime={comboRuntime(modeState)} />
    </LiveSessionContext.Provider>
  );

  it("holds the Cash Out / Continue decision until the answer is read", () => {
    render(tree(comboState({ lastQuestionRevealJson: comboReveal() })));

    const reveal = screen.getByTestId("combo-answer-reveal");
    expect(reveal).toHaveAttribute("data-correct", "true");
    expect(reveal).toHaveTextContent("جدة");
    expect(reveal).toHaveTextContent("إجابة صحيحة");
    // The runtime is already in `decision`; only its presentation waits.
    expect(screen.queryByTestId("combo-decision")).toBeNull();
  });

  it("shows the decision once the beat has elapsed", () => {
    clock.now = Date.parse("2026-01-01T00:00:19.000Z") + RESOLUTION_REVEAL_MS + 1;
    render(tree(comboState({ lastQuestionRevealJson: comboReveal() })));

    expect(screen.queryByTestId("combo-answer-reveal")).toBeNull();
    expect(screen.getByTestId("combo-decision")).toBeInTheDocument();
  });

  it("reconstructs from authoritative time rather than a local timer", () => {
    // A phone that rejoins long after the item resolved gets the live state,
    // not a reveal replayed from the moment it happened to mount.
    clock.now = Date.parse("2026-01-01T00:05:00.000Z");
    render(tree(comboState({ lastQuestionRevealJson: comboReveal() })));
    expect(screen.queryByTestId("combo-answer-reveal")).toBeNull();
    expect(screen.getByTestId("combo-decision")).toBeInTheDocument();
  });

  it("invents no submission for a timeout, and names the canonical answer", () => {
    render(
      tree(
        comboState({
          phase: "run-complete",
          lastQuestionRevealJson: comboReveal({
            submittedAnswer: null,
            correct: false,
            resolvedBy: "timeout",
            earned: 0,
          }),
        }),
      ),
    );
    const reveal = screen.getByTestId("combo-answer-reveal");
    expect(reveal).toHaveTextContent("ما تم إرسال إجابة");
    expect(reveal).toHaveTextContent("انتهى الوقت");
    expect(reveal).toHaveTextContent("جدة");
  });

  it("shows no reveal at all while a question is still open", () => {
    // The server clears the record when the next question opens, so an open
    // question has nothing to reveal and no canonical answer anywhere near it.
    render(
      tree(
        comboState({
          phase: "question",
          questionPrompt: JSON.stringify({ ar: "سؤال" }),
        }),
      ),
    );
    expect(screen.queryByTestId("combo-answer-reveal")).toBeNull();
    expect(document.body.textContent).not.toContain("جدة");
  });
});
