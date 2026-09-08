import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LiveSessionContext } from "@/features/live-game-session/hooks/live-session-context";
import { MatchGameplayRenderer } from "@/features/live-game-session/match/match-stage-router";
import { MARHALA_MODE_KEY } from "@/features/live-game-session/match/marhala.presentation";
import type { LiveSessionSnapshot } from "@/features/live-game-session/model";

/**
 * A recurring question must refresh *inside* the stage, not replace it.
 *
 * The stall fix stopped the phone getting stuck, but the transition still tore
 * the whole stage down: board gone, pawns gone, header gone, a preparing screen,
 * then everything rebuilt. On a real device that reads as the app reloading
 * between every question.
 *
 * The server sends no playable content while a generation is prepared — it
 * replaces `modeState` with a bare marker — so the stage has to keep drawing
 * from the last runtime that did carry content. That retained state is what the
 * room was already looking at: no position is invented, no movement is faked,
 * and the prepared question is not in it to leak.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/matches/session-1",
}));

vi.mock(
  "@/features/live-game-session/hooks/live-session-clock-context",
  () => ({
    useLiveSessionClock: () => Date.parse("2026-01-01T00:00:10.000Z"),
  }),
);

const PROMPT = "ما اسم بطل لعبة GTA San Andreas؟";
const TEAMS = [
  { id: "team-alpha", name: "أسود الشمال", active: true },
  { id: "team-beta", name: "صقور الرياض", active: true },
];

const playing = (turn: number) => ({
  phase: "question",
  activeTeamId: "team-alpha",
  teamIdsJson: JSON.stringify(["team-alpha", "team-beta"]),
  positionsJson: JSON.stringify({ "team-alpha": 5, "team-beta": 12 }),
  turnNumber: turn,
  availableDifficultiesJson: JSON.stringify(["easy", "medium", "hard"]),
  movementRangesJson: JSON.stringify({
    easy: { min: 1, max: 2 },
    medium: { min: 2, max: 4 },
    hard: { min: 4, max: 6 },
  }),
  selectedDifficulty: "medium",
  deadlineAt: "2026-01-01T00:00:27.000Z",
  questionPrompt: JSON.stringify({ ar: `${PROMPT} (${turn})` }),
});

const base = (runtimeRevision: number) => ({
  sessionId: "session-1",
  revision: 10 + runtimeRevision,
  serverTimestamp: "2026-01-01T00:00:10.000Z",
  teams: TEAMS,
  participants: [],
  availableActions: [],
});

const active = (runtimeRevision: number, turn: number) =>
  ({
    ...base(runtimeRevision),
    gameplay: {
      runtimeId: "runtime-1",
      sessionId: "session-1",
      revision: runtimeRevision,
      mode: { key: MARHALA_MODE_KEY, version: 1, stateSchemaVersion: 1 },
      status: "round-active",
      availableActions: [],
      activeRound: {
        id: `round-${turn}`,
        sequence: turn,
        status: "active",
        modeState: playing(turn),
      },
      modeState: playing(turn),
      transitions: [],
    },
  }) as unknown as LiveSessionSnapshot;

/** The prepared generation: a marker and nothing else, as the server sends it. */
const preparing = (runtimeRevision: number, generation: number) =>
  ({
    ...base(runtimeRevision),
    gameplay: {
      runtimeId: "runtime-1",
      sessionId: "session-1",
      revision: runtimeRevision,
      mode: { key: MARHALA_MODE_KEY, version: 1, stateSchemaVersion: 1 },
      status: "round-active",
      availableActions: [],
      modeState: { awaitingPresentation: true },
      presentationSurface: { running: true, required: true, generation },
      transitions: [],
    },
  }) as unknown as LiveSessionSnapshot;

describe("المرحلة refreshes the question inside a mounted stage", () => {
  const presentationReady = vi.fn();
  const resync = vi.fn();

  const tree = (snapshot: LiveSessionSnapshot) => (
    <LiveSessionContext.Provider
      value={
        {
          snapshot,
          connection: "connected",
          connectionEpoch: 1,
          presentationReady,
          presentationReadySocket: presentationReady,
          resync,
          sessionId: "session-1",
        } as never
      }
    >
      <MatchGameplayRenderer actor="shared-screen" />
    </LiveSessionContext.Provider>
  );

  beforeEach(() => {
    presentationReady.mockReset().mockResolvedValue(undefined);
    resync.mockReset();
  });

  it("keeps the board, the pawns and the header up across Q1 → Q2 → Q3", () => {
    const view = render(tree(active(7, 1)));

    // The exact DOM nodes, not just "something matching the query". If React
    // unmounts the stage these identities change, which is the whole point.
    const stage = screen.getByTestId("marhala-screen");
    const board = screen.getByTestId("marhala-board");
    expect(screen.getByTestId("marhala-token-team-alpha")).toBeInTheDocument();
    expect(stage).toHaveTextContent(`${PROMPT} (1)`);
    // Present now, so its absence during the gap below means something.
    expect(screen.getByTestId("challenge-countdown")).toBeInTheDocument();

    for (const [revision, generation] of [
      [8, 2],
      [10, 3],
    ] as const) {
      view.rerender(tree(preparing(revision, generation)));

      // The stage survives, and it is the same stage.
      expect(screen.getByTestId("marhala-screen")).toBe(stage);
      expect(screen.getByTestId("marhala-board")).toBe(board);
      // The board still holds the positions the room was looking at.
      expect(screen.getByTestId("marhala-token-team-alpha")).toHaveAttribute(
        "data-token-position",
        "5",
      );
      expect(screen.getByTestId("marhala-token-team-beta")).toHaveAttribute(
        "data-token-position",
        "12",
      );
      // Only the question region changed, and it says nothing about the answer.
      expect(screen.getByTestId("marhala-next-question")).toBeInTheDocument();
      // No global preparing screen and no branded loader mid-match.
      expect(screen.queryByTestId("challenge-preparing")).toBeNull();
      expect(screen.queryByTestId("akwaan-loader")).toBeNull();
      // Nothing answerable survives into the gap: the question that just
      // resolved is gone from the panel, and its clock with it.
      expect(screen.queryByTestId("challenge-countdown")).toBeNull();
      expect(document.body.textContent).not.toContain(
        `${PROMPT} (${generation - 1})`,
      );
      // And the prepared question has not leaked either.
      expect(document.body.textContent).not.toContain(
        `${PROMPT} (${generation})`,
      );

      view.rerender(tree(active(revision + 1, generation)));

      // The next question appears in the same panel, in the same stage.
      expect(screen.getByTestId("marhala-screen")).toBe(stage);
      expect(screen.getByTestId("marhala-board")).toBe(board);
      expect(screen.queryByTestId("marhala-next-question")).toBeNull();
      expect(screen.getByTestId("marhala-screen")).toHaveTextContent(
        `${PROMPT} (${generation})`,
      );
    }
  });

  it("still shows the full preparing screen for a cold open", () => {
    // Nothing on screen yet and nothing retained: a loader is the honest thing,
    // and this is the distinction the recurring path must not erase.
    render(tree(preparing(7, 1)));
    expect(screen.getByTestId("challenge-preparing")).toHaveAttribute(
      "data-preparing",
      "recurring",
    );
    expect(screen.queryByTestId("marhala-screen")).toBeNull();
  });

  it("does not keep a stage belonging to a different challenge", () => {
    // A new runtime is a new challenge. Holding the previous one's board up
    // over it would be showing the room the wrong game.
    const view = render(tree(active(7, 1)));
    expect(screen.getByTestId("marhala-screen")).toBeInTheDocument();

    const other = preparing(8, 2) as unknown as {
      gameplay: { runtimeId: string };
    };
    other.gameplay.runtimeId = "runtime-2";
    view.rerender(tree(other as unknown as LiveSessionSnapshot));

    expect(screen.getByTestId("challenge-preparing")).toBeInTheDocument();
    expect(screen.queryByTestId("marhala-screen")).toBeNull();
  });
});
