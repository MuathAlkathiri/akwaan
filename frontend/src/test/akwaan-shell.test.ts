import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { resolve } from "path";
import { hasCosmicBackground } from "@/components/layout";
import { MATCH_SETUP_ROUTE } from "@/features/match-setup";

/**
 * The cosmic layer belongs to the Akwaan identity, not to one route.
 *
 * It used to be mounted by the Match page alone, which made the same product look
 * like two: a home and a setup wizard on flat cream, then a Match with depth
 * behind it. It is now mounted once by the shared shell, and these assertions are
 * about *where* — the surfaces it must cover, and the three it must stay off.
 */

const SRC = resolve(process.cwd(), "src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = resolve(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

describe("the cosmic background covers the player-facing Akwaan surfaces", () => {
  it("is on home, Worlds, setup, the Match and every stage inside it", () => {
    for (const path of [
      "/",
      "/worlds/6a6e54159e10fe3b881da006",
      MATCH_SETUP_ROUTE,
      "/matches/6a6a56ee011b008767874299",
    ]) {
      expect(hasCosmicBackground(path), `${path} should carry it`).toBe(true);
    }
  });

  it("stays off admin, the paired phone, and anything else", () => {
    for (const path of [
      "/admin",
      "/admin/worlds",
      "/join/live-session/ABC123",
      "/login",
      "/register",
      "/questions",
    ]) {
      expect(hasCosmicBackground(path), `${path} should not carry it`).toBe(
        false,
      );
    }
  });

  it("is mounted exactly once, by the shell and by nothing else", () => {
    const mounts = walk(SRC).filter((path) => {
      if (!/\.tsx$/.test(path) || /\.(test|spec)\.tsx$/.test(path)) return false;
      if (path.endsWith("components/akwaan/starfield.tsx")) return false;
      return /<Starfield\s*\/>/.test(readFileSync(path, "utf8"));
    });
    expect(mounts.map((path) => path.slice(SRC.length))).toEqual([
      "/components/layout/index.tsx",
    ]);
  });

  it("keeps the motion, pointer and viewport guards that make it free on a phone", () => {
    const source = readFileSync(
      resolve(SRC, "components/akwaan/starfield.tsx"),
      "utf8",
    );
    expect(source).toContain("(prefers-reduced-motion: reduce)");
    expect(source).toContain("(pointer: fine)");
    expect(source).toContain("(min-width: 768px)");
    // A static paint when any guard says no: no requestAnimationFrame loop.
    expect(source).toContain("data-animated");
  });

  it("stays far below the contrast floor, so it can never fight text", () => {
    const source = readFileSync(
      resolve(SRC, "components/akwaan/starfield.tsx"),
      "utf8",
    );
    const maxAlpha = Number(source.match(/MAX_ALPHA = ([\d.]+)/)?.[1]);
    expect(maxAlpha).toBeLessThanOrEqual(0.12);
    const count = Number(source.match(/STAR_COUNT = (\d+)/)?.[1]);
    expect(count).toBeLessThanOrEqual(40);
  });
});
