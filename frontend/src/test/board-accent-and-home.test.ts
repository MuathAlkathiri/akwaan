import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

/**
 * Where the active-team accent is allowed to land — and where it isn't.
 *
 * The board says whose turn it is once, in a heading above the three orbits,
 * in that team's own colour. A challenge circle is a position, not a team's
 * property, so it may only take a team's colour once that team has *won* it —
 * never because they happen to be choosing right now. And the Match logo is a
 * real way home: a link to `/` with a spoken label, so a host can always leave
 * without corrupting the live Match through some back-door route.
 */
const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("the active-team accent lives on the turn heading only", () => {
  const board = read(
    "src/features/live-game-session/match/components/unified-board.tsx",
  );

  it("colours the turn heading from the selecting team's own identity", () => {
    // The dot is the identity token, chosen from the selecting team's slot —
    // never a hand-written colour.
    expect(board).toContain("selecting-team-board");
    expect(board).toMatch(/activeIdentity\?\.dot/);
    expect(board).toMatch(/teamIdentityOf\(\s*unified\.selectingTeamId/);
  });

  it("gives a challenge circle a team colour only once that team has won it", () => {
    const tile = read(
      "src/features/live-game-session/match/components/unified-board-orbit-tile.tsx",
    );
    const circleStart = tile.indexOf("const circle = cn(");
    expect(circleStart).toBeGreaterThanOrEqual(0);
    const circleBlock = tile.slice(circleStart, tile.indexOf("const state ="));
    // The only identity the circle may wear is the winner's.
    expect(circleBlock).toContain("owner.solid");
    expect(circleBlock).not.toContain("activeIdentity");
    expect(circleBlock).not.toContain("selectingTeamId");
  });
});

describe("the Match logo is a safe way home", () => {
  it("makes the match-variant logo a labelled link to the home route", () => {
    const header = read("src/components/layout/header.tsx");
    // The Match header is its own compact bar; its logo is a Link to `/` carrying
    // a spoken label, so the logo is both reachable and announced.
    expect(header).toMatch(/function MatchHeaderBar/);
    expect(header).toMatch(/variant === "match"/);
    expect(header).toMatch(/href="\/"/);
    expect(header).toContain("العودة للرئيسية");
  });
});
