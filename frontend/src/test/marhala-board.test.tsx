import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarhalaBoard } from "@/features/live-game-session/match/components/marhala-board";
import {
  MARHALA_BOARD,
  MARHALA_BOOSTS,
  MARHALA_FINISH_POSITION,
  MARHALA_SAFE_POSITIONS,
  MARHALA_TRAPS,
  marhalaBoardRows,
  marhalaFramePosition,
  marhalaPossibleLandings,
  marhalaTileDestination,
  marhalaTileKind,
  marhalaTurnFrames,
  type MarhalaTurn,
} from "@/features/live-game-session/match/marhala.presentation";

/**
 * The board, the previews and the replay — all of it pure.
 *
 * Everything the room *sees* about a race is derived here, so this is where it can
 * be pinned down without waiting on a clock: one continuous path from 1 to 16, the
 * approved V4 tile identities, the landings a band could reach from a tile, and the
 * order a committed turn is replayed in. None of these functions can produce a roll
 * or resolve a tile — that is the server's, and the tests hold that line too.
 */

const TEAMS = [
  { id: "team-alpha", name: "ألفا" },
  { id: "team-beta", name: "بيتا" },
];

describe("the serpentine path", () => {
  it("has sixteen tiles, numbered once each", () => {
    expect(MARHALA_BOARD).toHaveLength(16);
    expect(MARHALA_BOARD.map((tile) => tile.position)).toEqual(
      Array.from({ length: 16 }, (_unused, index) => index + 1),
    );
  });

  it("snakes: row 1 rightwards, row 2 leftwards, and so on", () => {
    const columns = (row: number) =>
      MARHALA_BOARD.filter((tile) => tile.row === row)
        .sort((left, right) => left.column - right.column)
        .map((tile) => tile.position);
    // Read left to right, the rows alternate direction — which is exactly what
    // makes 1 → 16 one line instead of four disconnected rows.
    expect(columns(1)).toEqual([1, 2, 3, 4]);
    expect(columns(2)).toEqual([8, 7, 6, 5]);
    expect(columns(3)).toEqual([9, 10, 11, 12]);
    expect(columns(4)).toEqual([16, 15, 14, 13]);
  });

  it("never jumps across the board between consecutive tiles", () => {
    // Every step is one column sideways or one row up. A row end that moved
    // sideways as well would read as a teleport during the walk animation.
    for (let position = 1; position < MARHALA_FINISH_POSITION; position += 1) {
      const here = MARHALA_BOARD[position - 1];
      const next = MARHALA_BOARD[position];
      const columnDelta = Math.abs(next.column - here.column);
      const rowDelta = next.row - here.row;
      expect(columnDelta + rowDelta).toBe(1);
      expect(rowDelta === 1 ? columnDelta : rowDelta).toBe(0);
    }
  });

  it("draws the finish row first and the start row last", () => {
    const rows = marhalaBoardRows();
    expect(rows.map((row) => row[0].row)).toEqual([4, 3, 2, 1]);
    expect(rows[0].map((tile) => tile.position)).toEqual([16, 15, 14, 13]);
    expect(rows[3].map((tile) => tile.position)).toEqual([1, 2, 3, 4]);
  });
});

describe("tile identities", () => {
  it("matches the approved V4 boosts", () => {
    expect(MARHALA_BOOSTS).toEqual({
      3: 7,
      5: 7,
      8: 13,
      10: 13,
      12: 16,
      14: 16,
    });
    for (const [from, to] of Object.entries(MARHALA_BOOSTS)) {
      expect(marhalaTileKind(Number(from))).toBe("boost");
      expect(marhalaTileDestination(Number(from))).toBe(to);
    }
  });

  it("matches the approved V4 traps", () => {
    expect(MARHALA_TRAPS).toEqual({ 4: 1, 6: 2, 9: 7, 11: 7, 15: 13 });
    for (const [from, to] of Object.entries(MARHALA_TRAPS)) {
      expect(marhalaTileKind(Number(from))).toBe("trap");
      expect(marhalaTileDestination(Number(from))).toBe(to);
    }
  });

  it("treats 16 as the finish and everything else as plain", () => {
    expect(marhalaTileKind(16)).toBe("finish");
    for (const position of [1, 2, 7, 13]) {
      expect(marhalaTileKind(position)).toBe("normal");
      expect(marhalaTileDestination(position)).toBe(position);
    }
  });

  it("sends every boost and trap to a tile that sends nowhere", () => {
    // This is why no client-side chaining is needed: a destination is always safe.
    for (const destination of [
      ...Object.values(MARHALA_BOOSTS),
      ...Object.values(MARHALA_TRAPS),
    ]) {
      expect(MARHALA_SAFE_POSITIONS).toContain(destination);
      expect(marhalaTileDestination(destination)).toBe(destination);
    }
  });
});

describe("possible landings before a choice", () => {
  it.each([
    ["easy", { min: 1, max: 2 }, [6, 7]],
    ["medium", { min: 2, max: 4 }, [7, 8, 9]],
    ["hard", { min: 4, max: 6 }, [9, 10, 11]],
  ] as const)("from tile 5, %s can reach %j", (_band, range, expected) => {
    expect(marhalaPossibleLandings(5, range)).toEqual(expected);
  });

  it("clamps to the finish rather than inventing tiles past 16", () => {
    // From 13, صعب rolls 4–6 — every one of which is the finish, not 17, 18 or 19.
    expect(marhalaPossibleLandings(13, { min: 4, max: 6 })).toEqual([16]);
    expect(marhalaPossibleLandings(14, { min: 1, max: 2 })).toEqual([15, 16]);
    expect(
      marhalaPossibleLandings(12, { min: 4, max: 6 }).every(
        (position) => position <= MARHALA_FINISH_POSITION,
      ),
    ).toBe(true);
  });

  it("is a range and never a prediction", () => {
    // Three distinct outcomes for متوسط: the helper cannot know which one comes up.
    expect(marhalaPossibleLandings(1, { min: 2, max: 4 })).toHaveLength(3);
  });
});

describe("replaying a committed turn", () => {
  const turn = (overrides: Partial<MarhalaTurn> = {}): MarhalaTurn => ({
    turnNumber: 1,
    teamId: "team-alpha",
    difficulty: "medium",
    correct: true,
    resolvedBy: "answer",
    movement: 3,
    baseLanding: 9,
    tile: "trap",
    finalLanding: 7,
    ...overrides,
  });

  it("walks tile by tile to the base landing", () => {
    const frames = marhalaTurnFrames(
      turn({ baseLanding: 9, tile: "normal", finalLanding: 9 }),
      6,
    );
    expect(frames.map((frame) => frame.kind)).toEqual([
      "reveal",
      "step",
      "step",
      "step",
      "base",
      "settled",
    ]);
    expect(
      frames
        .filter((frame) => frame.kind === "step")
        .map((frame) => (frame as { position: number }).position),
    ).toEqual([7, 8, 9]);
  });

  it("reveals the server's roll and never a number of its own", () => {
    const [first] = marhalaTurnFrames(
      turn({ movement: 5, baseLanding: 11 }),
      6,
    );
    expect(first).toEqual({ kind: "reveal", movement: 5, from: 6 });
  });

  it("fires a trap after the base landing, using the committed destination", () => {
    const frames = marhalaTurnFrames(turn(), 6);
    expect(frames.slice(-3)).toEqual([
      { kind: "base", position: 9, tile: "trap" },
      { kind: "effect", tile: "trap", from: 9, to: 7 },
      { kind: "settled", position: 7 },
    ]);
  });

  it("fires a boost the same way", () => {
    const frames = marhalaTurnFrames(
      turn({ movement: 3, baseLanding: 8, tile: "boost", finalLanding: 13 }),
      5,
    );
    // 5 → 6 → 7 → 8, then the boost to 13. The walk stops at the base landing.
    expect(
      frames
        .filter((frame) => frame.kind === "step")
        .map((frame) => (frame as { position: number }).position),
    ).toEqual([6, 7, 8]);
    expect(frames.slice(-2)).toEqual([
      { kind: "effect", tile: "boost", from: 8, to: 13 },
      { kind: "settled", position: 13 },
    ]);
  });

  it("resolves no tile of its own beyond the one the server reported", () => {
    // 13 is plain, but even if the destination were special the replay stops
    // there: exactly one effect frame, and its target is the committed position.
    const frames = marhalaTurnFrames(
      turn({ movement: 3, baseLanding: 8, tile: "boost", finalLanding: 13 }),
      5,
    );
    expect(frames.filter((frame) => frame.kind === "effect")).toHaveLength(1);
    expect(frames.at(-1)).toEqual({ kind: "settled", position: 13 });
  });

  it("walks to the finish and no further on an overshoot", () => {
    // Rolled 6 from 12: the server clamps the landing to 16, and the replay must
    // not try to walk onto a tile 17 or 18 that the board does not have.
    const frames = marhalaTurnFrames(
      turn({
        movement: 6,
        baseLanding: MARHALA_FINISH_POSITION,
        tile: "finish",
        finalLanding: MARHALA_FINISH_POSITION,
      }),
      12,
    );
    expect(
      frames
        .filter((frame) => frame.kind === "step")
        .map((frame) => (frame as { position: number }).position),
    ).toEqual([13, 14, 15, 16]);
    expect(frames.at(-1)).toEqual({ kind: "settled", position: 16 });
  });

  it("has nothing to replay for a wrong answer or a timeout", () => {
    expect(
      marhalaTurnFrames(
        {
          turnNumber: 2,
          teamId: "team-beta",
          difficulty: "easy",
          correct: false,
          resolvedBy: "answer",
        },
        4,
      ),
    ).toEqual([]);
    expect(
      marhalaTurnFrames(
        {
          turnNumber: 3,
          teamId: "team-beta",
          difficulty: "hard",
          correct: false,
          resolvedBy: "timeout",
        },
        4,
      ),
    ).toEqual([]);
  });

  it("keeps the token on the tile that fired while the effect is announced", () => {
    // The room should hear "trap" before the token leaves 9 — that is the second
    // of understanding what happened.
    expect(
      marhalaFramePosition({ kind: "effect", tile: "trap", from: 9, to: 7 }, 0),
    ).toBe(9);
    expect(marhalaFramePosition({ kind: "settled", position: 7 }, 0)).toBe(7);
  });
});

describe("the board on screen", () => {
  const renderBoard = (
    positions: Record<string, number>,
    extra: Partial<Parameters<typeof MarhalaBoard>[0]> = {},
  ) =>
    render(
      <MarhalaBoard
        teams={TEAMS}
        positions={positions}
        activeTeamId="team-alpha"
        {...extra}
      />,
    );

  it("renders all sixteen tiles with readable numbers", () => {
    renderBoard({ "team-alpha": 1, "team-beta": 1 });
    for (let position = 1; position <= 16; position += 1) {
      expect(screen.getByTestId(`marhala-tile-${position}`)).toHaveTextContent(
        String(position),
      );
    }
  });

  it("marks boosts, traps and the finish, each with words as well as colour", () => {
    renderBoard({ "team-alpha": 1, "team-beta": 1 });
    const boost = screen.getByTestId("marhala-tile-3");
    expect(boost).toHaveAttribute("data-tile-kind", "boost");
    expect(boost).toHaveTextContent("قفزة");
    expect(boost).toHaveTextContent("7");

    const trap = screen.getByTestId("marhala-tile-15");
    expect(trap).toHaveAttribute("data-tile-kind", "trap");
    expect(trap).toHaveTextContent("عطل");
    expect(trap).toHaveTextContent("13");

    const finish = screen.getByTestId("marhala-tile-16");
    expect(finish).toHaveAttribute("data-tile-kind", "finish");
    expect(finish).toHaveTextContent("النهاية");
  });

  it("explains the tile language without asking anyone to memorize icons", () => {
    renderBoard({ "team-alpha": 1, "team-beta": 1 });
    const legend = screen.getByTestId("marhala-board-legend");
    expect(legend).toHaveTextContent("قفزة");
    expect(legend).toHaveTextContent("عطل");
    expect(legend).toHaveTextContent("النهاية");
  });

  it("puts both tokens on the board, on their own tiles", () => {
    renderBoard({ "team-alpha": 5, "team-beta": 9 });
    expect(
      within(screen.getByTestId("marhala-tile-5")).getByTestId(
        "marhala-token-team-alpha",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("marhala-tile-9")).getByTestId(
        "marhala-token-team-beta",
      ),
    ).toBeInTheDocument();
  });

  it("keeps both tokens visible when they share a tile", () => {
    renderBoard({ "team-alpha": 7, "team-beta": 7 });
    const tile = within(screen.getByTestId("marhala-tile-7"));
    expect(tile.getByTestId("marhala-token-team-alpha")).toBeVisible();
    expect(tile.getByTestId("marhala-token-team-beta")).toBeVisible();
  });

  it("keeps a token readable on a hazard tile", () => {
    renderBoard({ "team-alpha": 9, "team-beta": 1 });
    expect(
      within(screen.getByTestId("marhala-tile-9")).getByTestId(
        "marhala-token-team-alpha",
      ),
    ).toBeVisible();
  });

  it("emphasises the active team without hiding the other", () => {
    renderBoard({ "team-alpha": 3, "team-beta": 4 });
    expect(screen.getByTestId("marhala-token-team-alpha")).toHaveAttribute(
      "data-token-active",
      "true",
    );
    expect(screen.getByTestId("marhala-token-team-beta")).toHaveAttribute(
      "data-token-active",
      "false",
    );
    expect(screen.getByTestId("marhala-token-team-beta")).toBeVisible();
  });

  it("highlights the tiles a chosen band could reach", () => {
    renderBoard({ "team-alpha": 5, "team-beta": 1 }, { highlight: [7, 8, 9] });
    for (const position of [7, 8, 9]) {
      expect(screen.getByTestId(`marhala-tile-${position}`)).toHaveAttribute(
        "data-tile-highlighted",
        "true",
      );
    }
    expect(screen.getByTestId("marhala-tile-6")).not.toHaveAttribute(
      "data-tile-highlighted",
    );
  });

  it("marks the tile that is reacting to a boost or trap", () => {
    renderBoard(
      { "team-alpha": 9, "team-beta": 1 },
      { effect: { position: 9, kind: "trap" } },
    );
    expect(screen.getByTestId("marhala-tile-9")).toHaveAttribute(
      "data-tile-reacting",
      "trap",
    );
  });

  it("names each tile's role for a screen reader", () => {
    renderBoard({ "team-alpha": 1, "team-beta": 1 });
    expect(screen.getByTestId("marhala-tile-3")).toHaveAttribute(
      "aria-label",
      "المربّع 3 — قفزة إلى 7",
    );
    expect(screen.getByTestId("marhala-tile-15")).toHaveAttribute(
      "aria-label",
      "المربّع 15 — عطل يرجعك إلى 13",
    );
    expect(screen.getByTestId("marhala-tile-16")).toHaveAttribute(
      "aria-label",
      "المربّع 16 — النهاية",
    );
  });
});
