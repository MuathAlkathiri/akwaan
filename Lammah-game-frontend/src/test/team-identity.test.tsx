import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TeamScoreboard } from "@/components/akwaan/team-score";
import {
  teamIdentities,
  teamIdentityOf,
  TEAM_SLOT_ORDER,
} from "@/lib/team-identity";

/**
 * Team colour is semantic, and this is what makes it so.
 *
 * The rule under test is not "this hue looks nice": it is that a given team gets the
 * *same* slot on every surface, derived from the Match's own team order, so the
 * board, the gameplay, the reveal and a phone cannot disagree about which team is
 * which colour. Teams are named, never coloured, so nothing here asserts a hue.
 *
 * Custom Akwaan behaviour only — nothing here tests a shadcn primitive.
 */
const TEAMS = [
  { id: "team-a", name: "صقور الرياض" },
  { id: "team-b", name: "نجوم جدة" },
];

describe("team identity", () => {
  it("gives the first team slot 1 and the second slot 2, from the server's order", () => {
    expect(teamIdentityOf("team-a", TEAMS).slot).toBe("1");
    expect(teamIdentityOf("team-b", TEAMS).slot).toBe("2");
    expect(TEAM_SLOT_ORDER).toEqual(["1", "2"]);
  });

  it("names no hue, so recolouring a team touches no component", () => {
    // The identity emits token classes only. A hue name here is how a renamed or
    // recoloured team ended up still being called green in the markup.
    const classes = Object.values(teamIdentityOf("team-a", TEAMS)).join(" ");
    for (const hue of ["green", "coral", "emerald", "pink", "violet", "indigo"]) {
      expect(classes).not.toContain(hue);
    }
  });

  it("keeps a team's slot stable however the caller reads the list", () => {
    // Same list, three different call shapes — the slot must not move.
    const viaLookup = teamIdentityOf("team-b", TEAMS).slot;
    const viaMap = teamIdentities(TEAMS).find((team) => team.id === "team-b")!
      .identity.slot;
    const viaCopy = teamIdentityOf("team-b", [...TEAMS]).slot;
    expect(new Set([viaLookup, viaMap, viaCopy]).size).toBe(1);
  });

  it("falls back to a slot rather than blanking on an unknown team", () => {
    // A stale snapshot naming a departed team should still render.
    expect(teamIdentityOf("ghost", TEAMS).slot).toBe("1");
    expect(teamIdentityOf(undefined, TEAMS).slot).toBe("1");
  });

  it("never paints two teams the same slot", () => {
    const slots = teamIdentities(TEAMS).map((team) => team.identity.slot);
    expect(new Set(slots).size).toBe(slots.length);
  });
});

describe("scoreboard", () => {
  const scored = TEAMS.map((team, index) => ({ ...team, score: index + 1 }));

  it("labels each team by its name so a screen can be checked without reading colour", () => {
    render(<TeamScoreboard teams={scored} />);
    expect(screen.getByTestId("team-score-1").textContent).toContain(
      "صقور الرياض",
    );
    expect(screen.getByTestId("team-score-2").textContent).toContain(
      "نجوم جدة",
    );
  });

  it("marks the acting team with more than a colour", () => {
    render(<TeamScoreboard teams={scored} activeTeamId="team-b" />);
    const active = screen.getByTestId("team-score-2");
    // A data flag, a ring, *and* a word: colour is never the only signal.
    expect(active.dataset.active).toBe("true");
    expect(active.textContent).toContain("دورهم الآن");
    expect(screen.getByTestId("team-score-1").dataset.active).toBe("false");
  });

  it("shows the server's totals verbatim", () => {
    render(<TeamScoreboard teams={scored} />);
    expect(screen.getByTestId("team-score-1").textContent).toContain("1");
    expect(screen.getByTestId("team-score-2").textContent).toContain("2");
  });
});
