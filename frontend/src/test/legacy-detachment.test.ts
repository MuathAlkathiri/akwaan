import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { resolve } from "path";
import { isJourneyPath, isMatchPath } from "@/components/layout";
import { MATCH_SETUP_ROUTE } from "@/features/match-setup";

/**
 * The classic game is preserved, but it is not part of the application.
 *
 * Deleting the old board was never the goal — it may come back as an independent
 * Classic mode. What must not survive is a *path* into it: a route file under
 * `app/`, a nav item, a post-login redirect, or an import that drags the purple
 * board into the current bundle. Each of those is how a retired product quietly
 * stays shipped.
 *
 * This reads the real source tree rather than mocking a router, because the thing
 * being asserted is a property of the repository: in Next.js a route exists
 * because a file exists, so a file is what has to be checked.
 */

const SRC = resolve(process.cwd(), "src");
const APP = resolve(SRC, "app");
const LEGACY = resolve(SRC, "legacy/classic-game");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = resolve(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** Every source file the application ships, excluding the preserved legacy area. */
function activeSources(): string[] {
  return walk(SRC).filter(
    (path) =>
      /\.(ts|tsx)$/.test(path) &&
      !path.startsWith(LEGACY) &&
      !path.includes("/test/") &&
      !/\.(test|spec)\.tsx?$/.test(path),
  );
}

describe("the classic game is detached from the routable application", () => {
  it("has no route file that could serve /games", () => {
    const routes = walk(APP).filter((path) => /\/page\.tsx$/.test(path));
    const gameRoutes = routes.filter((path) =>
      path.slice(APP.length).startsWith("/games"),
    );
    expect(
      gameRoutes,
      "a page.tsx under app/games means the route still exists",
    ).toEqual([]);
  });

  it("has no route file that could serve /games/[id] or its players", () => {
    const everyAppFile = walk(APP).map((path) => path.slice(APP.length));
    expect(everyAppFile.filter((path) => path.includes("games"))).toEqual([]);
  });

  it("points no active navigation at the retired product", () => {
    const offenders: string[] = [];
    for (const path of activeSources()) {
      const source = readFileSync(path, "utf8");
      // href/push/replace/redirect targets only — not API URLs, which still
      // exist on the backend and are used by the preserved implementation.
      const navigation = source.match(
        /(?:href[=:]|router\.(?:push|replace)\(|redirect\()\s*[{("`]*\s*["'`]\/games[^"'`]*/g,
      );
      if (navigation) offenders.push(`${path.slice(SRC.length)}: ${navigation}`);
    }
    expect(offenders).toEqual([]);
  });

  it("never imports the preserved classic implementation from active code", () => {
    const offenders: string[] = [];
    for (const path of activeSources()) {
      const source = readFileSync(path, "utf8");
      if (/from\s+["']@\/(legacy\/classic-game|features\/games)/.test(source)) {
        offenders.push(path.slice(SRC.length));
      }
    }
    expect(
      offenders,
      "an import is enough to pull the retired board back into the bundle",
    ).toEqual([]);
  });

  it("keeps the classic implementation itself, so it can return as its own mode", () => {
    const preserved = walk(LEGACY);
    expect(preserved.length).toBeGreaterThan(20);
    expect(
      preserved.some((path) => path.endsWith("components/game-board.tsx")),
      "the classic board must still be in the repository",
    ).toBe(true);
    expect(
      readFileSync(resolve(LEGACY, "README.md"), "utf8"),
    ).toContain("Retired from current Akwaan routing");
  });
});

describe("the current Akwaan journey does not route through /games", () => {
  it("puts Match setup on its own canonical route", () => {
    expect(MATCH_SETUP_ROUTE).toBe("/matches/new");
    expect(MATCH_SETUP_ROUTE.startsWith("/games")).toBe(false);
  });

  it("treats setup as an ordinary page and a Match as its own surface", () => {
    // Setup keeps site chrome: the host has not started anything yet.
    expect(isMatchPath(MATCH_SETUP_ROUTE)).toBe(false);
    // A running Match, and a paired phone, own the whole screen.
    expect(isMatchPath("/matches/6a6a56ee011b008767874299")).toBe(true);
    expect(isMatchPath("/join/live-session/ABC123")).toBe(true);
  });

  it("keeps home, Worlds and the Match on the edge-to-edge journey surface", () => {
    expect(isJourneyPath("/")).toBe(true);
    expect(isJourneyPath("/worlds/6a6e54159e10fe3b881da006")).toBe(true);
    expect(isJourneyPath("/matches/6a6a56ee011b008767874299")).toBe(true);
  });

  it("routes a signed-in player home rather than into the retired list", () => {
    const login = readFileSync(
      resolve(SRC, "features/auth/components/login-form.tsx"),
      "utf8",
    );
    expect(login).not.toContain('"/games"');
    const requireAdmin = readFileSync(
      resolve(SRC, "components/auth/require-admin.tsx"),
      "utf8",
    );
    expect(requireAdmin).not.toContain('"/games"');
  });

  it("offers no site-navigation entry into the retired product", () => {
    const header = readFileSync(
      resolve(SRC, "components/layout/header.tsx"),
      "utf8",
    );
    expect(header).not.toContain("/games");
    expect(header).not.toContain("ألعابي");
  });
});
