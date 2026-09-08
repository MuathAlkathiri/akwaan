import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSessionContext } from "@/features/live-game-session/hooks/live-session-context";
import { MarhalaPhonePanel } from "@/features/live-game-session/components/marhala-phone-panel";
import { MobileGameplayShell } from "@/features/live-game-session/match/components/mobile-gameplay-shell";
import type { GameplayRuntimeSnapshot } from "@/features/live-game-session/model";

/**
 * Voice in المرحلة — transcript only.
 *
 * The whole point of the policy split lives here: a المرحلة turn rides on one
 * answer, so speech fills the field the player already has and then stops. It
 * must never send a command by itself, and typing must stay usable no matter
 * what the microphone is doing.
 */

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 0;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  constructor() {
    FakeRecognition.instances.push(this);
  }
  start() {}
  stop() {}
  abort() {}
  emit(transcript: string, isFinal: boolean) {
    this.onresult?.({
      resultIndex: 0,
      results: { length: 1, 0: { isFinal, length: 1, 0: { transcript } } },
    });
  }
  fail(error: string) {
    this.onerror?.({ error });
  }
  static latest() {
    return FakeRecognition.instances[FakeRecognition.instances.length - 1];
  }
}

vi.mock("@/features/live-game-session/hooks/live-session-clock-context", () => ({
  useLiveSessionClock: () => Date.parse("2026-01-01T00:00:10.000Z"),
}));
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
  ...over,
});

const questionState = (over: Record<string, unknown> = {}) =>
  shared({
    phase: "question",
    selectedDifficulty: "medium",
    deadlineAt: "2026-01-01T00:00:27.000Z",
    questionPrompt: JSON.stringify({ ar: PROMPT }),
    ...over,
  });

const ACTIONS = ["mode:choose-marhala-difficulty", "mode:submit-marhala-answer"];

const runtimeOf = (modeState: Record<string, unknown>, actions = ACTIONS) =>
  ({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    mode: { key: "marhala", version: 1, stateSchemaVersion: 1 },
    status: "round-active",
    revision: 4,
    availableActions: actions,
    activeRound: { id: "round-1", sequence: 1, status: "active", modeState },
    modeState,
  }) as unknown as GameplayRuntimeSnapshot;

const context = (gameplayCommand = vi.fn()) =>
  ({
    snapshot: {
      sessionId: "session-1",
      revision: 4,
      serverTimestamp: "2026-01-01T00:00:10.000Z",
      teams: TEAMS,
      participants: [
        { id: "p-1", displayName: "مُعاذ", teamId: "team-alpha", role: "player" },
      ],
      availableActions: [],
    },
    snapshotReceivedAtMs: Date.parse("2026-01-01T00:00:10.000Z"),
    connection: "connected",
    gameplayCommand,
    resync: vi.fn(),
  }) as never;

const tree = (runtime: GameplayRuntimeSnapshot, cmd: ReturnType<typeof vi.fn>) => (
  <LiveSessionContext.Provider value={context(cmd)}>
    <MobileGameplayShell participantId="p-1">
      <MarhalaPhonePanel runtime={runtime} />
    </MobileGameplayShell>
  </LiveSessionContext.Provider>
);

const renderPhone = (
  modeState = questionState(),
  actions?: string[],
  cmd = vi.fn(),
) => {
  const view = render(tree(runtimeOf(modeState, actions), cmd));
  return { ...view, cmd };
};

/** Speak one utterance and let the recognised beat land. */
const speak = (text: string) => {
  act(() => FakeRecognition.latest().emit(text, true));
  act(() => void vi.advanceTimersByTime(200));
};


beforeEach(() => {
  vi.useFakeTimers();
  FakeRecognition.instances = [];
  (window as unknown as Record<string, unknown>).SpeechRecognition =
    FakeRecognition;
});
afterEach(() => {
  vi.useRealTimers();
  delete (window as unknown as Record<string, unknown>).SpeechRecognition;
});

describe("the microphone appears only where it is allowed", () => {
  it("is offered on the active question", () => {
    renderPhone();
    expect(screen.getByTestId("marhala-voice")).toBeInTheDocument();
  });

  it("is absent during difficulty selection", () => {
    renderPhone(shared());
    expect(screen.queryByTestId("marhala-voice")).toBeNull();
  });

  it("is absent while the question is only prepared", () => {
    renderPhone(shared({ phase: "question-pending", selectedDifficulty: "hard" }));
    expect(screen.queryByTestId("marhala-voice")).toBeNull();
  });

  it("is absent for the opposing team", () => {
    renderPhone(
      questionState({ actorTeamId: "team-beta", isActiveTeam: false }),
      [],
    );
    expect(screen.queryByTestId("marhala-voice")).toBeNull();
  });

  it("is absent once the answer has been sent", () => {
    renderPhone();
    fireEvent.change(screen.getByLabelText("الإجابة"), {
      target: { value: "CJ" },
    });
    fireEvent.click(screen.getByTestId("marhala-answer-submit"));
    expect(screen.queryByTestId("marhala-voice")).toBeNull();
  });

  it("stays secondary to the submit button", () => {
    renderPhone();
    expect(screen.getByTestId("marhala-voice").className).toContain("size-14");
    expect(screen.getByTestId("marhala-answer-submit").className).toContain(
      "flex-1",
    );
  });
});

describe("speech fills the field and stops there", () => {
  it("sends no gameplay command at all", () => {
    const { cmd } = renderPhone();
    fireEvent.click(screen.getByTestId("marhala-voice"));
    speak("سي جي");
    // The whole policy in one assertion: المرحلة is transcript, not auto-submit.
    expect(cmd).not.toHaveBeenCalled();
  });

  it("puts the recognised text into the existing answer field", () => {
    renderPhone();
    fireEvent.click(screen.getByTestId("marhala-voice"));
    speak("سي جي");
    expect(screen.getByLabelText("الإجابة")).toHaveValue("سي جي");
  });

  it("leaves the transcript editable", () => {
    renderPhone();
    fireEvent.click(screen.getByTestId("marhala-voice"));
    speak("سي جي");
    fireEvent.change(screen.getByLabelText("الإجابة"), {
      target: { value: "سي جي جونسون" },
    });
    expect(screen.getByLabelText("الإجابة")).toHaveValue("سي جي جونسون");
  });

  it("replaces what was typed rather than concatenating onto it", () => {
    renderPhone();
    fireEvent.change(screen.getByLabelText("الإجابة"), {
      target: { value: "كارل" },
    });
    fireEvent.click(screen.getByTestId("marhala-voice"));
    speak("سي جي");
    expect(screen.getByLabelText("الإجابة")).toHaveValue("سي جي");
  });

  it("submits through the same command path once the player confirms", () => {
    const { cmd } = renderPhone();
    fireEvent.click(screen.getByTestId("marhala-voice"));
    speak("سي جي");
    expect(cmd).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("marhala-answer-submit"));
    expect(cmd).toHaveBeenCalledTimes(1);
    expect(cmd).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "submit-marhala-answer",
      payload: { answer: "سي جي" },
    });
  });

  it("also submits through the form's own Enter path", () => {
    const { cmd } = renderPhone();
    fireEvent.click(screen.getByTestId("marhala-voice"));
    speak("سي جي");
    fireEvent.submit(screen.getByTestId("marhala-answer-form"));
    expect(cmd).toHaveBeenCalledWith(
      "gameplay-command",
      expect.objectContaining({ commandType: "submit-marhala-answer" }),
    );
  });
});

describe("typing never stops working", () => {
  it("keeps the field usable when permission is refused", () => {
    const { cmd } = renderPhone();
    fireEvent.click(screen.getByTestId("marhala-voice"));
    act(() => FakeRecognition.latest().fail("not-allowed"));
    expect(screen.getByTestId("marhala-voice-state")).toHaveTextContent(
      "الميكروفون مرفوض",
    );
    fireEvent.change(screen.getByLabelText("الإجابة"), {
      target: { value: "CJ" },
    });
    fireEvent.click(screen.getByTestId("marhala-answer-submit"));
    expect(cmd).toHaveBeenCalledTimes(1);
  });

  it("hides the microphone entirely on a browser without speech", () => {
    delete (window as unknown as Record<string, unknown>).SpeechRecognition;
    delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    const { cmd } = renderPhone();
    fireEvent.change(screen.getByLabelText("الإجابة"), {
      target: { value: "CJ" },
    });
    fireEvent.click(screen.getByTestId("marhala-answer-submit"));
    expect(cmd).toHaveBeenCalledTimes(1);
  });
});

describe("voice touches nothing else", () => {
  it("clears speech state when the turn moves on", () => {
    const cmd = vi.fn();
    const { rerender } = renderPhone(questionState(), undefined, cmd);
    fireEvent.click(screen.getByTestId("marhala-voice"));
    act(() => FakeRecognition.latest().emit("سي", false));
    rerender(tree(runtimeOf(shared({ turnNumber: 4 })), cmd));
    expect(screen.queryByTestId("marhala-voice")).toBeNull();
    expect(screen.getByTestId("marhala-band-choices")).toBeInTheDocument();
  });

  it("never reveals a prepared question, microphone or not", () => {
    renderPhone(
      shared({
        phase: "question-pending",
        questionPrompt: JSON.stringify({ ar: PROMPT }),
      }),
    );
    expect(document.body.textContent).not.toContain(PROMPT);
    expect(screen.queryByTestId("marhala-voice")).toBeNull();
  });

  it("adds no board, roll or movement surface to the phone", () => {
    renderPhone();
    expect(screen.queryByTestId("marhala-board")).toBeNull();
    expect(screen.queryByTestId("marhala-movement-roll")).toBeNull();
    expect(document.querySelector("[data-route-kind]")).toBeNull();
  });
});
