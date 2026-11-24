import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarhalaBoard } from "@/features/live-game-session/match/components/marhala-board";
import {
  MARHALA_BOARD,
  MARHALA_BOOSTS,
  MARHALA_CHECKPOINTS,
  MARHALA_FINISH_POSITION,
  MARHALA_SAFE_POSITIONS,
  MARHALA_TRAPS,
  marhalaBoardRows,
  marhalaFramePosition,
  marhalaLastCheckpoint,
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
 * approved tile identities, the landings a band could reach from a tile, and the
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
  it("matches the approved ladders", () => {
    expect(MARHALA_BOOSTS).toEqual({ 3: 7, 11: 15 });
    for (const [from, to] of Object.entries(MARHALA_BOOSTS)) {
      expect(marhalaTileKind(Number(from))).toBe("boost");
      expect(marhalaTileDestination(Number(from))).toBe(to);
    }
  });

  it("matches the approved slides", () => {
    expect(MARHALA_TRAPS).toEqual({ 10: 6, 14: 12 });
    for (const [from, to] of Object.entries(MARHALA_TRAPS)) {
      expect(marhalaTileKind(Number(from))).toBe("trap");
      expect(marhalaTileDestination(Number(from))).toBe(to);
    }
  });

  it("treats 16 as the finish and everything else as plain", () => {
    expect(marhalaTileKind(16)).toBe("finish");
    for (const position of [1, 2, 6, 7, 9, 12, 15]) {
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

  it("makes every slide's foot a checkpoint, and falls back to the start", () => {
    expect(MARHALA_CHECKPOINTS).toEqual([6, 12]);
    expect(marhalaLastCheckpoint(5)).toBe(1);
    expect(marhalaLastCheckpoint(6)).toBe(6);
    expect(marhalaLastCheckpoint(11)).toBe(6);
    expect(marhalaLastCheckpoint(15)).toBe(12);
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
    // The answer beat leads every replay: the room is told what the answer was
    // before anything moves.
    expect(frames.map((frame) => frame.kind)).toEqual([
      "answer",
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
    // The roll beat is the second one now: the first says what the answer was.
    const [, roll] = marhalaTurnFrames(
      turn({ movement: 5, baseLanding: 11 }),
      6,
    );
    expect(roll).toEqual({ kind: "reveal", movement: 5, from: 6 });
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

  it("replays only the answer for a wrong answer or a timeout", () => {
    // Nothing moved, so there is no journey to show — but the turn still
    // resolved, and a resolution the room is never told about is invisible.
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
      ).map((frame) => frame.kind),
    ).toEqual(["answer"]);
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
      ).map((frame) => frame.kind),
    ).toEqual(["answer"]);
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

  it("renders all sixteen stations, each one named by its number", () => {
    renderBoard({ "team-alpha": 1, "team-beta": 1 });
    for (let position = 1; position <= 16; position += 1) {
      expect(screen.getByTestId(`marhala-tile-${position}`)).toHaveTextContent(
        String(position),
      );
    }
  });

  it("renders exactly the authoritative number of stations — no decorative extras", () => {
    renderBoard({ "team-alpha": 1, "team-beta": 1 });
    expect(screen.queryByTestId("marhala-tile-0")).toBeNull();
    expect(
      screen.queryByTestId(`marhala-tile-${MARHALA_FINISH_POSITION + 1}`),
    ).toBeNull();
  });

  it("marks each station's kind and says its role in a word", () => {
    renderBoard({ "team-alpha": 1, "team-beta": 1 });
    const role = (position: number) =>
      screen.getByTestId(`marhala-tile-${position}`);
    expect(role(3)).toHaveAttribute("data-tile-kind", "boost");
    expect(role(3)).toHaveTextContent("قفزة");
    expect(role(10)).toHaveAttribute("data-tile-kind", "trap");
    expect(role(10)).toHaveTextContent("فخ");
    expect(role(16)).toHaveAttribute("data-tile-kind", "finish");
    expect(role(16)).toHaveTextContent("النهاية");
    expect(role(1)).toHaveTextContent("البداية");
    // A slide's foot is a checkpoint, and is labelled as one.
    expect(role(6)).toHaveAttribute("data-tile-role", "checkpoint");
    expect(role(6)).toHaveTextContent("نقطة حفظ");
    expect(role(12)).toHaveAttribute("data-tile-role", "checkpoint");
    expect(role(2)).toHaveAttribute("data-tile-role", "plain");
  });

  it("writes where every connection leads, beside the connection", () => {
    renderBoard({});
    expect(screen.getByTestId("marhala-route-label-3")).toHaveTextContent(
      "يطلّعك لـ 7",
    );
    expect(screen.getByTestId("marhala-route-label-11")).toHaveTextContent(
      "يطلّعك لـ 15",
    );
    expect(screen.getByTestId("marhala-route-label-10")).toHaveTextContent(
      "ينزّلك لـ 6",
    );
    expect(screen.getByTestId("marhala-route-label-14")).toHaveTextContent(
      "ينزّلك لـ 12",
    );
  });

  it("tells a ladder from a slide by shape, not by colour", () => {
    renderBoard({});
    const ladder = screen.getByTestId("marhala-route-3-7");
    expect(ladder).toHaveAttribute("data-route-object", "ladder");
    expect(ladder.querySelectorAll("[data-ladder-rung]").length).toBeGreaterThan(
      3,
    );
    expect(ladder.querySelector("[data-slide-arrow]")).toBeNull();
    const slide = screen.getByTestId("marhala-route-10-6");
    expect(slide).toHaveAttribute("data-route-object", "slide");
    expect(slide.querySelector("[data-slide-arrow]")).not.toBeNull();
    expect(slide.querySelector("[data-ladder-rung]")).toBeNull();
  });

  it("uses no red on the board: red means a wrong answer and nothing else", () => {
    renderBoard({ "team-alpha": 10, "team-beta": 1 });
    const html = screen.getByTestId("marhala-board").innerHTML;
    expect(html).not.toContain("destructive");
    expect(html).not.toMatch(/#E1474C|#B81E23/i);
  });

  it("puts both tokens on their own authoritative stations", () => {
    renderBoard({ "team-alpha": 5, "team-beta": 9 });
    expect(screen.getByTestId("marhala-token-team-alpha")).toHaveAttribute(
      "data-token-position",
      "5",
    );
    expect(screen.getByTestId("marhala-token-team-beta")).toHaveAttribute(
      "data-token-position",
      "9",
    );
  });

  it("keeps both tokens visible when they share a station", () => {
    renderBoard({ "team-alpha": 7, "team-beta": 7 });
    const alpha = screen.getByTestId("marhala-token-team-alpha");
    const beta = screen.getByTestId("marhala-token-team-beta");
    expect(alpha).toBeVisible();
    expect(beta).toBeVisible();
    // Seated apart rather than stacked, so neither hides the other.
    expect(alpha.style.left).not.toBe(beta.style.left);
  });

  it("identifies a team by its name, not by its colour alone", () => {
    renderBoard({ "team-alpha": 5, "team-beta": 9 });
    const alpha = screen.getByTestId("marhala-token-team-alpha");
    expect(alpha).toHaveTextContent("ألفا");
    expect(alpha.getAttribute("aria-label")).toContain("ألفا");
    expect(alpha.getAttribute("aria-label")).toContain("5");
  });

  it("emphasises the active team without hiding the other", () => {
    renderBoard({ "team-alpha": 5, "team-beta": 9 });
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

  it("never renders the stations a band could reach", () => {
    // The disclosure the Product decision removed has no prop left to carry it.
    renderBoard({ "team-alpha": 5, "team-beta": 1 });
    expect(document.querySelector("[data-tile-highlighted]")).toBeNull();
  });

  it("marks the station that is reacting, and the connection that fired", () => {
    renderBoard(
      { "team-alpha": 10, "team-beta": 1 },
      { effect: { position: 10, kind: "trap" } },
    );
    expect(screen.getByTestId("marhala-tile-10")).toHaveAttribute(
      "data-tile-reacting",
      "trap",
    );
    expect(screen.getByTestId("marhala-route-10-6")).toHaveAttribute(
      "data-route-active",
      "true",
    );
    expect(screen.getByTestId("marhala-route-3-7")).toHaveAttribute(
      "data-route-active",
      "false",
    );
  });

  it("names each station's role for a screen reader", () => {
    renderBoard({ "team-alpha": 1, "team-beta": 1 });
    expect(screen.getByTestId("marhala-tile-3")).toHaveAttribute(
      "aria-label",
      "المحطة 3 — قفزة تطلّعكم للمحطة 7",
    );
    expect(screen.getByTestId("marhala-tile-14")).toHaveAttribute(
      "aria-label",
      "المحطة 14 — فخ ينزّلكم للمحطة 12",
    );
    expect(screen.getByTestId("marhala-tile-16")).toHaveAttribute(
      "aria-label",
      "المحطة 16 — النهاية",
    );
  });
});

describe("connections are drawn from the configuration", () => {
  const renderBoard = (
    extra: Partial<Parameters<typeof MarhalaBoard>[0]> = {},
  ) =>
    render(
      <MarhalaBoard
        teams={TEAMS}
        positions={{ "team-alpha": 1, "team-beta": 1 }}
        activeTeamId="team-alpha"
        {...extra}
      />,
    );

  it("draws one ladder per configured boost, to its real destination", () => {
    renderBoard();
    for (const [source, destination] of Object.entries(MARHALA_BOOSTS)) {
      const route = screen.getByTestId(
        `marhala-route-${source}-${destination}`,
      );
      expect(route).toHaveAttribute("data-route-kind", "boost");
      expect(route).toHaveAttribute("data-route-source", source);
      expect(route).toHaveAttribute(
        "data-route-destination",
        String(destination),
      );
    }
  });

  it("draws one slide per configured trap, to its real destination", () => {
    renderBoard();
    for (const [source, destination] of Object.entries(MARHALA_TRAPS)) {
      const route = screen.getByTestId(
        `marhala-route-${source}-${destination}`,
      );
      expect(route).toHaveAttribute("data-route-kind", "trap");
      expect(route).toHaveAttribute("data-route-source", source);
      expect(route).toHaveAttribute(
        "data-route-destination",
        String(destination),
      );
    }
  });

  it("draws no connection that the configuration does not contain", () => {
    renderBoard();
    const drawn = [...document.querySelectorAll("[data-route-kind]")].map(
      (node) => node.getAttribute("data-testid"),
    );
    const configured = [
      ...Object.entries(MARHALA_BOOSTS),
      ...Object.entries(MARHALA_TRAPS),
    ].map(([source, destination]) => `marhala-route-${source}-${destination}`);
    expect(drawn.sort()).toEqual(configured.sort());
  });

  it("follows a board it is handed, not the one it was written against", () => {
    // Move a ladder and a slide: the drawing and the checkpoint label follow.
    const tiles = MARHALA_BOARD.map((tile) =>
      tile.position === 3
        ? { ...tile, kind: "normal" as const, destination: 3 }
        : tile.position === 2
          ? { ...tile, kind: "boost" as const, destination: 6 }
          : tile.position === 10
            ? { ...tile, kind: "trap" as const, destination: 7 }
            : tile,
    );
    renderBoard({ tiles });
    expect(screen.queryByTestId("marhala-route-3-7")).toBeNull();
    expect(screen.getByTestId("marhala-route-2-6")).toBeInTheDocument();
    expect(screen.getByTestId("marhala-route-10-7")).toBeInTheDocument();
    expect(screen.getByTestId("marhala-tile-7")).toHaveAttribute(
      "data-tile-role",
      "checkpoint",
    );
    expect(screen.getByTestId("marhala-tile-6")).toHaveAttribute(
      "data-tile-role",
      "plain",
    );
  });

  it("keeps the connections out of the accessibility tree — the stations carry the meaning", () => {
    renderBoard();
    for (const route of document.querySelectorAll("[data-route-kind]")) {
      expect(route).toHaveAttribute("aria-hidden", "true");
    }
  });
});

describe("the board keeps the approved layout", () => {
  it("joins only stations in neighbouring rows, so nothing is passed over", () => {
    // The rule the drawing was approved on: a connection runs diagonally
    // between two rows and never over a third station.
    const at = (position: number) =>
      MARHALA_BOARD.find((tile) => tile.position === position)!;
    for (const [source, destination] of [
      ...Object.entries(MARHALA_BOOSTS),
      ...Object.entries(MARHALA_TRAPS),
    ]) {
      const from = at(Number(source));
      const to = at(destination);
      expect(Math.abs(from.row - to.row)).toBe(1);
      expect(Math.abs(from.column - to.column)).toBe(1);
    }
  });

  it("starts the race on the right, where an Arabic line starts", () => {
    render(
      <MarhalaBoard
        teams={TEAMS}
        positions={{ "team-alpha": 1, "team-beta": 4 }}
        activeTeamId="team-alpha"
      />,
    );
    const left = (id: string) =>
      Number.parseFloat(screen.getByTestId(`marhala-token-${id}`).style.left);
    expect(left("team-alpha")).toBeGreaterThan(left("team-beta"));
  });
});
