import { readFileSync } from "fs";
import { resolve } from "path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  PLAYER_CHARACTERS,
  PLAYER_CHARACTER_KEYS,
  PlayerCharacterIcon,
} from "@/features/live-game-session/components/player-characters";

/**
 * The characters, and the two things that make them work.
 *
 * The server hands them out and refuses duplicates, so the drawing set and the
 * server's list have to be the same list — a key the server can assign and this
 * module cannot draw renders a player as nothing at all.
 */
const serverKeys = () => {
  const source = readFileSync(
    resolve(
      process.cwd(),
      "../backend/src/modules/live-game-sessions/domain/player-avatars.ts",
    ),
    "utf8",
  );
  const block = source.match(
    /PLAYER_AVATAR_KEYS = \[([\s\S]*?)\] as const;/,
  )?.[1];
  expect(block, "the server's key list moved").toBeTruthy();
  return [...block!.matchAll(/'([a-z-]+)'/g)].map((match) => match[1]);
};

describe("player characters", () => {
  it("draws exactly the characters the server can hand out", () => {
    expect(PLAYER_CHARACTER_KEYS).toEqual(serverKeys());
  });

  it("gives every character a label and a colour of its own", () => {
    for (const key of PLAYER_CHARACTER_KEYS) {
      expect(PLAYER_CHARACTERS[key].label.trim()).not.toHaveLength(0);
      expect(PLAYER_CHARACTERS[key].fill).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });

  it("wears neither team's colour, so a column never lies about its team", () => {
    // Blue and red belong to the teams. A red character sitting in the blue
    // column would make the one thing the colour is for ambiguous.
    const teamish = /^#(1F5BFF|EF3441)$/i;
    for (const key of PLAYER_CHARACTER_KEYS) {
      expect(PLAYER_CHARACTERS[key].fill).not.toMatch(teamish);
    }
  });

  it("renders at the size asked for, and says which character it is", () => {
    render(<PlayerCharacterIcon characterKey="comet" size={40} title="مذنّب" />);
    const icon = screen.getByRole("img", { name: "مذنّب" });
    expect(icon.getAttribute("width")).toBe("40");
    expect(icon.getAttribute("data-character")).toBe("comet");
  });

  it("is decoration when it sits beside the name it would repeat", () => {
    const { container } = render(
      <PlayerCharacterIcon characterKey="star" size={32} />,
    );
    const icon = container.querySelector("svg")!;
    expect(icon.getAttribute("aria-hidden")).toBe("true");
    expect(icon.getAttribute("role")).toBeNull();
  });

  it("renders nothing for a character it cannot draw", () => {
    // A session from a future release could name one this build has never seen.
    // Nothing is better than a broken glyph in the middle of a team column.
    const { container } = render(<PlayerCharacterIcon characterKey="wizard" />);
    expect(container.querySelector("svg")).toBeNull();
    expect(
      render(<PlayerCharacterIcon characterKey={undefined} />).container
        .querySelector("svg"),
    ).toBeNull();
  });
});
