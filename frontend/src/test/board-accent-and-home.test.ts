import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

/**
 * Where the active-team accent is allowed to land — and where it isn't.
 *
 * The board carries one thin team-coloured accent, and it belongs to the three
 * World hero images: it answers "whose turn is it to choose from these Worlds".
 * The individual challenge cards were deliberately left neutral — a card is a
 * position, not a team's property, so it must not wear a team's colour. And the
 * Match logo is a real way home: a link to `/` with a spoken label, so a host can
 * always leave without corrupting the live Match through some back-door route.
 */
const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/** A team-identity border accent, in the forms Tailwind writes it. */
const TEAM_BORDER_ACCENT = /\bborder(?:-b)?-team-[12](?:-[a-z-]+)?\b/;

describe("the active-team accent lives on the World heroes only", () => {
  const board = read(
    "src/features/live-game-session/match/components/unified-board.tsx",
  );

  it("draws a thin team-coloured underline on the World hero, keyed to the selecting team", () => {
    // The hero wrapper carries both a fixed 3px bottom border and the team token,
    // chosen from the *selecting* team's identity slot — not hand-written.
    expect(board).toMatch(/border-b-\[3px\]/);
    expect(board).toContain("border-b-team-2-base");
    expect(board).toContain("border-b-team-1-base");
    expect(board).toMatch(/activeIdentity\?\.slot === "2"/);
  });

  it("keeps the challenge cards neutral — no active-team accent on a position", () => {
    const tile = read(
      "src/features/live-game-session/match/components/unified-board-tile.tsx",
    );
    // The card's own shell classes never take a team border. The one place a team
    // colour is allowed is the completed-score pill, which reports who won points —
    // identity, not the card. So we assert the structural shell string is neutral.
    const shellStart = tile.indexOf("const shared = cn(");
    expect(shellStart).toBeGreaterThanOrEqual(0);
    const shellBlock = tile.slice(shellStart, tile.indexOf("const data = {"));
    expect(shellBlock).not.toMatch(TEAM_BORDER_ACCENT);
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
