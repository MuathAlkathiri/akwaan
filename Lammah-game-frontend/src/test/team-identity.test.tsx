import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TeamScoreboard } from "@/components/akwaan/team-score";
import {
  teamIdentities,
  teamIdentityOf,
  TEAM_TONE_ORDER,
} from "@/lib/team-identity";

/**
 * Team colour is semantic, and this is what makes it so.
 *
 * The rule under test is not "green looks nice": it is that a given team gets the
 * *same* tone on every surface, derived from the Match's own team order, so the
 * board, the gameplay, the reveal and a phone cannot disagree about who is green.
 *
 * Custom Akwaan behaviour only — nothing here tests a shadcn primitive.
 */
const TEAMS = [
  { id: "team-a", name: "البنفسجي" },
  { id: "team-b", name: "الأخضر" },
];

describe("team identity", () => {
  it("gives the first team green and the second coral, from the server's order", () => {
    expect(teamIdentityOf("team-a", TEAMS).tone).toBe("green");
    expect(teamIdentityOf("team-b", TEAMS).tone).toBe("coral");
    expect(TEAM_TONE_ORDER).toEqual(["green", "coral"]);
  });

  it("keeps a team's tone stable however the caller reads the list", () => {
    // Same list, three different call shapes — the tone must not move.
    const viaLookup = teamIdentityOf("team-b", TEAMS).tone;
    const viaMap = teamIdentities(TEAMS).find((team) => team.id === "team-b")!
      .identity.tone;
    const viaCopy = teamIdentityOf("team-b", [...TEAMS]).tone;
    expect(new Set([viaLookup, viaMap, viaCopy]).size).toBe(1);
  });

  it("falls back to a tone rather than blanking on an unknown team", () => {
    // A stale snapshot naming a departed team should still render.
    expect(teamIdentityOf("ghost", TEAMS).tone).toBe("green");
    expect(teamIdentityOf(undefined, TEAMS).tone).toBe("green");
  });

  it("never paints two teams the same tone", () => {
    const tones = teamIdentities(TEAMS).map((team) => team.identity.tone);
    expect(new Set(tones).size).toBe(tones.length);
  });
});

describe("scoreboard", () => {
  const scored = TEAMS.map((team, index) => ({ ...team, score: index + 1 }));

  it("labels each team by tone so a screen can be checked without reading colour", () => {
    render(<TeamScoreboard teams={scored} />);
    expect(screen.getByTestId("team-score-green").textContent).toContain(
      "البنفسجي",
    );
    expect(screen.getByTestId("team-score-coral").textContent).toContain(
      "الأخضر",
    );
  });

  it("marks the acting team with more than a colour", () => {
    render(<TeamScoreboard teams={scored} activeTeamId="team-b" />);
    const active = screen.getByTestId("team-score-coral");
    // A data flag, a ring, *and* a word: colour is never the only signal.
    expect(active.dataset.active).toBe("true");
    expect(active.textContent).toContain("دورهم الآن");
    expect(screen.getByTestId("team-score-green").dataset.active).toBe("false");
  });

  it("shows the server's totals verbatim", () => {
    render(<TeamScoreboard teams={scored} />);
    expect(screen.getByTestId("team-score-green").textContent).toContain("1");
    expect(screen.getByTestId("team-score-coral").textContent).toContain("2");
  });
});
