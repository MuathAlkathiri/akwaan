import { render, screen } from "@testing-library/react";
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

  it("renders exactly the authoritative number of tiles — no decorative extras", () => {
    renderBoard({ "team-alpha": 1, "team-beta": 1 });
    expect(screen.queryByTestId("marhala-tile-0")).toBeNull();
    expect(
      screen.queryByTestId(`marhala-tile-${MARHALA_FINISH_POSITION + 1}`),
    ).toBeNull();
  });

  it("marks each tile's kind, and the start and finish by name", () => {
    renderBoard({ "team-alpha": 1, "team-beta": 1 });
    expect(screen.getByTestId("marhala-tile-3")).toHaveAttribute(
      "data-tile-kind",
      "boost",
    );
    expect(screen.getByTestId("marhala-tile-15")).toHaveAttribute(
      "data-tile-kind",
      "trap",
    );
    expect(screen.getByTestId("marhala-tile-16")).toHaveAttribute(
      "data-tile-kind",
      "finish",
    );
    expect(screen.getByTestId("marhala-tile-1")).toHaveTextContent(
      "نقطة البداية",
    );
    expect(screen.getByTestId("marhala-tile-16")).toHaveTextContent(
      "نقطة النهاية",
    );
  });

  it("renders destination badges only on special source tiles", () => {
    renderBoard({});
    const badges = [
      ...document.querySelectorAll("[data-destination-badge-text]"),
    ];
    expect(badges).toHaveLength(11);
    for (const tile of MARHALA_BOARD) {
      const source = screen.queryByTestId(
        `marhala-source-mark-${tile.position}`,
      );
      if (tile.kind === "boost" || tile.kind === "trap") {
        expect(source).not.toBeNull();
        expect(source).toHaveTextContent(
          `${tile.destination} ${tile.kind === "boost" ? "↑" : "↓"}`,
        );
      } else {
        expect(source).toBeNull();
      }
    }
  });

  it("keeps destination chips off the board so the objects carry the route", () => {
    renderBoard({ "team-alpha": 1, "team-beta": 1 });
    expect(document.querySelector("[data-destination-kind]")).toBeNull();
    expect(screen.getByTestId("marhala-route-3-7")).toHaveAttribute(
      "data-route-object",
      "rocket",
    );
    expect(screen.getByTestId("marhala-route-15-13")).toHaveAttribute(
      "data-route-object",
      "trap",
    );
    for (const tile of MARHALA_BOARD) {
      if (tile.kind !== "boost" && tile.kind !== "trap") continue;
      expect(
        screen.getByTestId(`marhala-source-mark-${tile.position}`),
      ).toHaveAttribute(
        "data-source-direction",
        tile.kind === "boost" ? "forward" : "backward",
      );
    }
  });

  it("distinguishes boost and trap mechanics by silhouette and destination mark", () => {
    renderBoard({});
    for (const route of document.querySelectorAll(
      '[data-route-kind="boost"][data-route-full="true"]',
    )) {
      expect(route).toHaveAttribute("data-route-silhouette", "smooth-launch");
      expect(Number(route.getAttribute("data-route-scale"))).toBeGreaterThan(
        1.6,
      );
      expect(
        route.querySelector('[data-route-destination-marker="landing-star"]'),
      ).not.toBeNull();
      expect(route.querySelector("[data-trap-fragment]")).toBeNull();
      expect(route.querySelectorAll("[data-boost-spark]")).toHaveLength(3);
    }
    for (const route of document.querySelectorAll(
      '[data-route-kind="trap"][data-route-full="true"]',
    )) {
      expect(route).toHaveAttribute("data-route-silhouette", "broken-drop");
      expect(Number(route.getAttribute("data-route-scale"))).toBeGreaterThan(1);
      expect(route.querySelectorAll("[data-trap-fragment]")).toHaveLength(4);
      expect(
        route.querySelector('[data-route-destination-marker="impact-crack"]'),
      ).not.toBeNull();
      expect(
        route.querySelector('[data-trap-rim="broken-floor"]'),
      ).not.toBeNull();
      expect(
        route.querySelector('[data-trap-warning="setback-cross"]'),
      ).not.toBeNull();
    }
  });

  it("puts both tokens on their own authoritative tiles", () => {
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

  it("keeps both tokens visible when they share a tile", () => {
    renderBoard({ "team-alpha": 7, "team-beta": 7 });
    const alpha = screen.getByTestId("marhala-token-team-alpha");
    const beta = screen.getByTestId("marhala-token-team-beta");
    expect(alpha).toBeVisible();
    expect(beta).toBeVisible();
    // Seated apart rather than stacked, so neither hides the other.
    expect(alpha.style.left).not.toBe(beta.style.left);
  });

  it("identifies a team by more than its colour", () => {
    renderBoard({ "team-alpha": 5, "team-beta": 9 });
    const alpha = screen.getByTestId("marhala-token-team-alpha");
    expect(alpha).toHaveTextContent("أ");
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

  it("never renders the tiles a band could reach", () => {
    // The disclosure the Product decision removed has no prop left to carry it.
    renderBoard({ "team-alpha": 5, "team-beta": 1 });
    expect(document.querySelector("[data-tile-highlighted]")).toBeNull();
  });

  it("marks the tile that is reacting to a portal or trap", () => {
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
      "المربّع 3 — انطلاقة إلى المربّع 7",
    );
    expect(screen.getByTestId("marhala-tile-15")).toHaveAttribute(
      "aria-label",
      "المربّع 15 — فخ يرجعكم إلى المربّع 13",
    );
    expect(screen.getByTestId("marhala-tile-16")).toHaveAttribute(
      "aria-label",
      "المربّع 16 — نقطة النهاية",
    );
  });
});

describe("special-tile routes are drawn from the configuration", () => {
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

  it("draws one route per configured portal, to its real destination", () => {
    renderBoard();
    for (const [source, destination] of Object.entries(MARHALA_BOOSTS)) {
      const route = screen.getByTestId(
        `marhala-route-${source}-${destination}`,
      );
      expect(route).toHaveAttribute("data-route-kind", "boost");
      expect(route).toHaveAttribute("data-route-object", "rocket");
      expect(route).toHaveAttribute("data-route-source", source);
      expect(route).toHaveAttribute(
        "data-route-destination",
        String(destination),
      );
    }
  });

  it("draws one route per configured trap, to its real destination", () => {
    renderBoard();
    for (const [source, destination] of Object.entries(MARHALA_TRAPS)) {
      const route = screen.getByTestId(
        `marhala-route-${source}-${destination}`,
      );
      expect(route).toHaveAttribute("data-route-kind", "trap");
      expect(route).toHaveAttribute("data-route-object", "trap");
      expect(route).toHaveAttribute("data-route-source", source);
      expect(route).toHaveAttribute(
        "data-route-destination",
        String(destination),
      );
    }
  });

  it("draws no route that the configuration does not contain", () => {
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

  it("mounts zero full connectors in calm state while keeping source objects", () => {
    renderBoard({});
    expect(document.querySelectorAll('[data-route-full="true"]')).toHaveLength(
      0,
    );
    expect(document.querySelectorAll('[data-route-kind="boost"]')).toHaveLength(
      6,
    );
    expect(document.querySelectorAll('[data-route-kind="trap"]')).toHaveLength(
      5,
    );
  });

  it("mounts exactly one full connector for the active special replay", () => {
    renderBoard({ effect: { position: 3, kind: "boost" } });
    const full = document.querySelectorAll('[data-route-full="true"]');
    expect(full).toHaveLength(1);
    expect(full[0]).toHaveAttribute("data-route-source", "3");
    expect(full[0]).toHaveAttribute("data-route-destination", "7");
    expect(
      document.querySelectorAll(
        '[data-route-kind="trap"][data-route-full="true"]',
      ),
    ).toHaveLength(0);
  });

  it("keeps calm rockets contained and active rockets expanded", () => {
    const calm = renderBoard({});
    const calmRocket = calm.container.querySelector(
      '[data-route-kind="boost"]',
    );
    expect(Number(calmRocket?.getAttribute("data-route-scale"))).toBeLessThan(
      1.3,
    );
    calm.unmount();
    renderBoard({ effect: { position: 3, kind: "boost" } });
    const activeRocket = document.querySelector(
      '[data-route-kind="boost"][data-route-full="true"]',
    );
    expect(
      Number(activeRocket?.getAttribute("data-route-scale")),
    ).toBeGreaterThan(1.6);
  });

  it("mounts exactly one full trap connector for an active trap replay", () => {
    renderBoard({ effect: { position: 6, kind: "trap" } });
    const full = document.querySelectorAll('[data-route-full="true"]');
    expect(full).toHaveLength(1);
    expect(full[0]).toHaveAttribute("data-route-source", "6");
    expect(full[0]).toHaveAttribute("data-route-destination", "2");
  });

  it("follows a board it is handed, not the one it was written against", () => {
    // Destinations deliberately unlike the configured V4 map, so a hardcoded
    // route table would fail here rather than quietly agreeing by coincidence.
    const invented = MARHALA_BOARD.map((tile) => {
      if (tile.position === 2)
        return { ...tile, kind: "boost" as const, destination: 11 };
      if (tile.position === 13)
        return { ...tile, kind: "trap" as const, destination: 4 };
      if (tile.kind === "boost" || tile.kind === "trap")
        return { ...tile, kind: "normal" as const, destination: tile.position };
      return tile;
    });
    renderBoard({ tiles: invented });
    expect(screen.getByTestId("marhala-route-2-11")).toHaveAttribute(
      "data-route-kind",
      "boost",
    );
    expect(screen.getByTestId("marhala-route-13-4")).toHaveAttribute(
      "data-route-kind",
      "trap",
    );
    // The real configuration's routes are absent, because they are not this board.
    expect(screen.queryByTestId("marhala-route-3-7")).toBeNull();
    expect(screen.queryByTestId("marhala-route-15-13")).toBeNull();
    expect(document.querySelectorAll("[data-route-kind]")).toHaveLength(2);
  });

  it("lifts the firing route above the resting ones, and lights its destination", () => {
    renderBoard({ effect: { position: 15, kind: "trap" } });
    expect(screen.getByTestId("marhala-route-15-13")).toHaveAttribute(
      "data-route-prominent",
      "true",
    );
    expect(screen.getByTestId("marhala-route-3-7")).not.toHaveAttribute(
      "data-route-prominent",
    );
    // 13 is where the trap actually sends them, per the configuration.
    expect(screen.getByTestId("marhala-tile-13")).toHaveAttribute(
      "data-tile-destination",
      "trap",
    );
  });

  it("keeps the routes out of the accessibility tree — the tiles carry the meaning", () => {
    renderBoard();
    const svg = document.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });
});

describe("the 4×4 board reads as a board game", () => {
  const renderBoard = (
    extra: Partial<Parameters<typeof MarhalaBoard>[0]> = {},
  ) =>
    render(
      <MarhalaBoard
        teams={TEAMS}
        positions={{ "team-alpha": 5, "team-beta": 1 }}
        activeTeamId="team-alpha"
        {...extra}
      />,
    );

  it("lays sixteen squares out in four rows of four", () => {
    renderBoard();
    const rects = [
      ...document.querySelectorAll("[data-tile-kind] rect"),
    ].filter(
      (node) => node.getAttribute("width") === node.getAttribute("height"),
    );
    // Every tile face is a square, and there are sixteen of them.
    expect(rects.length).toBeGreaterThanOrEqual(MARHALA_FINISH_POSITION);
    for (let position = 1; position <= MARHALA_FINISH_POSITION; position += 1) {
      expect(screen.getByTestId(`marhala-tile-${position}`)).toHaveTextContent(
        String(position),
      );
    }
    expect(screen.queryByTestId("marhala-tile-17")).toBeNull();
  });

  it("runs the path as a serpentine, turning at each row end", () => {
    // 1→4 rightwards along the foot, then 5→8 leftwards above it. That reversal
    // is what keeps 1 → 16 a single unbroken run rather than a jump across.
    const rows = marhalaBoardRows();
    expect(rows.map((row) => row.map((tile) => tile.position))).toEqual([
      [16, 15, 14, 13],
      [9, 10, 11, 12],
      [8, 7, 6, 5],
      [1, 2, 3, 4],
    ]);
  });

  it("anchors a physical rocket or trap object to every special square", () => {
    renderBoard();
    // Colour is never the only signal: each special square carries a mark, so a
    // room reading it from a distance knows the kind before tracing any arc.
    const boost = screen.getByTestId("marhala-tile-3");
    const trap = screen.getByTestId("marhala-tile-15");
    expect(boost).toHaveAttribute("data-tile-kind", "boost");
    expect(trap).toHaveAttribute("data-tile-kind", "trap");
    expect(screen.getByTestId("marhala-route-3-7")).toHaveAttribute(
      "data-route-object",
      "rocket",
    );
    expect(screen.getByTestId("marhala-route-15-13")).toHaveAttribute(
      "data-route-object",
      "trap",
    );
  });

  it("draws every configured route, and only those, on top of the squares", () => {
    renderBoard();
    const drawn = [...document.querySelectorAll("[data-route-kind]")].map(
      (node) => node.getAttribute("data-testid"),
    );
    const configured = [
      ...Object.entries(MARHALA_BOOSTS),
      ...Object.entries(MARHALA_TRAPS),
    ].map(([source, destination]) => `marhala-route-${source}-${destination}`);
    expect(drawn.sort()).toEqual(configured.sort());
    // Three layers, in this order: the squares, then the objects lying across
    // them the way a ladder does on a printed board, then the numerals — so a
    // route can never bury the number of the square it crosses.
    const svg = document.querySelector("svg")!;
    const nodes = [
      ...svg.querySelectorAll(
        "[data-tile-face],[data-route-kind],[data-tile-kind]",
      ),
    ];
    const layer = (node: Element) =>
      node.hasAttribute("data-tile-face")
        ? 0
        : node.hasAttribute("data-route-kind")
          ? 1
          : 2;
    const layers = nodes.map(layer);
    expect(layers).toEqual([...layers].sort((a, b) => a - b));
    expect(new Set(layers)).toEqual(new Set([0, 1, 2]));
  });

  it("gives each route a substantial cased body so crossings stay layered", () => {
    renderBoard();
    // Without a casing painted in the board's own surface colour, eleven routes
    // crossing become a tangle. Every route body must be preceded by one.
    for (const route of document.querySelectorAll(
      '[data-route-kind][data-route-full="true"]',
    )) {
      const paths = [...route.querySelectorAll("path")];
      const casing = paths.findIndex(
        (path) =>
          path.getAttribute("stroke") === "hsl(var(--brand-navy) / 0.88)",
      );
      const body = paths.findIndex((path) =>
        (path.getAttribute("fill") ?? "").startsWith("url(#marhala-trail-"),
      );
      expect(casing).toBeGreaterThanOrEqual(0);
      expect(body).toBeGreaterThan(casing);
    }
  });

  it("still follows a board it is handed rather than a hardcoded map", () => {
    const invented = MARHALA_BOARD.map((tile) => {
      if (tile.position === 2)
        return { ...tile, kind: "boost" as const, destination: 11 };
      if (tile.position === 13)
        return { ...tile, kind: "trap" as const, destination: 4 };
      if (tile.kind === "boost" || tile.kind === "trap")
        return { ...tile, kind: "normal" as const, destination: tile.position };
      return tile;
    });
    renderBoard({ tiles: invented });
    expect(screen.getByTestId("marhala-route-2-11")).toHaveAttribute(
      "data-route-kind",
      "boost",
    );
    expect(screen.getByTestId("marhala-route-13-4")).toHaveAttribute(
      "data-route-kind",
      "trap",
    );
    expect(screen.queryByTestId("marhala-route-3-7")).toBeNull();
    expect(document.querySelectorAll("[data-route-kind]")).toHaveLength(2);
  });

  it("makes every route legible with its physical object and no destination chip", () => {
    renderBoard();
    for (const tile of MARHALA_BOARD) {
      const chip = screen.queryByTestId(`marhala-destination-${tile.position}`);
      expect(chip).toBeNull();
      if (tile.kind === "boost" || tile.kind === "trap") {
        const route = screen.getByTestId(
          `marhala-route-${tile.position}-${tile.destination}`,
        );
        expect(route).toHaveAttribute(
          "data-route-source",
          String(tile.position),
        );
        expect(route).toHaveAttribute(
          "data-route-destination",
          String(tile.destination),
        );
      }
    }
  });

  it("reads object endpoints off the board it is handed, not off a fixed map", () => {
    const invented = MARHALA_BOARD.map((tile) =>
      tile.position === 2
        ? { ...tile, kind: "boost" as const, destination: 11 }
        : tile.kind === "boost" || tile.kind === "trap"
          ? { ...tile, kind: "normal" as const, destination: tile.position }
          : tile,
    );
    renderBoard({ tiles: invented });
    expect(screen.getByTestId("marhala-route-2-11")).toHaveAttribute(
      "data-route-destination",
      "11",
    );
    expect(screen.queryByTestId("marhala-route-3-7")).toBeNull();
    expect(document.querySelectorAll("[data-route-kind]")).toHaveLength(1);
  });

  it("keeps a token off the numeral, and side by side when squares are shared", () => {
    renderBoard({ positions: { "team-alpha": 7, "team-beta": 7 } });
    const alpha = screen.getByTestId("marhala-token-team-alpha");
    const beta = screen.getByTestId("marhala-token-team-beta");
    expect(alpha.style.left).not.toBe(beta.style.left);
    // Seated low in the square; the numeral sits at the top-left.
    expect(parseFloat(alpha.style.top)).toBeGreaterThan(
      parseFloat(alpha.style.left) - 100,
    );
  });

  it("shows the movement overlay only when one is supplied", () => {
    const { unmount } = renderBoard();
    expect(screen.queryByTestId("marhala-board-centre")).toBeNull();
    unmount();
    renderBoard({ centre: <p>+3</p> });
    expect(screen.getByTestId("marhala-board-centre")).toHaveTextContent("+3");
  });
});
