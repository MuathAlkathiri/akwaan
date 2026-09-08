import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LiveSessionContext } from "@/features/live-game-session/hooks/live-session-context";
import { ComboGameplayPanel } from "@/features/live-game-session/components/combo-gameplay-panel";
import { MobileGameplayShell } from "@/features/live-game-session/match/components/mobile-gameplay-shell";
import type { GameplayRuntimeSnapshot } from "@/features/live-game-session/model";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/join/live-session/ABC123",
}));

const TEAMS = [
  { id: "team-alpha", name: "ألفا", active: true },
  { id: "team-beta", name: "بيتا", active: true },
];

const stateWith = (overrides: Record<string, unknown> = {}) => ({
  phase: "question",
  runIndex: 0,
  questionIndex: 0,
  questionNumber: 1,
  questionsPerRun: 4,
  activeTeamId: "team-alpha",
  actorTeamId: "team-alpha",
  isActiveTeam: true,
  canArmComboBreak: false,
  unbankedPoints: 0,
  forcedQuestion: false,
  teamIdsJson: JSON.stringify(["team-alpha", "team-beta"]),
  chargesJson: JSON.stringify({
    "team-alpha": "available",
    "team-beta": "available",
  }),
  runResultsJson: JSON.stringify([]),
  deadlineAt: "2099-01-01T00:00:30.000Z",
  questionPrompt: JSON.stringify({ ar: "من هو الهوكاجي السابع؟" }),
  questionStage: 1,
  ...overrides,
});

const ALL_ACTIONS = [
  "mode:submit-combo-answer",
  "mode:cash-out-combo",
  "mode:continue-combo",
  "mode:arm-combo-break",
];

const runtimeWith = (
  state: Record<string, unknown> = stateWith(),
  availableActions = ALL_ACTIONS,
) =>
  ({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    mode: { key: "combo", version: 1 },
    status: "in-round",
    revision: 4,
    availableActions,
    activeRound: { id: "round-1", sequence: 1, status: "active" },
    modeState: state,
  }) as unknown as GameplayRuntimeSnapshot;

const context = (gameplayCommand = vi.fn()) =>
  ({
    snapshot: {
      sessionId: "session-1",
      revision: 4,
      serverTimestamp: "2026-01-01T00:00:10.000Z",
      teams: TEAMS,
      participants: [
        { id: "p-1", displayName: "لاعب ألفا", teamId: "team-alpha", role: "player" },
        { id: "p-2", displayName: "لاعب بيتا", teamId: "team-beta", role: "player" },
      ],
      availableActions: [],
    },
    connection: "connected",
    gameplayCommand,
    resync: vi.fn(),
  }) as never;

const renderPhone = (
  runtime = runtimeWith(),
  gameplayCommand = vi.fn(),
) => {
  const view = render(
    <LiveSessionContext.Provider value={context(gameplayCommand)}>
      <MobileGameplayShell participantId="p-1">
        <ComboGameplayPanel runtime={runtime} />
      </MobileGameplayShell>
    </LiveSessionContext.Provider>,
  );
  return { ...view, gameplayCommand };
};

describe("الكومبو phone controller", () => {
  it("uses the compact frame, one concise question, and the shared action area", () => {
    renderPhone();
    expect(screen.getByTestId("combo-phone-controller")).toBeInTheDocument();
    expect(screen.getByTestId("challenge-frame").innerHTML).toContain("px-4");
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "من هو الهوكاجي السابع؟",
    );
    expect(
      within(screen.getByTestId("mobile-action-area")).getByTestId(
        "combo-answer-submit",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("combo-streak")).toBeNull();
  });

  it("keeps the answer command and closes the double-submit window", () => {
    const { gameplayCommand } = renderPhone();
    fireEvent.change(screen.getByTestId("combo-answer-input"), {
      target: { value: "  ناروتو  " },
    });
    const submit = screen.getByTestId("combo-answer-submit");
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(gameplayCommand).toHaveBeenCalledTimes(1);
    expect(gameplayCommand).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "submit-combo-answer",
      payload: { answer: "ناروتو" },
    });
    expect(submit).toBeDisabled();
  });

  it("shows the authoritative Q1-Q3 decision with equal actions and runtime balance", () => {
    renderPhone(
      runtimeWith(
        stateWith({ phase: "decision", questionNumber: 3, questionIndex: 2, unbankedPoints: 4, deadlineAt: null }),
      ),
    );
    const area = screen.getByTestId("mobile-action-area");
    expect(screen.getByText("وش تبون تسوون؟")).toBeInTheDocument();
    expect(screen.getByTestId("combo-phone-balance")).toHaveTextContent("4");
    expect(within(area).getByTestId("combo-phone-cash-out").className).toContain("h-16");
    expect(within(area).getByTestId("combo-phone-continue").className).toContain("h-16");
  });

  it("keeps bank and continue commands exact and permits only one decision", () => {
    const command = vi.fn();
    renderPhone(
      runtimeWith(stateWith({ phase: "decision", unbankedPoints: 2, deadlineAt: null })),
      command,
    );
    fireEvent.click(screen.getByTestId("combo-phone-cash-out"));
    fireEvent.click(screen.getByTestId("combo-phone-continue"));
    expect(command).toHaveBeenCalledTimes(1);
    expect(command).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "cash-out-combo",
      payload: {},
    });
  });

  it("never invents a Q4 decision when the authoritative state auto-banks", () => {
    renderPhone(
      runtimeWith(
        stateWith({
          phase: "run-complete",
          questionIndex: 3,
          questionNumber: 4,
          runResultsJson: JSON.stringify([
            { teamId: "team-alpha", runIndex: 0, bankedPoints: 4, questionsAnswered: 4, endedBy: "final-question", brokenByTeamId: null, endedAt: "2026-01-01T00:01:00.000Z" },
          ]),
          deadlineAt: null,
        }),
      ),
    );
    expect(screen.queryByTestId("combo-phone-decision")).toBeNull();
    expect(screen.queryByTestId("combo-phone-cash-out")).toBeNull();
    expect(screen.queryByTestId("combo-phone-continue")).toBeNull();
    expect(screen.getByTestId("combo-phone-run-result")).toHaveTextContent("4");
  });

  it.each(["combo-break", "timeout"])(
    "shows the authoritative %s failure without stale controls",
    (endedBy) => {
      renderPhone(
        runtimeWith(
          stateWith({
            phase: "run-complete",
            runIndex: 1,
            activeTeamId: "team-beta",
            isActiveTeam: false,
            runResultsJson: JSON.stringify([
              { teamId: "team-alpha", runIndex: 0, bankedPoints: 0, questionsAnswered: 2, endedBy, brokenByTeamId: null, endedAt: "2026-01-01T00:01:00.000Z" },
            ]),
            deadlineAt: null,
          }),
        ),
      );
      expect(screen.getByTestId("combo-phone-run-result")).toHaveTextContent("انكسر الكومبو");
      expect(screen.queryByTestId("combo-answer-input")).toBeNull();
      expect(screen.queryByTestId("combo-phone-decision")).toBeNull();
    },
  );

  it("hides answering during the opponent run and exposes only an authorized force action", () => {
    renderPhone(
      runtimeWith(
        stateWith({ activeTeamId: "team-beta", isActiveTeam: false, canArmComboBreak: true }),
      ),
    );
    expect(screen.getByTestId("combo-phone-opponent-run")).toBeInTheDocument();
    expect(screen.queryByTestId("combo-answer-input")).toBeNull();
    expect(screen.getByTestId("combo-phone-force")).toHaveTextContent("كمّل غصب");
  });

  it("keeps an unused opponent ability and future answers absent", () => {
    renderPhone(
      runtimeWith(
        stateWith({
          canArmComboBreak: false,
          armedBreakByTeamId: "team-beta",
          questionPlanJson: JSON.stringify([{ acceptedAnswers: ["سر"] }]),
        }),
      ),
    );
    expect(screen.queryByTestId("combo-phone-force")).toBeNull();
    expect(document.body).not.toHaveTextContent("سر");
    expect(document.body).not.toHaveTextContent("بيتا كسر");
  });

  it("keeps the force command exact and prevents duplicate use", () => {
    const command = vi.fn();
    renderPhone(
      runtimeWith(stateWith({ activeTeamId: "team-beta", isActiveTeam: false, canArmComboBreak: true })),
      command,
    );
    const force = screen.getByTestId("combo-phone-force");
    fireEvent.click(force);
    fireEvent.click(force);
    expect(command).toHaveBeenCalledTimes(1);
    expect(command).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "arm-combo-break",
      payload: {},
    });
  });

  it("follows the public forced state and offers no cash out", () => {
    renderPhone(
      runtimeWith(
        stateWith({
          phase: "break-reveal",
          comboBreakRevealedByTeamId: "team-beta",
          unbankedPoints: 2,
          deadlineAt: null,
        }),
      ),
    );
    expect(screen.getByTestId("combo-phone-break-reveal")).toHaveTextContent(
      "الخصم أجبركم تكملون",
    );
    expect(screen.getByTestId("combo-phone-forced-continue")).toBeInTheDocument();
    expect(screen.queryByTestId("combo-phone-cash-out")).toBeNull();
  });

  it("keeps panel identity across answer, decision, and the next question", () => {
    const command = vi.fn();
    const { rerender } = renderPhone(runtimeWith(), command);
    const panel = screen.getByTestId("combo-phone-controller");
    rerender(
      <LiveSessionContext.Provider value={context(command)}>
        <MobileGameplayShell participantId="p-1">
          <ComboGameplayPanel runtime={runtimeWith(stateWith({ phase: "decision", unbankedPoints: 1, deadlineAt: null }))} />
        </MobileGameplayShell>
      </LiveSessionContext.Provider>,
    );
    expect(screen.getByTestId("combo-phone-controller")).toBe(panel);
    rerender(
      <LiveSessionContext.Provider value={context(command)}>
        <MobileGameplayShell participantId="p-1">
          <ComboGameplayPanel runtime={runtimeWith(stateWith({ questionIndex: 1, questionNumber: 2, unbankedPoints: 1 }))} />
        </MobileGameplayShell>
      </LiveSessionContext.Provider>,
    );
    expect(screen.getByTestId("combo-phone-controller")).toBe(panel);
  });
});

describe("الكومبو host regression", () => {
  it("keeps the full host presentation and non-compact frame", () => {
    render(
      <LiveSessionContext.Provider value={context()}>
        <ComboGameplayPanel runtime={runtimeWith()} />
      </LiveSessionContext.Provider>,
    );
    expect(screen.getByTestId("combo-streak")).toBeInTheDocument();
    expect(screen.getByTestId("combo-prompt").className).toContain("text-[2rem]");
    expect(screen.getByTestId("challenge-frame").innerHTML).toContain("px-5");
    expect(screen.queryByTestId("combo-phone-controller")).toBeNull();
  });
});
