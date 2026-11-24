import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LiveSessionContext } from "@/features/live-game-session/hooks/live-session-context";
import { MarhalaPhonePanel } from "@/features/live-game-session/components/marhala-phone-panel";
import { MobileGameplayShell } from "@/features/live-game-session/match/components/mobile-gameplay-shell";
import {
  MARHALA_MODE_KEY,
  readMarhalaView,
} from "@/features/live-game-session/match/marhala.presentation";
import type { GameplayRuntimeSnapshot } from "@/features/live-game-session/model";

/**
 * One phone carries each المرحلة turn.
 *
 * The server says whose it is — the lobby captain, or whoever the rotation
 * reached — and the phone follows: the holder elects and answers, a teammate
 * sees whose phone it is and coaches, and the other team waits as before.
 */
vi.mock(
  "@/features/live-game-session/hooks/live-session-clock-context",
  () => ({
    useLiveSessionClock: () => Date.parse("2026-01-01T00:00:10.000Z"),
  }),
);
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/join/live-session/ABC123",
}));

const TEAMS = [
  { id: "team-alpha", name: "أسود الشمال", active: true },
  { id: "team-beta", name: "صقور الرياض", active: true },
];
const PROMPT = "ما اسم بطل لعبة GTA San Andreas؟";

const shared = (over: Record<string, unknown> = {}) => ({
  phase: "difficulty-choice",
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
  actorTeamId: "team-alpha",
  isActiveTeam: true,
  assignedParticipantId: "p-1",
  isAssignedActor: true,
  ownAssignmentSequence: 9,
  ...over,
});
const question = (over: Record<string, unknown> = {}) =>
  shared({
    phase: "question",
    selectedDifficulty: "medium",
    deadlineAt: "2026-01-01T00:00:27.000Z",
    questionPrompt: JSON.stringify({ ar: PROMPT }),
    ...over,
  });
/** A teammate's view of the same turn: the server says it is not theirs. */
const teammate = { isAssignedActor: false, ownAssignmentSequence: undefined };

const ACTIONS = [
  "mode:choose-marhala-difficulty",
  "mode:submit-marhala-answer",
];
const runtimeOf = (modeState: Record<string, unknown>) =>
  ({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    mode: { key: MARHALA_MODE_KEY, version: 1, stateSchemaVersion: 1 },
    status: "round-active",
    revision: 4,
    availableActions: ACTIONS,
    activeRound: { id: "round-1", sequence: 1, status: "active", modeState },
    modeState,
  }) as unknown as GameplayRuntimeSnapshot;

const renderPhone = (modeState: Record<string, unknown>, me = "p-1") => {
  const cmd = vi.fn();
  render(
    <LiveSessionContext.Provider
      value={
        {
          snapshot: {
            sessionId: "session-1",
            revision: 4,
            serverTimestamp: "2026-01-01T00:00:10.000Z",
            teams: TEAMS,
            participants: [
              {
                id: "p-1",
                displayName: "سارة",
                teamId: "team-alpha",
                role: "team-player",
              },
              {
                id: "p-2",
                displayName: "خالد",
                teamId: "team-alpha",
                role: "team-player",
              },
            ],
            availableActions: [],
          },
          snapshotReceivedAtMs: Date.parse("2026-01-01T00:00:10.000Z"),
          connection: "connected",
          gameplayCommand: cmd,
          resync: vi.fn(),
        } as never
      }
    >
      <MobileGameplayShell participantId={me}>
        <MarhalaPhonePanel runtime={runtimeOf(modeState)} />
      </MobileGameplayShell>
    </LiveSessionContext.Provider>,
  );
  return cmd;
};

describe("the turn holder's phone", () => {
  it("elects the band and sends its assignment with it", () => {
    const cmd = renderPhone(shared());
    fireEvent.click(screen.getByTestId("marhala-choose-easy"));
    fireEvent.click(screen.getByTestId("marhala-confirm-difficulty"));
    expect(cmd).toHaveBeenCalledWith(
      "gameplay-command",
      expect.objectContaining({
        commandType: "choose-marhala-difficulty",
        payload: { difficulty: "easy", assignmentSequence: 9 },
      }),
    );
  });

  it("answers with its assignment too", () => {
    const cmd = renderPhone(question());
    fireEvent.change(screen.getByLabelText("الإجابة"), {
      target: { value: "CJ" },
    });
    fireEvent.click(screen.getByTestId("marhala-answer-submit"));
    expect(cmd).toHaveBeenCalledWith(
      "gameplay-command",
      expect.objectContaining({
        commandType: "submit-marhala-answer",
        payload: { answer: "CJ", assignmentSequence: 9 },
      }),
    );
  });
});

describe("a teammate's phone", () => {
  it("shows whose phone it is and no band buttons", () => {
    renderPhone(shared({ ...teammate }), "p-2");
    const card = screen.getByTestId("marhala-phone-coaching");
    // The same three cards the holder sees, with nothing to press, and a line
    // naming who decides.
    expect(card.textContent).toContain("القرار عند سارة");
    expect(screen.getByTestId("marhala-band-view-easy")).toBeInTheDocument();
    expect(screen.queryByTestId("marhala-choose-easy")).toBeNull();
    expect(screen.queryByTestId("marhala-confirm-difficulty")).toBeNull();
  });

  it("shows the question to help with, but no answer box", () => {
    renderPhone(question({ ...teammate }), "p-2");
    const card = screen.getByTestId("marhala-phone-coaching");
    expect(card.textContent).toContain(PROMPT);
    expect(screen.queryByTestId("marhala-answer-form")).toBeNull();
  });
});

describe("the other team's phone", () => {
  it("still waits, without the coaching card", () => {
    renderPhone(
      shared({
        actorTeamId: "team-beta",
        isActiveTeam: false,
        isAssignedActor: false,
        ownAssignmentSequence: undefined,
      }),
    );
    expect(screen.getByTestId("marhala-phone-waiting").textContent).toContain(
      "دور الفريق الآخر",
    );
    expect(screen.queryByTestId("marhala-phone-coaching")).toBeNull();
  });
});

describe("a race started before turns were assigned", () => {
  it("falls back to the team rule when the server says nothing", () => {
    const view = readMarhalaView({
      ...shared(),
      assignedParticipantId: undefined,
      isAssignedActor: undefined,
      ownAssignmentSequence: undefined,
    });
    expect(view.isAssignedActor).toBe(true);
    expect(view.ownAssignmentSequence).toBeUndefined();
    const cmd = renderPhone({
      ...shared(),
      assignedParticipantId: undefined,
      isAssignedActor: undefined,
      ownAssignmentSequence: undefined,
    });
    fireEvent.click(screen.getByTestId("marhala-choose-easy"));
    fireEvent.click(screen.getByTestId("marhala-confirm-difficulty"));
    expect(cmd).toHaveBeenCalledWith(
      "gameplay-command",
      expect.objectContaining({ payload: { difficulty: "easy" } }),
    );
  });
});
