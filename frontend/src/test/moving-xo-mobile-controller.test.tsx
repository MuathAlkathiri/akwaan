import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MovingXoPhonePanel } from "@/features/live-game-session/components/moving-xo-phone-panel";
import { LiveSessionContext } from "@/features/live-game-session/hooks/live-session-context";
import { MOVING_XO_MODE_KEY } from "@/features/live-game-session/match/moving-xo.presentation";
import type { GameplayRuntimeSnapshot } from "@/features/live-game-session/model";

const NOW = Date.parse("2026-10-07T00:00:10.000Z");
const TEAMS = [
  { id: "team-alpha", name: "أسود الشمال", active: true },
  { id: "team-beta", name: "صقور الرياض", active: true },
];

vi.mock(
  "@/features/live-game-session/hooks/live-session-clock-context",
  () => ({ useLiveSessionClock: () => NOW }),
);

const board = (cells: Array<string | null>, markOrder = {}) => ({
  cells,
  markOrder,
});

const answerState = (overrides: Record<string, unknown> = {}) => ({
  phase: "answering",
  activeTeamId: "team-alpha",
  board: board([
    "team-alpha",
    "team-beta",
    null,
    null,
    null,
    null,
    null,
    null,
    null,
  ]),
  successfulMoveCount: 2,
  decisivePhase: false,
  pendingMove: false,
  questionsPresented: 3,
  deadlineAt: "2026-10-07T00:00:22.000Z",
  question: {
    contentItemId: "item-1",
    scopeId: "scope-1",
    answerMode: "match",
    prompt: { ar: "ما اسم البطل؟" },
    media: { type: "none", assets: [] },
  },
  ...overrides,
});

const placementState = (overrides: Record<string, unknown> = {}) => ({
  ...answerState(),
  phase: "placement",
  question: undefined,
  deadlineAt: "2026-10-07T00:00:20.000Z",
  board: board(
    [
      "team-alpha",
      "team-beta",
      "team-alpha",
      "team-beta",
      "team-alpha",
      null,
      null,
      null,
      null,
    ],
    { "team-alpha": [0, 2, 4], "team-beta": [1, 3] },
  ),
  legalCells: [0, 5, 6, 7, 8],
  expiringCell: 0,
  ...overrides,
});

const runtime = (
  modeState: Record<string, unknown>,
  actions: string[] = [],
  revision = 4,
): GameplayRuntimeSnapshot =>
  ({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    revision,
    mode: { key: MOVING_XO_MODE_KEY, version: 1, stateSchemaVersion: 1 },
    status: "round-active",
    availableActions: actions,
    activeRound: {
      id: "round-1",
      sequence: 1,
      status: "active",
      modeState,
    },
    modeState,
  }) as unknown as GameplayRuntimeSnapshot;

const context = (gameplayCommand: ReturnType<typeof vi.fn>) =>
  ({
    snapshot: {
      sessionId: "session-1",
      revision: 8,
      serverTimestamp: "2026-10-07T00:00:10.000Z",
      teams: TEAMS,
      participants: [],
      availableActions: [],
    },
    snapshotReceivedAtMs: NOW,
    connection: "connected",
    gameplayCommand,
    resync: vi.fn(),
  }) as never;

const tree = (
  value: GameplayRuntimeSnapshot,
  gameplayCommand: ReturnType<typeof vi.fn>,
) => (
  <LiveSessionContext.Provider value={context(gameplayCommand)}>
    <MovingXoPhonePanel runtime={value} />
  </LiveSessionContext.Provider>
);

const renderPhone = (
  state: Record<string, unknown>,
  actions: string[] = [],
  gameplayCommand = vi.fn(),
) => {
  const view = render(tree(runtime(state, actions), gameplayCommand));
  return { ...view, gameplayCommand };
};

beforeEach(() => {
  window.HTMLMediaElement.prototype.load = vi.fn();
  window.HTMLMediaElement.prototype.play = vi
    .fn()
    .mockImplementation(() => Promise.resolve());
  window.HTMLMediaElement.prototype.pause = vi.fn();
});

describe("Moving XO phone answering", () => {
  it("submits a match answer through the generic gameplay command once", () => {
    const { gameplayCommand } = renderPhone(answerState(), [
      "mode:submit-moving-xo-answer",
    ]);

    fireEvent.change(screen.getByRole("textbox", { name: "الإجابة" }), {
      target: { value: "  كارل  " },
    });
    const form = screen.getByTestId("moving-xo-answer-form");
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(gameplayCommand).toHaveBeenCalledTimes(1);
    expect(gameplayCommand).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "submit-moving-xo-answer",
      payload: { answer: "كارل" },
    });
    expect(screen.getByTestId("moving-xo-answer-pending")).toBeInTheDocument();
  });

  it("submits a projected multiple-choice option without deriving correctness", () => {
    const { gameplayCommand } = renderPhone(
      answerState({
        question: {
          contentItemId: "item-2",
          scopeId: "scope-1",
          answerMode: "multiple_choice",
          prompt: { ar: "اختر الإجابة" },
          options: [
            { id: "a", label: { ar: "ألف" } },
            { id: "b", label: { ar: "باء" } },
          ],
          correctOptionId: "b",
        },
      }),
      ["mode:submit-moving-xo-answer"],
    );

    fireEvent.click(screen.getByRole("button", { name: "باء" }));
    expect(gameplayCommand).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "submit-moving-xo-answer",
      payload: { optionId: "b" },
    });
    expect(document.body).not.toHaveTextContent("correctOptionId");
  });

  it("gives an opponent public context but no answer controls", () => {
    renderPhone(answerState(), []);
    expect(screen.getByTestId("moving-xo-phone-waiting")).toHaveTextContent(
      "دور أسود الشمال",
    );
    expect(screen.getByTestId("moving-xo-question")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByTestId("moving-xo-answer-submit")).toBeNull();
  });

  it("reconstructs question-pending and answering directly from snapshots", () => {
    const view = renderPhone(
      answerState({
        phase: "question-pending",
        question: undefined,
        deadlineAt: null,
      }),
    );
    expect(screen.getByTestId("moving-xo-phone-pending")).toBeInTheDocument();
    expect(screen.queryByTestId("challenge-countdown")).toBeNull();

    view.rerender(
      tree(
        runtime(answerState(), ["mode:submit-moving-xo-answer"], 5),
        view.gameplayCommand,
      ),
    );
    expect(
      screen.getByRole("textbox", { name: "الإجابة" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("challenge-countdown")).toHaveTextContent("12");
  });
});

describe("Moving XO phone placement", () => {
  it("transitions from an answer snapshot to authoritative placement controls", () => {
    const command = vi.fn();
    const view = render(
      tree(runtime(answerState(), ["mode:submit-moving-xo-answer"]), command),
    );
    expect(
      screen.getByRole("textbox", { name: "الإجابة" }),
    ).toBeInTheDocument();

    view.rerender(
      tree(
        runtime(placementState(), ["mode:place-moving-xo-mark"], 5),
        command,
      ),
    );
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByTestId("moving-xo-board")).toBeInTheDocument();
  });

  it("makes only projected legal cells tappable, including the expiring same cell", () => {
    const { gameplayCommand } = renderPhone(placementState(), [
      "mode:place-moving-xo-mark",
    ]);

    expect(screen.getByTestId("moving-xo-cell-0")).toBeEnabled();
    expect(screen.getByTestId("moving-xo-cell-0")).toHaveAttribute(
      "data-expiring",
      "true",
    );
    expect(screen.getByTestId("moving-xo-cell-2")).toBeDisabled();
    expect(screen.getByTestId("moving-xo-cell-1")).toBeDisabled();
    expect(screen.getByTestId("moving-xo-cell-5")).toBeEnabled();

    fireEvent.click(screen.getByTestId("moving-xo-cell-0"));
    expect(gameplayCommand).toHaveBeenCalledWith("gameplay-command", {
      roundId: "round-1",
      commandType: "place-moving-xo-mark",
      payload: { cell: 0 },
    });
    expect(
      screen.getByTestId("moving-xo-placement-pending"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("moving-xo-cell-0")).toHaveAttribute(
      "data-owner",
      "team-alpha",
    );
  });

  it("converges after a teammate wins the race without keeping stale pending UI", () => {
    const command = vi.fn();
    const view = render(
      tree(runtime(placementState(), ["mode:place-moving-xo-mark"]), command),
    );
    fireEvent.click(screen.getByTestId("moving-xo-cell-5"));
    expect(
      screen.getByTestId("moving-xo-placement-pending"),
    ).toBeInTheDocument();

    view.rerender(
      tree(
        runtime(
          answerState({
            activeTeamId: "team-beta",
            board: board([
              "team-alpha",
              "team-beta",
              "team-alpha",
              "team-beta",
              "team-alpha",
              null,
              "team-alpha",
              null,
              null,
            ]),
          }),
          [],
          5,
        ),
        command,
      ),
    );
    expect(screen.queryByTestId("moving-xo-placement-pending")).toBeNull();
    expect(screen.getByTestId("moving-xo-phone-waiting")).toHaveTextContent(
      "دور صقور الرياض",
    );
  });

  it("removes placement controls on timeout and never preserves a local mark", () => {
    const command = vi.fn();
    const view = render(
      tree(runtime(placementState(), ["mode:place-moving-xo-mark"]), command),
    );
    const originalOwner = screen.getByTestId("moving-xo-cell-5").dataset.owner;

    view.rerender(
      tree(runtime(answerState({ activeTeamId: "team-beta" }), [], 5), command),
    );
    expect(screen.queryByTestId("moving-xo-board")).toBeNull();
    expect(screen.getByTestId("moving-xo-phone-waiting")).toBeInTheDocument();
    expect(originalOwner).toBe("empty");
    expect(command).not.toHaveBeenCalled();
  });

  it("gives an opponent a static board with no placement buttons", () => {
    renderPhone(
      placementState({ legalCells: undefined, expiringCell: undefined }),
      [],
    );
    expect(screen.getByTestId("moving-xo-phone-waiting")).toBeInTheDocument();
    expect(screen.getByTestId("moving-xo-cell-5").tagName).toBe("DIV");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("reconnects directly into an expiring placement window", () => {
    renderPhone(placementState(), ["mode:place-moving-xo-mark"]);
    expect(screen.getByTestId("moving-xo-cell-0")).toBeEnabled();
    expect(screen.getByTestId("challenge-countdown")).toHaveTextContent("10");
  });
});

describe("Moving XO phone completion", () => {
  it.each([
    ["win", "فاز أسود الشمال"],
    ["draw", "تعادل"],
  ])("reconstructs a completed %s snapshot", (outcome, copy) => {
    renderPhone(
      answerState({
        phase: "completed",
        outcome,
        winningTeamId: outcome === "win" ? "team-alpha" : undefined,
        question: undefined,
        deadlineAt: null,
        board: board([
          "team-alpha",
          "team-alpha",
          "team-alpha",
          "team-beta",
          "team-beta",
          null,
          null,
          null,
          null,
        ]),
      }),
    );
    expect(screen.getByTestId("moving-xo-phone-terminal")).toHaveTextContent(
      copy,
    );
    expect(screen.getByTestId("moving-xo-board")).toBeInTheDocument();
  });

  it("explains neutral content exhaustion", () => {
    renderPhone(
      answerState({
        phase: "completed",
        outcome: "content-exhausted",
        winningTeamId: undefined,
        question: undefined,
        deadlineAt: null,
      }),
    );
    expect(screen.getByTestId("moving-xo-phone-terminal")).toHaveTextContent(
      "انتهت الألغاز المتاحة لهذا التحدي، وتنتهي الجولة بدون فائز.",
    );
  });
});
