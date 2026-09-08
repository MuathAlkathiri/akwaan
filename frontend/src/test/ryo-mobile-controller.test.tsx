import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RyoGameplayPanel } from "@/features/live-game-session/components/ryo-gameplay-panel";
import { LiveSessionContext } from "@/features/live-game-session/hooks/live-session-context";
import { MobileGameplayShell } from "@/features/live-game-session/match/components/mobile-gameplay-shell";
import type { GameplayRuntimeSnapshot } from "@/features/live-game-session/model";

vi.mock(
  "@/features/live-game-session/hooks/live-session-clock-context",
  () => ({
    useLiveSessionClock: () => Date.parse("2026-09-05T12:00:00.000Z"),
  }),
);

const ITEM = {
  id: "item-1",
  prompt: { ar: "كم عدد الكواكب في المجموعة الشمسية؟" },
  answerMode: "multiple_choice",
  options: [
    { id: "eight", label: { ar: "ثمانية" } },
    { id: "nine", label: { ar: "تسعة" } },
  ],
};

function runtimeWith({
  role = "answering",
  assigned = true,
  item = ITEM,
  submissions = [],
  outcome,
  phase,
  itemIndex = 0,
}: {
  role?: string;
  assigned?: boolean;
  item?: Record<string, unknown> | null;
  submissions?: Array<{ kind: string }>;
  outcome?: Record<string, unknown>;
  phase?: string;
  itemIndex?: number;
} = {}): GameplayRuntimeSnapshot {
  return {
    runtimeId: "runtime-1",
    sessionId: "session-1",
    mode: { key: "read-your-opponent", version: 1 },
    status: "round-active",
    revision: 4,
    modeState: { currentItemIndex: itemIndex, ...(phase ? { phase } : {}) },
    availableActions: ["submission:create"],
    activeRound: {
      id: "round-1",
      status: "active",
      modeState: { answeringTeamId: "team-a", opposingTeamId: "team-b" },
      interaction: {
        id: `interaction-${itemIndex + 1}`,
        status: outcome ? "resolved" : "open",
        prompt: item
          ? {
              deadlineAt: "2026-09-05T12:00:25.000Z",
              payload: {
                itemJson: JSON.stringify(item),
                actorRole: role,
                isAssignedActor: assigned,
                answererParticipantId: "p-answerer",
                deciderParticipantId: "p-decider",
              },
            }
          : undefined,
        submissions: submissions.map((submission, index) => ({
          id: `submission-${index}`,
          status: "pending-adjudication",
          payload: { kind: submission.kind },
        })),
        ...(outcome ? { outcome: { payload: outcome } } : {}),
      },
    },
  } as unknown as GameplayRuntimeSnapshot;
}

const context = (gameplayCommand = vi.fn()) =>
  ({
    snapshot: {
      sessionId: "session-1",
      revision: 4,
      serverTimestamp: "2026-09-05T12:00:00.000Z",
      teams: [
        { id: "team-a", name: "ألفا", active: true },
        { id: "team-b", name: "بيتا", active: true },
      ],
      participants: [
        {
          id: "p-answerer",
          displayName: "لاعب ألفا",
          teamId: "team-a",
          role: "player",
        },
        {
          id: "p-decider",
          displayName: "لاعب بيتا",
          teamId: "team-b",
          role: "player",
        },
      ],
      availableActions: [],
    },
    connection: "connected",
    gameplayCommand,
    command: vi.fn(),
  }) as never;

function renderPhone(runtime = runtimeWith(), gameplayCommand = vi.fn()) {
  const view = render(
    <LiveSessionContext.Provider value={context(gameplayCommand)}>
      <MobileGameplayShell participantId="p-answerer">
        <RyoGameplayPanel runtime={runtime} />
      </MobileGameplayShell>
    </LiveSessionContext.Provider>,
  );
  return { ...view, gameplayCommand };
}

describe("اقرأ خصمك phone controller", () => {
  it("uses the compact controller without shared-screen lock spectacle", () => {
    renderPhone();
    expect(screen.getByTestId("ryo-phone-controller")).toBeInTheDocument();
    expect(screen.getByTestId("challenge-frame").innerHTML).toContain("px-4");
    expect(screen.getByText(ITEM.prompt.ar)).toBeInTheDocument();
    expect(screen.queryByTestId("ryo-lock-indicators")).toBeNull();
    expect(screen.queryByText("اقرأ خصمك")).toBeNull();
  });

  it("submits the projected option id exactly once and exposes a pending state", () => {
    const command = vi.fn();
    renderPhone(runtimeWith(), command);
    const answer = screen.getByRole("button", { name: "ثمانية" });
    fireEvent.click(answer);
    fireEvent.click(answer);
    expect(command).toHaveBeenCalledTimes(1);
    expect(command).toHaveBeenCalledWith("interaction-submit", {
      roundId: "round-1",
      payload: { kind: "answer", mode: "multiple_choice", optionId: "eight" },
    });
    expect(answer).toBeDisabled();
    expect(screen.getByText("جارٍ تثبيت اختيارك…")).toBeInTheDocument();
  });

  it("submits an exact finite closest estimate", () => {
    const command = vi.fn();
    renderPhone(
      runtimeWith({ item: { ...ITEM, answerMode: "closest", options: null } }),
      command,
    );
    fireEvent.change(screen.getByTestId("ryo-phone-number"), {
      target: { value: "8.5" },
    });
    fireEvent.click(screen.getByTestId("ryo-phone-number-submit"));
    expect(command).toHaveBeenCalledWith("interaction-submit", {
      roundId: "round-1",
      payload: { kind: "answer", mode: "closest", value: 8.5 },
    });
  });

  it("preserves a closest draft when only the opponent submission changes", () => {
    const closest = { ...ITEM, answerMode: "closest", options: null };
    const { rerender } = renderPhone(runtimeWith({ item: closest }));
    const input = screen.getByTestId("ryo-phone-number");
    fireEvent.change(input, { target: { value: "8.5" } });
    rerender(
      <LiveSessionContext.Provider value={context()}>
        <MobileGameplayShell participantId="p-answerer">
          <RyoGameplayPanel
            runtime={runtimeWith({
              item: closest,
              submissions: [{ kind: "decision" }],
            })}
          />
        </MobileGameplayShell>
      </LiveSessionContext.Provider>,
    );
    expect(screen.getByTestId("ryo-phone-number")).toHaveValue("8.5");
  });

  it("keeps Trust and Steal equal and submits only the canonical decision", () => {
    const command = vi.fn();
    renderPhone(runtimeWith({ role: "opposing" }), command);
    const controls = screen.getByTestId("ryo-phone-decision-controls");
    const buttons = Array.from(controls.querySelectorAll("button"));
    expect(buttons).toHaveLength(2);
    expect(buttons[0].className).toBe(buttons[1].className);
    fireEvent.click(within(controls).getByText("متأكد منهم"));
    expect(command).toHaveBeenCalledWith("interaction-submit", {
      roundId: "round-1",
      payload: { kind: "decision", decision: "steal" },
    });
    expect(screen.getByText("جارٍ تثبيت اختيارك…")).toBeInTheDocument();
  });

  it("gives teammates and spectators no participant-owned controls", () => {
    const { rerender } = renderPhone(runtimeWith({ assigned: false }));
    expect(screen.queryByTestId("ryo-phone-answer-controls")).toBeNull();
    expect(screen.getByText(/لاعب ألفا هو صاحب القرار/)).toBeInTheDocument();
    rerender(
      <LiveSessionContext.Provider value={context()}>
        <MobileGameplayShell participantId="p-answerer">
          <RyoGameplayPanel
            runtime={runtimeWith({ role: "spectator", assigned: false })}
          />
        </MobileGameplayShell>
      </LiveSessionContext.Provider>,
    );
    expect(screen.queryByTestId("ryo-phone-answer-controls")).toBeNull();
    expect(screen.queryByTestId("ryo-phone-decision-controls")).toBeNull();
  });

  it("renders only redacted submission presence until the public outcome arrives", () => {
    const { rerender } = renderPhone(
      runtimeWith({ role: "opposing", submissions: [{ kind: "answer" }] }),
    );
    expect(document.body).not.toHaveTextContent("eight");
    expect(document.body).not.toHaveTextContent("steal");
    rerender(
      <LiveSessionContext.Provider value={context()}>
        <MobileGameplayShell participantId="p-answerer">
          <RyoGameplayPanel
            runtime={runtimeWith({
              role: "opposing",
              outcome: { correct: false, decision: "steal", failedSteal: true },
            })}
          />
        </MobileGameplayShell>
      </LiveSessionContext.Provider>,
    );
    expect(screen.getByTestId("ryo-phone-reveal")).toHaveTextContent(
      "إجابة غير صحيحة",
    );
    expect(screen.queryByTestId("ryo-phone-decision-controls")).toBeNull();
  });

  it("keeps one controller node across recurring items and reaches completion", () => {
    const { rerender } = renderPhone();
    const controller = screen.getByTestId("ryo-phone-controller");
    rerender(
      <LiveSessionContext.Provider value={context()}>
        <MobileGameplayShell participantId="p-answerer">
          <RyoGameplayPanel runtime={runtimeWith({ itemIndex: 1 })} />
        </MobileGameplayShell>
      </LiveSessionContext.Provider>,
    );
    expect(screen.getByTestId("ryo-phone-controller")).toBe(controller);
    rerender(
      <LiveSessionContext.Provider value={context()}>
        <MobileGameplayShell participantId="p-answerer">
          <RyoGameplayPanel
            runtime={runtimeWith({
              item: null,
              phase: "completed",
              itemIndex: 2,
            })}
          />
        </MobileGameplayShell>
      </LiveSessionContext.Provider>,
    );
    expect(screen.getByTestId("ryo-phone-complete")).toBeInTheDocument();
  });

  it("converges safely after reconnect in active, submitted, decision, and between-item states", () => {
    const { rerender } = renderPhone();
    expect(screen.getByTestId("ryo-phone-answer-controls")).toBeInTheDocument();

    rerender(
      <LiveSessionContext.Provider value={context()}>
        <MobileGameplayShell participantId="p-answerer">
          <RyoGameplayPanel
            runtime={runtimeWith({ submissions: [{ kind: "answer" }] })}
          />
        </MobileGameplayShell>
      </LiveSessionContext.Provider>,
    );
    expect(screen.queryByTestId("ryo-phone-answer-controls")).toBeNull();
    expect(screen.getByTestId("ryo-phone-waiting")).toBeInTheDocument();

    rerender(
      <LiveSessionContext.Provider value={context()}>
        <MobileGameplayShell participantId="p-decider">
          <RyoGameplayPanel runtime={runtimeWith({ role: "opposing" })} />
        </MobileGameplayShell>
      </LiveSessionContext.Provider>,
    );
    expect(
      screen.getByTestId("ryo-phone-decision-controls"),
    ).toBeInTheDocument();

    rerender(
      <LiveSessionContext.Provider value={context()}>
        <MobileGameplayShell participantId="p-answerer">
          <RyoGameplayPanel
            runtime={runtimeWith({ item: null, itemIndex: 1 })}
          />
        </MobileGameplayShell>
      </LiveSessionContext.Provider>,
    );
    expect(screen.getByTestId("ryo-phone-between-items")).toBeInTheDocument();
    expect(screen.queryByTestId("ryo-phone-answer-controls")).toBeNull();
    expect(document.body).not.toHaveTextContent("steal");
  });
});
