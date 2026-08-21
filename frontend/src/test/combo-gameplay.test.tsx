import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  gameplayCommand: vi.fn(),
  connection: "connected" as string,
  nowMs: Date.parse("2026-01-01T00:00:10.000Z"),
}));

vi.mock(
  "@/features/live-game-session/hooks/live-session-clock-context",
  () => ({
    useLiveSessionClock: () => mocks.nowMs,
  }),
);

vi.mock("@/features/live-game-session/hooks/live-session-context", () => ({
  useLiveSession: () => ({
    snapshot: {
      serverTimestamp: "2026-01-01T00:00:10.000Z",
      teams: [
        { id: "team-alpha", name: "ألفا" },
        { id: "team-beta", name: "بيتا" },
      ],
      participants: [],
    },
    snapshotReceivedAtMs: mocks.nowMs,
    gameplayCommand: mocks.gameplayCommand,
    connection: mocks.connection,
  }),
}));

import { ComboGameplayPanel } from "@/features/live-game-session/components/combo-gameplay-panel";
import { readComboView } from "@/features/live-game-session/match/combo.presentation";

const DEADLINE = "2026-01-01T00:00:40.000Z";

/**
 * The shared half of the projection — what `projectRuntimeState` publishes with
 * no actor, i.e. exactly what the shared screen receives.
 */
const sharedState = (overrides: Record<string, unknown> = {}) => ({
  phase: "question",
  runIndex: 0,
  questionIndex: 1,
  questionNumber: 2,
  questionsPerRun: 4,
  activeTeamId: "team-alpha",
  unbankedPoints: 2,
  forcedQuestion: false,
  teamIdsJson: JSON.stringify(["team-alpha", "team-beta"]),
  runResultsJson: JSON.stringify([]),
  chargesJson: JSON.stringify({
    "team-alpha": "available",
    "team-beta": "available",
  }),
  deadlineAt: DEADLINE,
  questionPrompt: JSON.stringify({ ar: "من فاز بكأس العالم 2018؟" }),
  questionStage: 2,
  ...overrides,
});

/** The running team's phone: `isActiveTeam`, and never a break offer. */
const runningTeamState = (overrides: Record<string, unknown> = {}) => ({
  ...sharedState(),
  actorTeamId: "team-alpha",
  isActiveTeam: true,
  canArmComboBreak: false,
  ...overrides,
});

/** The opposing team's phone, charge still in hand. */
const opposingTeamState = (overrides: Record<string, unknown> = {}) => ({
  ...sharedState(),
  actorTeamId: "team-beta",
  isActiveTeam: false,
  canArmComboBreak: true,
  ...overrides,
});

const ALL_ACTIONS = [
  "mode:submit-combo-answer",
  "mode:cash-out-combo",
  "mode:continue-combo",
  "mode:arm-combo-break",
  "mode:advance-combo-run",
];

const runtime = (modeState: Record<string, unknown>, actions = ALL_ACTIONS) =>
  ({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    mode: { key: "combo", version: 1 },
    status: "in-round",
    availableActions: actions,
    activeRound: { id: "round-1", status: "active" },
    modeState,
  }) as never;

beforeEach(() => {
  mocks.gameplayCommand.mockReset();
  mocks.connection = "connected";
});

describe("الكومبو — shared screen", () => {
  it("shows the prompt, the streak and both charges without offering any control", () => {
    render(<ComboGameplayPanel runtime={runtime(sharedState())} />);

    expect(screen.getByTestId("combo-prompt")).toHaveTextContent(
      "من فاز بكأس العالم 2018؟",
    );
    expect(screen.getByTestId("combo-streak-points")).toHaveTextContent("2");
    expect(screen.getByTestId("combo-charge-team-alpha")).toHaveTextContent(
      "الكسر متاح",
    );
    // No actor projection means no actor controls, even though the runtime lists
    // the actions — the shared screen is nobody's phone.
    expect(screen.queryByTestId("combo-answer-controls")).toBeNull();
    expect(screen.queryByTestId("combo-arm-break")).toBeNull();
  });

  it("reports a spent charge, because whether it was used is public", () => {
    render(
      <ComboGameplayPanel
        runtime={runtime(
          sharedState({
            chargesJson: JSON.stringify({
              "team-alpha": "available",
              "team-beta": "spent",
            }),
          }),
        )}
      />,
    );
    expect(screen.getByTestId("combo-charge-team-beta")).toHaveTextContent(
      "استُخدم الكسر",
    );
  });
});

describe("الكومبو — the running team", () => {
  it("submits a trimmed answer against the open question", async () => {
    render(<ComboGameplayPanel runtime={runtime(runningTeamState())} />);
    await userEvent.type(
      screen.getByPlaceholderText("اكتب الإجابة"),
      "  فرنسا  ",
    );
    await userEvent.click(screen.getByRole("button", { name: "إرسال" }));

    expect(mocks.gameplayCommand).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "submit-combo-answer",
      payload: { answer: "فرنسا" },
    });
  });

  it("is never offered the break, even while holding its own charge", () => {
    render(<ComboGameplayPanel runtime={runtime(runningTeamState())} />);
    expect(screen.queryByTestId("combo-arm-break")).toBeNull();
  });

  it("cannot submit while disconnected", () => {
    mocks.connection = "reconnecting";
    render(<ComboGameplayPanel runtime={runtime(runningTeamState())} />);
    expect(screen.getByRole("button", { name: "إرسال" })).toBeDisabled();
  });

  it("banks the streak the server published, without adding a bonus itself", async () => {
    // The runtime already folded the survival bonus into `unbankedPoints` when it
    // paid the forced question. A client that re-added it would offer 4 for 3.
    render(
      <ComboGameplayPanel
        runtime={runtime(
          runningTeamState({
            phase: "decision",
            unbankedPoints: 3,
            deadlineAt: null,
          }),
        )}
      />,
    );
    await userEvent.click(screen.getByTestId("combo-cash-out"));
    expect(screen.getByTestId("combo-cash-out")).toHaveTextContent("اسحب 3");
    expect(mocks.gameplayCommand).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "cash-out-combo",
      payload: {},
    });
  });

  it("clears a typed answer when the server moves to the next question", async () => {
    const { rerender } = render(
      <ComboGameplayPanel runtime={runtime(runningTeamState())} />,
    );
    await userEvent.type(screen.getByPlaceholderText("اكتب الإجابة"), "خطأ");
    rerender(
      <ComboGameplayPanel
        runtime={runtime(
          runningTeamState({ questionIndex: 2, questionNumber: 3 }),
        )}
      />,
    );
    expect(screen.getByPlaceholderText("اكتب الإجابة")).toHaveValue("");
  });

  it("waits when the other team is the one answering", () => {
    render(<ComboGameplayPanel runtime={runtime(opposingTeamState())} />);
    expect(screen.queryByTestId("combo-answer-controls")).toBeNull();
    expect(screen.getByText(/ألفا يجيب الآن/)).toBeInTheDocument();
  });
});

describe("الكومبو — كسر الكومبو secrecy", () => {
  it("offers the break to the opposing team and arms it with no payload", async () => {
    render(<ComboGameplayPanel runtime={runtime(opposingTeamState())} />);
    await userEvent.click(screen.getByTestId("combo-arm-break"));
    expect(mocks.gameplayCommand).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "arm-combo-break",
      payload: {},
    });
  });

  it("acknowledges the armed break privately, to the arming team only", () => {
    render(
      <ComboGameplayPanel
        runtime={runtime(
          opposingTeamState({
            canArmComboBreak: false,
            ownComboBreakArmed: true,
          }),
        )}
      />,
    );
    expect(
      screen.getByTestId("combo-armed-acknowledgement"),
    ).toBeInTheDocument();
    // The charge is now spent, so the offer is gone — one use only.
    expect(screen.queryByTestId("combo-arm-break")).toBeNull();
  });

  it("shows the running team nothing at all while a break is armed against it", () => {
    // This is the running team's projection at the very same moment as the test
    // above: the server sent no armed key of any kind, so nothing can be shown.
    render(<ComboGameplayPanel runtime={runtime(runningTeamState())} />);
    expect(screen.queryByTestId("combo-armed-acknowledgement")).toBeNull();
    expect(screen.queryByTestId("combo-forced-banner")).toBeNull();
    expect(screen.queryByTestId("combo-break-reveal")).toBeNull();
  });

  it("never reads the runtime's own armed key, even if it were leaked", () => {
    // `armedBreakByTeamId` is internal and is stripped by every projection. The
    // client has no path from it to a rendered secret, so an accidental leak
    // upstream still cannot surface here.
    const view = readComboView({
      ...sharedState(),
      armedBreakByTeamId: "team-beta",
    });
    expect(view.ownComboBreakArmed).toBe(false);
    expect(view.breakRevealedByTeamId).toBeUndefined();
  });
});

describe("الكومبو — surviving the break", () => {
  it("names the revealer and removes the right to stop", () => {
    render(
      <ComboGameplayPanel
        runtime={runtime(
          runningTeamState({
            phase: "break-reveal",
            comboBreakRevealedByTeamId: "team-beta",
            chargesJson: JSON.stringify({
              "team-alpha": "available",
              "team-beta": "spent",
            }),
          }),
        )}
      />,
    );
    expect(screen.getByTestId("combo-break-reveal")).toHaveTextContent(
      "بيتا كسر كومبوكم",
    );
    // Removing cash-out is the whole ability; the server rejects it here too.
    expect(screen.queryByTestId("combo-cash-out")).toBeNull();
    expect(screen.getByTestId("combo-forced-continue")).toBeInTheDocument();
  });

  it("keeps the revealer visible through the forced question", () => {
    render(
      <ComboGameplayPanel
        runtime={runtime(
          runningTeamState({
            forcedQuestion: true,
            comboBreakRevealedByTeamId: "team-beta",
          }),
        )}
      />,
    );
    const banner = screen.getByTestId("combo-forced-banner");
    expect(banner).toHaveTextContent("سؤال إجباري");
    expect(banner).toHaveTextContent("بيتا كسر كومبوكم");
    expect(screen.queryByTestId("combo-cash-out")).toBeNull();
    // The bonus is not paid until this question is answered, so the streak on
    // screen is still the pre-bonus figure the server sent. Previewing the
    // reward here would show the team points it does not hold.
    expect(screen.getByTestId("combo-streak-points")).toHaveTextContent("2");
  });
});

describe("الكومبو — run handover and result", () => {
  it("offers the handover only to the actor the server gave the action to", () => {
    const recap = runningTeamState({
      phase: "run-complete",
      deadlineAt: null,
      runResultsJson: JSON.stringify([
        {
          teamId: "team-alpha",
          runIndex: 0,
          bankedPoints: 3,
          questionsAnswered: 3,
          endedBy: "combo-break",
          brokenByTeamId: "team-beta",
          endedAt: "2026-01-01T00:01:00.000Z",
        },
      ]),
    });

    const { unmount } = render(
      <ComboGameplayPanel
        runtime={runtime(recap, ["mode:advance-combo-run"])}
      />,
    );
    expect(screen.getByTestId("combo-advance-run")).toHaveTextContent(
      "دور الفريق الآخر",
    );
    expect(screen.getByTestId("combo-recap-team-alpha")).toHaveTextContent("3");
    expect(screen.getByTestId("combo-recap-team-alpha")).toHaveTextContent(
      "كُسر الكومبو",
    );
    expect(screen.getByTestId("combo-recap-team-alpha")).toHaveTextContent(
      "على يد بيتا",
    );
    expect(screen.getByTestId("combo-recap-team-beta")).toHaveTextContent(
      "لم تلعب بعد",
    );
    unmount();

    // A player's action list does not carry the handover, so no button exists.
    render(
      <ComboGameplayPanel
        runtime={runtime(recap, ["mode:submit-combo-answer"])}
      />,
    );
    expect(screen.queryByTestId("combo-advance-run")).toBeNull();
    expect(screen.getByText("بانتظار المضيف للمتابعة…")).toBeInTheDocument();
  });

  it("words the final handover as the challenge result", () => {
    render(
      <ComboGameplayPanel
        runtime={runtime(
          runningTeamState({
            phase: "run-complete",
            runIndex: 1,
            deadlineAt: null,
          }),
          ["mode:advance-combo-run"],
        )}
      />,
    );
    expect(screen.getByTestId("combo-advance-run")).toHaveTextContent(
      "عرض نتيجة التحدي",
    );
  });

  it("declares the winner the server declared", () => {
    render(
      <ComboGameplayPanel
        runtime={runtime(
          sharedState({
            phase: "completed",
            runIndex: 1,
            deadlineAt: null,
            resultJson: JSON.stringify({
              winnerTeamId: "team-beta",
              tie: false,
              points: { "team-alpha": 2, "team-beta": 4 },
            }),
          }),
        )}
      />,
    );
    expect(screen.getByTestId("combo-result")).toHaveTextContent(
      "بيتا فاز بالتحدي!",
    );
  });

  it("declares a tie without inventing a winner", () => {
    render(
      <ComboGameplayPanel
        runtime={runtime(
          sharedState({
            phase: "completed",
            deadlineAt: null,
            resultJson: JSON.stringify({
              winnerTeamId: null,
              tie: true,
              points: { "team-alpha": 3, "team-beta": 3 },
            }),
          }),
        )}
      />,
    );
    expect(screen.getByTestId("combo-result")).toHaveTextContent("تعادل!");
  });
});
