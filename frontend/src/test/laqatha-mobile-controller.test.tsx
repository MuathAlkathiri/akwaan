import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LiveSessionContext } from "@/features/live-game-session/hooks/live-session-context";
import { LaqathaGameplayPanel } from "@/features/live-game-session/components/laqatha-gameplay-panel";
import { MobileGameplayShell } from "@/features/live-game-session/match/components/mobile-gameplay-shell";
import type { GameplayRuntimeSnapshot } from "@/features/live-game-session/model";

/**
 * القطها on a player's phone.
 *
 * The mechanic is a race the phone cannot see: clues ladder on the shared screen
 * and the server projects `cluesJson: '[]'` to every phone. So a phone's whole
 * job is two taps — claim, then type inside five seconds — and these tests are
 * mostly about who may act, who may not, and that no timing is ever decided here.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/join/live-session/ABC123",
}));

const TEAMS = [
  { id: "team-alpha", name: "أسود الشمال", active: true },
  { id: "team-beta", name: "صقور الرياض", active: true },
];
const MOVIE = "الرسالة";
const CLUE = "بطل هذا الفيلم مصري";

/** Exactly the phone projection: no clues, only what this team may do. */
const phoneState = (over: Record<string, unknown> = {}) => ({
  phase: "revealing",
  currentQuestionIndex: 0,
  questionCount: 3,
  revealedClueCount: 2,
  currentReward: 4,
  cluesJson: "[]",
  failedTeamIdsJson: "[]",
  teamIdsJson: JSON.stringify(["team-alpha", "team-beta"]),
  deadlineAt: "2026-01-01T00:00:13.000Z",
  canClaim: true,
  canSubmit: false,
  attemptUsed: false,
  actorTeamId: "team-alpha",
  ...over,
});

/** The shared screen's projection: revealed clues only, never future ones. */
const screenState = (over: Record<string, unknown> = {}) => {
  const base = phoneState(over);
  return {
    ...base,
    cluesJson: JSON.stringify([
      { order: 1, value: 5, modality: "text", text: { ar: CLUE } },
      { order: 2, value: 4, modality: "text", text: { ar: "صدر في السبعينات" } },
    ]),
  };
};

const ACTIONS = ["mode:claim-laqatha", "mode:submit-laqatha"];

const runtimeOf = (modeState: Record<string, unknown>, actions = ACTIONS) =>
  ({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    mode: { key: "laqatha", version: 1 },
    status: "round-active",
    revision: 4,
    availableActions: actions,
    activeRound: { id: "round-1", sequence: 1, status: "active" },
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
    connection: "connected",
    gameplayCommand,
    resync: vi.fn(),
  }) as never;

const phoneTree = (
  runtime: GameplayRuntimeSnapshot,
  cmd: ReturnType<typeof vi.fn>,
) => (
  <LiveSessionContext.Provider value={context(cmd)}>
    <MobileGameplayShell participantId="p-1">
      <LaqathaGameplayPanel runtime={runtime} actor="participant" />
    </MobileGameplayShell>
  </LiveSessionContext.Provider>
);

const renderPhone = (
  modeState = phoneState(),
  actions?: string[],
  cmd = vi.fn(),
) => {
  const view = render(phoneTree(runtimeOf(modeState, actions), cmd));
  return { ...view, cmd };
};

const renderHost = (modeState = screenState(), cmd = vi.fn()) => {
  render(
    <LiveSessionContext.Provider value={context(cmd)}>
      <LaqathaGameplayPanel runtime={runtimeOf(modeState)} actor="shared-screen" />
    </LiveSessionContext.Provider>,
  );
  return { cmd };
};

describe("the clue race on a phone", () => {
  it("has one dominant action and points the player at the screen", () => {
    renderPhone();
    expect(screen.getByTestId("laqatha-claim")).toHaveTextContent("جاوب");
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByTestId("laqatha-claim-cta")).toHaveTextContent(
      "تابعوا الأدلة على الشاشة",
    );
  });

  it("never duplicates the clue ladder", () => {
    renderPhone();
    expect(screen.queryByTestId("laqatha-clues")).toBeNull();
    expect(document.body.textContent).not.toContain(CLUE);
  });

  it("uses the compact frame", () => {
    renderPhone();
    const frame = screen.getByTestId("challenge-frame");
    expect(frame.innerHTML).toContain("px-4");
    expect(frame).toHaveTextContent("الفيلم 1 من 3");
    expect(frame).not.toHaveTextContent("القطها");
  });

  it("claims with the mechanic's exact command", () => {
    const { cmd } = renderPhone();
    fireEvent.click(screen.getByTestId("laqatha-claim"));
    expect(cmd).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "claim-laqatha",
      payload: {},
    });
  });

  it("prevents a double claim from one phone", () => {
    const { cmd } = renderPhone();
    const button = screen.getByTestId("laqatha-claim");
    fireEvent.click(button);
    fireEvent.click(button);
    fireEvent.click(button);
    expect(cmd).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("laqatha-claim")).toHaveTextContent(
      "جارٍ حجز الإجابة…",
    );
  });

  it("gives an eliminated team no claim control at all", () => {
    renderPhone(
      phoneState({
        canClaim: false,
        attemptUsed: true,
        failedTeamIdsJson: JSON.stringify(["team-alpha"]),
      }),
    );
    expect(screen.queryByTestId("laqatha-claim")).toBeNull();
    expect(screen.getByTestId("laqatha-claim-blocked")).toHaveTextContent(
      "انتهت محاولة فريقكم لهذا الفيلم.",
    );
  });

  it("shows the server's own deadline and no clock of its own", () => {
    renderPhone();
    expect(screen.getAllByTestId("challenge-countdown")).toHaveLength(1);
  });
});

describe("losing the race is decided by the server, not the phone", () => {
  it("drops a pending claim the moment the opponent is shown to own it", () => {
    const cmd = vi.fn();
    const { rerender } = renderPhone(phoneState(), undefined, cmd);
    fireEvent.click(screen.getByTestId("laqatha-claim"));
    expect(screen.getByTestId("laqatha-claim")).toHaveTextContent(
      "جارٍ حجز الإجابة…",
    );
    // The opponent got there first.
    rerender(
      phoneTree(
        runtimeOf(
          phoneState({
            phase: "claiming",
            canClaim: false,
            canSubmit: false,
            claimOwnerTeamId: "team-beta",
          }),
        ),
        cmd,
      ),
    );
    // No stale pending, no answer form, and nothing about their typing.
    expect(screen.queryByTestId("laqatha-claim")).toBeNull();
    expect(screen.queryByTestId("laqatha-answer-input")).toBeNull();
    expect(screen.getByTestId("laqatha-answer-locked")).toHaveTextContent(
      "الفريق الثاني يحاول يجاوب",
    );
  });
});

describe("the five-second answer controller", () => {
  const claiming = (over: Record<string, unknown> = {}) =>
    phoneState({
      phase: "claiming",
      canClaim: false,
      canSubmit: true,
      claimOwnerTeamId: "team-alpha",
      deadlineAt: "2026-01-01T00:00:15.000Z",
      ...over,
    });

  it("gives the claiming team a focused field and one CTA", () => {
    renderPhone(claiming());
    const input = screen.getByTestId("laqatha-answer-input");
    expect(input).toHaveFocus();
    expect(input.className).toContain("h-16");
    expect(screen.getByTestId("laqatha-answer")).toHaveTextContent("الإجابة لكم");
  });

  it("submits with the mechanic's exact command", () => {
    const { cmd } = renderPhone(claiming());
    fireEvent.change(screen.getByTestId("laqatha-answer-input"), {
      target: { value: "  الرسالة  " },
    });
    fireEvent.click(screen.getByTestId("laqatha-answer-submit"));
    expect(cmd).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "submit-laqatha",
      payload: { answer: "الرسالة" },
    });
  });

  it("prevents this phone submitting twice, by button or Enter", () => {
    const { cmd } = renderPhone(claiming());
    const input = screen.getByTestId("laqatha-answer-input");
    fireEvent.change(input, { target: { value: "الرسالة" } });
    fireEvent.click(screen.getByTestId("laqatha-answer-submit"));
    fireEvent.keyDown(input, { key: "Enter" });
    expect(cmd).toHaveBeenCalledTimes(1);
  });

  it("takes the countdown from the server's deadline, never from the tap", () => {
    // Deliberately a window that is NOT the contract's nominal five seconds: a
    // phone that started its own 5s clock on the claim would say 5 here. The
    // runtime published three seconds left, so three is what the room's player
    // must see — the display follows the server's deadline, always.
    const cmd = vi.fn();
    const partway = claiming({ deadlineAt: "2026-01-01T00:00:13.000Z" });
    const { rerender } = renderPhone(partway, undefined, cmd);
    const first = screen.getByTestId("challenge-countdown").textContent;
    expect(first).toContain("3");
    expect(first).not.toContain("5");
    // And a rerender does not restart it.
    rerender(phoneTree(runtimeOf(partway), cmd));
    expect(screen.getByTestId("challenge-countdown").textContent).toBe(first);
  });

  it("keeps every player on the claiming team eligible", () => {
    // `canSubmit` is team-level in the projection; there is no answer captain.
    renderPhone(claiming());
    expect(screen.getByTestId("laqatha-answer-input")).toBeInTheDocument();
  });

  it("converges when a teammate's submission resolves the question first", () => {
    const cmd = vi.fn();
    const { rerender } = renderPhone(claiming(), undefined, cmd);
    rerender(
      phoneTree(
        runtimeOf(
          phoneState({
            phase: "resolved",
            canClaim: false,
            canSubmit: false,
            revealJson: JSON.stringify({
              title: MOVIE,
              winnerTeamId: "team-alpha",
              solvedAtClue: 2,
              points: { "team-alpha": 4 },
              failedTeamIds: [],
              clues: [],
            }),
          }),
        ),
        cmd,
      ),
    );
    expect(screen.queryByTestId("laqatha-answer-input")).toBeNull();
  });
});

describe("failure hands the movie back without costing the other team", () => {
  it("eliminates the failing team and returns the other to the clue race", () => {
    const cmd = vi.fn();
    // Alpha claimed and failed; the server resumes revealing for beta.
    const { rerender } = renderPhone(
      phoneState({
        phase: "revealing",
        canClaim: false,
        attemptUsed: true,
        failedTeamIdsJson: JSON.stringify(["team-alpha"]),
        revealedClueCount: 2,
        currentReward: 4,
      }),
      undefined,
      cmd,
    );
    expect(screen.getByTestId("laqatha-claim-blocked")).toHaveTextContent(
      "انتهت محاولة فريقكم",
    );
    expect(screen.queryByTestId("laqatha-claim")).toBeNull();

    // The same runtime as beta's phone sees it: still eligible, and the ladder
    // resumed from the frozen point rather than restarting.
    rerender(
      phoneTree(
        runtimeOf(
          phoneState({
            phase: "revealing",
            canClaim: true,
            attemptUsed: false,
            actorTeamId: "team-beta",
            failedTeamIdsJson: JSON.stringify(["team-alpha"]),
            revealedClueCount: 2,
            currentReward: 4,
          }),
        ),
        cmd,
      ),
    );
    expect(screen.getByTestId("laqatha-claim")).toBeInTheDocument();
    // The opponent's five seconds cost no clue and no reward: both are exactly
    // where the freeze left them, and the phone never recomputes either.
    expect(screen.getByTestId("laqatha-reward")).toHaveTextContent("4");
  });

  it("shows a resolved wait when both teams have failed", () => {
    renderPhone(
      phoneState({
        phase: "resolved",
        canClaim: false,
        canSubmit: false,
        attemptUsed: true,
        failedTeamIdsJson: JSON.stringify(["team-alpha", "team-beta"]),
        revealJson: JSON.stringify({
          title: MOVIE,
          winnerTeamId: null,
          solvedAtClue: null,
          points: {},
          failedTeamIds: ["team-alpha", "team-beta"],
          clues: [],
        }),
      }),
    );
    expect(screen.queryByTestId("laqatha-claim")).toBeNull();
    expect(screen.queryByTestId("laqatha-answer-input")).toBeNull();
    expect(screen.getByTestId("laqatha-reveal")).toHaveTextContent(
      "لم يجب أي فريق",
    );
  });
});

describe("three movies on one mounted phone", () => {
  it("re-arms the claim control for each question without remounting", () => {
    const cmd = vi.fn();
    const { rerender } = renderPhone(phoneState(), undefined, cmd);
    const panelNode = screen.getByTestId("laqatha-panel");

    for (const index of [1, 2]) {
      // Question resolves…
      rerender(
        phoneTree(
          runtimeOf(
            phoneState({
              currentQuestionIndex: index - 1,
              phase: "resolved",
              canClaim: false,
              revealJson: JSON.stringify({
                title: MOVIE,
                winnerTeamId: "team-alpha",
                solvedAtClue: 2,
                points: { "team-alpha": 4 },
                failedTeamIds: [],
                clues: [],
              }),
            }),
          ),
          cmd,
        ),
      );
      // …and the next one opens fresh.
      rerender(
        phoneTree(
          runtimeOf(
            phoneState({
              currentQuestionIndex: index,
              phase: "revealing",
              canClaim: true,
              revealedClueCount: 1,
              currentReward: 5,
            }),
          ),
          cmd,
        ),
      );
      expect(screen.getByTestId("laqatha-claim")).toBeInTheDocument();
      expect(screen.getByTestId("challenge-frame")).toHaveTextContent(
        `الفيلم ${index + 1} من 3`,
      );
      // The same DOM node throughout: nothing under the shell unmounted, so no
      // presentation readiness could have been re-run by a question change.
      expect(screen.getByTestId("laqatha-panel")).toBe(panelNode);
    }
  });
});

describe("privacy: the phone learns nothing the room has not shown", () => {
  it("never carries the movie before it is resolved", () => {
    renderPhone();
    expect(document.body.textContent).not.toContain(MOVIE);
  });

  it("never carries a future clue", () => {
    renderPhone(
      phoneState({
        cluesJson: JSON.stringify([
          { order: 5, value: 1, modality: "text", text: { ar: "دليل مستقبلي" } },
        ]),
      }),
    );
    expect(document.body.textContent).not.toContain("دليل مستقبلي");
  });

  it("never carries the opponent's typed answer", () => {
    renderPhone(
      phoneState({
        phase: "claiming",
        canSubmit: false,
        claimOwnerTeamId: "team-beta",
        opponentAnswer: "إجابة الخصم",
      }),
    );
    expect(document.body.textContent).not.toContain("إجابة الخصم");
  });

  it("gives an eliminated team no extra clue data", () => {
    renderPhone(
      phoneState({
        canClaim: false,
        attemptUsed: true,
        failedTeamIdsJson: JSON.stringify(["team-alpha"]),
      }),
    );
    expect(screen.queryByTestId("laqatha-clues")).toBeNull();
    expect(document.body.textContent).not.toContain(MOVIE);
  });
});

describe("the host is untouched", () => {
  it("keeps the clue ladder, the eyebrow and the reward badge", () => {
    renderHost();
    expect(screen.getByTestId("laqatha-clues")).toHaveTextContent(CLUE);
    expect(screen.getByTestId("challenge-frame")).toHaveTextContent("القطها");
    expect(screen.getByTestId("laqatha-reward").innerHTML).toContain("size-12");
  });

  it("keeps its non-compact frame and offers no phone controls", () => {
    renderHost();
    expect(screen.getByTestId("challenge-frame").innerHTML).toContain("px-5");
    expect(screen.queryByTestId("mobile-action-area")).toBeNull();
    expect(screen.queryByTestId("laqatha-claim")).toBeNull();
  });

  it("still names the claiming team during the answer lock", () => {
    renderHost(
      screenState({ phase: "claiming", claimOwnerTeamId: "team-beta" }),
    );
    expect(screen.getByTestId("laqatha-claimed")).toHaveTextContent(
      "صقور الرياض حجز الإجابة",
    );
  });
});
