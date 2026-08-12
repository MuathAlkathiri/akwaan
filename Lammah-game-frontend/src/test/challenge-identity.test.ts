import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";
import {
  CHALLENGE_FALLBACK_ICON,
  CHALLENGE_ICONS,
  challengeIcon,
} from "@/features/live-game-session/match/challenge-identity";

/**
 * An icon identifies a challenge type. Two types cannot share one.
 *
 * On the shipped board, "فيلم مقلوب" and "معلومات منقوصة" both wore the same gamepad,
 * because both fell through to a shared fallback. A board that is supposed to be
 * readable across a room stops being readable the moment two of its twelve tiles are
 * indistinguishable.
 */
describe("challenge icons", () => {
  it("gives every challenge type its own icon", () => {
    const icons = Object.values(CHALLENGE_ICONS);
    expect(new Set(icons).size).toBe(icons.length);
  });

  it("never reuses the fallback for a known type", () => {
    for (const [key, icon] of Object.entries(CHALLENGE_ICONS)) {
      expect(icon, key).not.toBe(CHALLENGE_FALLBACK_ICON);
      expect(challengeIcon(key)).toBe(icon);
    }
  });

  it("matches a key exactly rather than by substring", () => {
    // `slug.includes("top")` also matched anything else containing it — a rule that
    // starts correct and quietly stops being so as content grows.
    expect(challengeIcon("top-secret")).toBe(CHALLENGE_FALLBACK_ICON);
    expect(challengeIcon("top-5")).toBe(CHALLENGE_ICONS["top-5"]);
  });

  it("falls back rather than blanking a board tile for an unknown mechanic", () => {
    expect(challengeIcon("a-mechanic-shipped-later")).toBe(CHALLENGE_FALLBACK_ICON);
    expect(challengeIcon(undefined)).toBe(CHALLENGE_FALLBACK_ICON);
  });

  it("is the only icon resolver in the codebase", () => {
    // There were two, with different matching rules, which is how the board and the
    // setup review disagreed about what a challenge looked like.
    for (const path of [
      "src/features/live-game-session/match/components/unified-board-tile.tsx",
      "src/features/match-setup/components/match-setup-review.tsx",
    ]) {
      const source = readFileSync(resolve(process.cwd(), path), "utf8");
      expect(source, path).not.toMatch(/function challengeIcon/);
      expect(source, path).toContain("challenge-identity");
    }
  });

  it("covers every mechanic the gameplay router can render", () => {
    // A mechanic that can be played but has no icon lands on the fallback, and the
    // moment a second one does, the collision is back.
    const router = readFileSync(
      resolve(
        process.cwd(),
        "src/features/live-game-session/match/match-stage-router.tsx",
      ),
      "utf8",
    );
    const rendered = [...router.matchAll(/case "([a-z0-9-]+)":/g)].map(
      (match) => match[1],
    );
    expect(rendered.length).toBeGreaterThan(0);
    for (const key of rendered) {
      expect(CHALLENGE_ICONS[key], `${key} has no icon`).toBeDefined();
    }
  });
});
