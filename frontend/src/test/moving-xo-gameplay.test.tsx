import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MovingXoScreen } from "@/features/live-game-session/components/moving-xo-screen";
import { MOVING_XO_MODE_KEY } from "@/features/live-game-session/match/moving-xo.presentation";
import type { GameplayRuntimeSnapshot } from "@/features/live-game-session/model";

const NOW = Date.parse("2026-10-07T00:00:10.000Z");
const PROMPT = "ما اسم المدينة التي يظهر شعارها؟";
const TEAMS = [
  { id: "team-alpha", name: "أسود الشمال", active: true },
  { id: "team-beta", name: "صقور الرياض", active: true },
];

vi.mock(
  "@/features/live-game-session/hooks/live-session-clock-context",
  () => ({ useLiveSessionClock: () => NOW }),
);

vi.mock("@/features/live-game-session/hooks/live-session-context", () => ({
  useLiveSession: () => ({
    snapshot: {
      sessionId: "session-1",
      serverTimestamp: "2026-10-07T00:00:10.000Z",
      teams: TEAMS,
      participants: [],
    },
    snapshotReceivedAtMs: NOW,
    connection: "connected",
  }),
}));

const board = (cells: Array<string | null>, markOrder = {}) => ({
  cells,
  markOrder,
});

const baseState = (overrides: Record<string, unknown> = {}) => ({
  phase: "answering",
  activeTeamId: "team-alpha",
  board: board(
    ["team-alpha", "team-beta", null, null, null, null, null, null, null],
    { "team-alpha": [0], "team-beta": [1] },
  ),
  successfulMoveCount: 2,
  decisivePhase: false,
  pendingMove: false,
  questionsPresented: 3,
  deadlineAt: "2026-10-07T00:00:22.000Z",
  question: {
    contentItemId: "item-1",
    scopeId: "scope-1",
    answerMode: "match",
    prompt: { ar: PROMPT },
    media: { type: "none", assets: [] },
    acceptedAnswers: ["سر لا يجب عرضه"],
    correctOptionId: "answer-secret",
  },
  ...overrides,
});

const runtime = (
  modeState: Record<string, unknown>,
  revision = 4,
): GameplayRuntimeSnapshot =>
  ({
    runtimeId: "runtime-1",
    sessionId: "session-1",
    revision,
    mode: { key: MOVING_XO_MODE_KEY, version: 1, stateSchemaVersion: 1 },
    status: "round-active",
    availableActions: [],
    activeRound: {
      id: "round-1",
      sequence: 1,
      status: "active",
      modeState,
    },
    modeState,
  }) as unknown as GameplayRuntimeSnapshot;

beforeEach(() => {
  window.HTMLMediaElement.prototype.load = vi.fn();
  window.HTMLMediaElement.prototype.play = vi
    .fn()
    .mockImplementation(() => Promise.resolve());
  window.HTMLMediaElement.prototype.pause = vi.fn();
});

describe("Moving XO shared screen", () => {
  it("keeps the authoritative board in a stable question-pending state", () => {
    render(
      <MovingXoScreen
        runtime={runtime(
          baseState({
            phase: "question-pending",
            deadlineAt: null,
            question: undefined,
          }),
        )}
      />,
    );

    expect(screen.getByTestId("moving-xo-board")).toBeInTheDocument();
    expect(screen.getByTestId("moving-xo-question-pending")).toHaveTextContent(
      "نجهّز اللغز التالي",
    );
    expect(screen.queryByTestId("challenge-countdown")).toBeNull();
    expect(document.body).not.toHaveTextContent(PROMPT);
  });

  it("renders the match puzzle, active team, ownership and server deadline without leaking answer truth", () => {
    render(<MovingXoScreen runtime={runtime(baseState())} />);

    expect(screen.getByTestId("moving-xo-prompt")).toHaveTextContent(PROMPT);
    expect(screen.getByTestId("moving-xo-active-team")).toHaveTextContent(
      "أسود الشمال",
    );
    expect(screen.getByTestId("moving-xo-cell-0")).toHaveAttribute(
      "data-owner",
      "team-alpha",
    );
    expect(screen.getByTestId("moving-xo-cell-1")).toHaveAttribute(
      "data-owner",
      "team-beta",
    );
    expect(screen.getByTestId("challenge-countdown")).toHaveTextContent("12");
    expect(screen.getByTestId("challenge-frame")).toHaveTextContent(
      "2 حركة ناجحة",
    );
    expect(document.body).not.toHaveTextContent("سر لا يجب عرضه");
    expect(document.body).not.toHaveTextContent("answer-secret");
  });

  it("renders projected multiple-choice labels as public puzzle context", () => {
    render(
      <MovingXoScreen
        runtime={runtime(
          baseState({
            question: {
              contentItemId: "item-2",
              scopeId: "scope-1",
              answerMode: "multiple_choice",
              prompt: { ar: "أي خيار صحيح؟" },
              options: [
                { id: "a", label: { ar: "الخيار الأول" } },
                { id: "b", label: { ar: "الخيار الثاني" } },
              ],
            },
          }),
        )}
      />,
    );

    const options = screen.getByTestId("moving-xo-public-options");
    expect(options).toHaveTextContent("الخيار الأول");
    expect(options).toHaveTextContent("الخيار الثاني");
  });

  it("keeps the expiring mark visible, then renders a same-cell refresh only from the next snapshot", () => {
    const placement = baseState({
      phase: "placement",
      deadlineAt: "2026-10-07T00:00:20.000Z",
      question: undefined,
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
    });
    const view = render(<MovingXoScreen runtime={runtime(placement)} />);

    expect(screen.getByTestId("moving-xo-placement-message")).toHaveTextContent(
      "اختاروا مكان الحركة",
    );
    expect(screen.getByTestId("moving-xo-cell-0")).toHaveAttribute(
      "data-owner",
      "team-alpha",
    );
    expect(screen.getByTestId("moving-xo-cell-0")).toHaveAttribute(
      "data-expiring",
      "true",
    );

    view.rerender(
      <MovingXoScreen
        runtime={runtime(
          {
            ...placement,
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
              { "team-alpha": [2, 4, 0], "team-beta": [1, 3] },
            ),
          },
          5,
        )}
      />,
    );
    expect(screen.getByTestId("moving-xo-cell-0")).toHaveAttribute(
      "data-owner",
      "team-alpha",
    );
    expect(screen.getByTestId("moving-xo-cell-0")).toHaveAttribute(
      "data-expiring",
      "false",
    );
    expect(screen.getByTestId("moving-xo-cell-2")).toHaveAttribute(
      "data-expiring",
      "true",
    );
  });

  it("shows الحسم persistently and suppresses FIFO fading", () => {
    render(
      <MovingXoScreen
        runtime={runtime(
          baseState({
            phase: "placement",
            decisivePhase: true,
            question: undefined,
            expiringCell: undefined,
            board: board(
              [
                "team-alpha",
                "team-beta",
                "team-alpha",
                "team-beta",
                "team-alpha",
                "team-beta",
                null,
                null,
                null,
              ],
              { "team-alpha": [0, 2, 4], "team-beta": [1, 3, 5] },
            ),
          }),
        )}
      />,
    );

    expect(screen.getByTestId("moving-xo-decisive")).toHaveTextContent("الحسم");
    expect(document.querySelector("[data-expiring='true']")).toBeNull();
  });

  it("reconstructs authoritative win and draw terminal boards", () => {
    const winState = baseState({
      phase: "completed",
      outcome: "win",
      winningTeamId: "team-alpha",
      deadlineAt: null,
      question: undefined,
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
    });
    const view = render(<MovingXoScreen runtime={runtime(winState)} />);
    expect(screen.getByTestId("moving-xo-win")).toHaveTextContent(
      "فاز أسود الشمال",
    );
    expect(screen.getAllByTestId(/^moving-xo-cell-[0-2]$/)).toHaveLength(3);
    for (const cell of [0, 1, 2]) {
      expect(screen.getByTestId(`moving-xo-cell-${cell}`)).toHaveAttribute(
        "data-winning",
        "true",
      );
    }

    view.rerender(
      <MovingXoScreen
        runtime={runtime(
          baseState({
            phase: "completed",
            outcome: "draw",
            deadlineAt: null,
            question: undefined,
            board: board([
              "team-alpha",
              "team-beta",
              "team-alpha",
              "team-alpha",
              "team-beta",
              "team-beta",
              "team-beta",
              "team-alpha",
              "team-beta",
            ]),
          }),
          6,
        )}
      />,
    );
    expect(screen.getByTestId("moving-xo-draw")).toHaveTextContent("تعادل");
    expect(document.querySelector("[data-winning='true']")).toBeNull();
  });

  it("explains content exhaustion as a neutral terminal state", () => {
    render(
      <MovingXoScreen
        runtime={runtime(
          baseState({
            phase: "completed",
            outcome: "content-exhausted",
            deadlineAt: null,
            question: undefined,
          }),
        )}
      />,
    );
    expect(
      screen.getByTestId("moving-xo-neutral-completion"),
    ).toHaveTextContent(
      "انتهت الألغاز المتاحة لهذا التحدي، وتنتهي الجولة بدون فائز.",
    );
  });
});
