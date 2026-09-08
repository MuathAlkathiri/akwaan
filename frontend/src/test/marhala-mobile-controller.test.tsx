import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LiveSessionContext } from "@/features/live-game-session/hooks/live-session-context";
import { MarhalaPhonePanel } from "@/features/live-game-session/components/marhala-phone-panel";
import { MobileGameplayShell } from "@/features/live-game-session/match/components/mobile-gameplay-shell";
import { MARHALA_MODE_KEY } from "@/features/live-game-session/match/marhala.presentation";
import type { GameplayRuntimeSnapshot } from "@/features/live-game-session/model";

/**
 * المرحلة on a player's phone — the last mechanic to join the controller system.
 *
 * The board, the routes, the pawns and the Movement Roll all live on the shared
 * screen, and the phone's whole job is a band and a typed answer. So the sharp
 * assertions here are the ones about what the phone must never compute or show:
 * a landing tile, a movement value, or a question the server has not activated.
 */

// The deadline is the server's, so the tests must sit at the server's "now"
// rather than the wall clock — otherwise every fixture deadline is in the past.
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
    mode: { key: MARHALA_MODE_KEY, version: 1, stateSchemaVersion: 1 },
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
  modeState = shared(),
  actions?: string[],
  cmd = vi.fn(),
) => {
  const view = render(tree(runtimeOf(modeState, actions), cmd));
  return { ...view, cmd };
};

describe("the difficulty controller", () => {
  it("offers the three bands with their movement ranges, one tap each", () => {
    renderPhone();
    for (const [band, range] of [
      ["easy", "1–2"],
      ["medium", "2–4"],
      ["hard", "4–6"],
    ]) {
      expect(screen.getByTestId(`marhala-choose-${band}`)).toHaveTextContent(
        range,
      );
    }
  });

  it("chooses with the mechanic's exact command, in one tap", () => {
    const { cmd } = renderPhone();
    fireEvent.click(screen.getByTestId("marhala-choose-hard"));
    expect(cmd).toHaveBeenCalledTimes(1);
    expect(cmd).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "choose-marhala-difficulty",
      payload: { difficulty: "hard" },
    });
  });

  it("cannot choose twice for one turn", () => {
    const { cmd } = renderPhone();
    fireEvent.click(screen.getByTestId("marhala-choose-hard"));
    fireEvent.click(screen.getByTestId("marhala-choose-easy"));
    expect(cmd).toHaveBeenCalledTimes(1);
  });

  it("gives the opposing team no choice controls at all", () => {
    renderPhone(shared({ actorTeamId: "team-beta", isActiveTeam: false }), []);
    expect(screen.queryByTestId("marhala-band-choices")).toBeNull();
    expect(screen.queryByTestId("marhala-choose-hard")).toBeNull();
    expect(screen.getByTestId("marhala-phone")).toHaveTextContent(
      "دور الفريق الآخر",
    );
  });

  it("uses the compact frame and names only this team's own tile", () => {
    renderPhone();
    const frame = screen.getByTestId("challenge-frame");
    expect(frame.innerHTML).toContain("px-4");
    expect(frame).toHaveTextContent("مربّعكم الحالي 5");
  });
});

describe("nothing about the movement is decided or shown here", () => {
  it("never names a landing tile the band could reach", () => {
    // From tile 5, medium (2–4) could land on 7, 8 or 9. None may appear.
    renderPhone();
    const dom = screen.getByTestId("marhala-phone").textContent ?? "";
    for (const tile of ["7", "8", "9"]) {
      expect(dom.includes(`المربّع ${tile}`)).toBe(false);
    }
    expect(document.querySelector("[data-tile-highlighted]")).toBeNull();
  });

  it("never renders the board, its routes or its pawns", () => {
    renderPhone();
    expect(screen.queryByTestId("marhala-board")).toBeNull();
    expect(document.querySelector("[data-route-kind]")).toBeNull();
    expect(document.querySelector("[data-token-position]")).toBeNull();
  });

  it("never reproduces the Movement Roll spectacle", () => {
    renderPhone(
      shared({
        phase: "difficulty-choice",
        lastTurnJson: JSON.stringify({
          turnNumber: 2,
          teamId: "team-alpha",
          difficulty: "medium",
          correct: true,
          resolvedBy: "answer",
          movement: 3,
          baseLanding: 8,
          tile: "boost",
          finalLanding: 13,
        }),
      }),
    );
    expect(screen.queryByTestId("marhala-movement-roll")).toBeNull();
    expect(screen.queryByTestId("marhala-board-centre")).toBeNull();
  });

  it("cannot compute a movement or a landing at all", () => {
    // Stronger than a DOM assertion: the controller may not even hold the tools.
    // A roll, a landing and a tile effect are the server's, and a phone that
    // could derive one could disagree with the board the room is watching.
    const source = readFileSync(
      resolve(
        process.cwd(),
        "src/features/live-game-session/components/marhala-phone-panel.tsx",
      ),
      "utf8",
    );
    expect(source).not.toContain("Math.random");
    expect(source).not.toContain("marhalaTurnFrames");
    expect(source).not.toContain("marhalaPossibleLandings");
    expect(source).not.toContain("marhalaBandValues");
    expect(source).not.toContain("marhalaTileDestination");
  });

  it("never carries a seed or a precomputed movement value", () => {
    renderPhone(
      shared({
        rollSeed: "runtime-1:3:team-alpha:hard",
        nextMovement: 6,
        nextLanding: 11,
      }),
    );
    const dom = document.body.innerHTML;
    expect(dom).not.toContain("runtime-1:3:team-alpha:hard");
    expect(screen.queryByTestId("marhala-phone")?.textContent).not.toContain(
      "11",
    );
  });
});

describe("the prepared question stays inert until the server activates it", () => {
  it("shows only a preparing state, with no question and no input", () => {
    renderPhone(
      shared({
        phase: "question-pending",
        selectedDifficulty: "hard",
        questionPrompt: JSON.stringify({ ar: PROMPT }),
      }),
    );
    expect(screen.getByTestId("marhala-phone-pending")).toHaveTextContent(
      "جارٍ تجهيز السؤال…",
    );
    expect(screen.queryByTestId("marhala-answer-form")).toBeNull();
    expect(document.body.textContent).not.toContain(PROMPT);
  });

  it("shows no countdown while the question is only prepared", () => {
    renderPhone(
      shared({
        phase: "question-pending",
        selectedDifficulty: "hard",
        deadlineAt: "2026-01-01T00:00:40.000Z",
      }),
    );
    expect(screen.queryByTestId("challenge-countdown")).toBeNull();
  });
});

describe("the answer controller", () => {
  it("appears only once the server has activated the question", () => {
    renderPhone(questionState());
    expect(screen.getByTestId("marhala-answer-form")).toBeInTheDocument();
    expect(screen.getByTestId("marhala-phone")).toHaveTextContent(PROMPT);
  });

  it("takes its countdown from the server's deadline", () => {
    // Deliberately not the mechanic's nominal 30 seconds: a phone that started
    // its own clock on activation would say 30 here. The runtime published 17
    // seconds left, so 17 is what the player must see.
    renderPhone(questionState());
    const clock = screen.getByTestId("challenge-countdown");
    expect(clock).toHaveTextContent("17");
    expect(clock).not.toHaveTextContent("30");
    expect(screen.getAllByTestId("challenge-countdown")).toHaveLength(1);
  });

  it("submits with the mechanic's exact command", () => {
    const { cmd } = renderPhone(questionState());
    fireEvent.change(screen.getByLabelText("الإجابة"), {
      target: { value: "  CJ  " },
    });
    fireEvent.click(screen.getByTestId("marhala-answer-submit"));
    expect(cmd).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "submit-marhala-answer",
      payload: { answer: "CJ" },
    });
  });

  it("cannot submit twice, and settles into a deliberate submitted state", () => {
    const { cmd } = renderPhone(questionState());
    fireEvent.change(screen.getByLabelText("الإجابة"), {
      target: { value: "CJ" },
    });
    const form = screen.getByTestId("marhala-answer-form");
    fireEvent.click(screen.getByTestId("marhala-answer-submit"));
    // The form is replaced by the submitted state; submitting the detached node
    // is exactly what a fast second tap would do.
    fireEvent.submit(form);
    expect(cmd).toHaveBeenCalledTimes(1);
    const done = screen.getByTestId("marhala-phone-submitted");
    expect(done).toHaveTextContent("تم إرسال إجابتكم");
    expect(done).toHaveTextContent("تابعوا الحركة على الشاشة");
    expect(screen.queryByTestId("marhala-answer-form")).toBeNull();
  });

  it("keeps the media, because for an image question the picture is the question", () => {
    renderPhone(
      questionState({
        questionPrompt: JSON.stringify({ ar: "من هذه الشخصية؟" }),
        questionMediaJson: JSON.stringify({
          type: "image",
          url: "https://media.akwaan.com/images/tracer.webp",
          altText: "صورة ترايسر",
        }),
      }),
    );
    expect(screen.getByTestId("marhala-question-image")).toBeInTheDocument();
  });

  it("gives the opposing team no answer form", () => {
    renderPhone(
      questionState({ actorTeamId: "team-beta", isActiveTeam: false }),
      [],
    );
    expect(screen.queryByTestId("marhala-answer-form")).toBeNull();
    expect(screen.getByTestId("marhala-phone")).toHaveTextContent(
      "الفريق الآخر يجيب",
    );
  });
});

describe("three recurring questions on one mounted phone", () => {
  it("re-arms the controller each turn without remounting", () => {
    const cmd = vi.fn();
    const { rerender } = renderPhone(shared(), undefined, cmd);
    const shellNode = screen.getByTestId("mobile-shell-main");
    // The controller's own element, not just the shell above it: a per-turn key
    // would replace this node and re-run every effect beneath it.
    const panelNode = screen.getByTestId("marhala-phone");

    for (const turn of [3, 4, 5]) {
      // Choose → prepared → activated → answered, then the next turn opens.
      rerender(tree(runtimeOf(shared({ turnNumber: turn })), cmd));
      expect(screen.getByTestId("marhala-band-choices")).toBeInTheDocument();

      rerender(
        tree(
          runtimeOf(
            shared({ turnNumber: turn, phase: "question-pending" }),
          ),
          cmd,
        ),
      );
      expect(screen.getByTestId("marhala-phone-pending")).toBeInTheDocument();
      expect(screen.queryByTestId("marhala-answer-form")).toBeNull();

      rerender(tree(runtimeOf(questionState({ turnNumber: turn })), cmd));
      expect(screen.getByTestId("marhala-answer-form")).toBeInTheDocument();
      // No answer text survives from the previous question.
      expect(screen.getByLabelText("الإجابة")).toHaveValue("");
      // The same DOM node throughout: nothing under the shell unmounted, so no
      // presentation readiness could have been re-run by a turn change.
      expect(screen.getByTestId("mobile-shell-main")).toBe(shellNode);
      expect(screen.getByTestId("marhala-phone")).toBe(panelNode);
    }
  });

  it("clears a pending submission when the next turn opens", () => {
    const cmd = vi.fn();
    const { rerender } = renderPhone(questionState(), undefined, cmd);
    fireEvent.change(screen.getByLabelText("الإجابة"), {
      target: { value: "CJ" },
    });
    fireEvent.click(screen.getByTestId("marhala-answer-submit"));
    expect(screen.getByTestId("marhala-phone-submitted")).toBeInTheDocument();
    rerender(tree(runtimeOf(shared({ turnNumber: 4 })), cmd));
    expect(screen.getByTestId("marhala-band-choices")).toBeInTheDocument();
    expect(screen.queryByTestId("marhala-phone-submitted")).toBeNull();
  });
});

describe("reconnect adopts server truth", () => {
  it("comes back to the authoritative tile, band, question and deadline", () => {
    // A fresh mount, as a reconnect produces: nothing is restored locally.
    renderPhone(
      questionState({
        positionsJson: JSON.stringify({ "team-alpha": 11, "team-beta": 6 }),
        selectedDifficulty: "hard",
      }),
    );
    expect(screen.getByTestId("challenge-frame")).toHaveTextContent(
      "مربّعكم الحالي 11",
    );
    expect(screen.getByTestId("marhala-phone")).toHaveTextContent(PROMPT);
    expect(screen.getByTestId("challenge-countdown")).toHaveTextContent("17");
    expect(screen.getByLabelText("الإجابة")).toHaveValue("");
  });

  it("does not reveal a prepared question after a reconnect", () => {
    renderPhone(
      shared({
        phase: "question-pending",
        questionPrompt: JSON.stringify({ ar: PROMPT }),
      }),
    );
    expect(document.body.textContent).not.toContain(PROMPT);
  });
});
