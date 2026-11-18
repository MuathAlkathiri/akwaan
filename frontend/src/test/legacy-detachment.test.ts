import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { resolve } from "path";
import { isJourneyPath, isMatchPath } from "@/components/layout";
import { MATCH_SETUP_ROUTE } from "@/features/match-setup";
import { adminNavigation } from "@/config/admin-navigation";

/**
 * The Lammah-era system (classic game board, flat categories and catalogs, the
 * legacy question bank and its AI generator) is retired, and its code is gone
 * (roadmap §0.2, delete-on-replace).
 *
 * What must not come back is a *path* into it: a route file under `app/`, a nav
 * item, a post-login redirect, or an import of a removed feature. Each of those
 * is how a retired product quietly stays shipped.
 *
 * This reads the real source tree rather than mocking a router, because the thing
 * being asserted is a property of the repository: in Next.js a route exists
 * because a file exists, so a file is what has to be checked.
 */

const SRC = resolve(process.cwd(), "src");
const APP = resolve(SRC, "app");

const RETIRED_ROUTE_PREFIXES = [
  "/games",
  "/questions",
  "/categories",
  "/register",
  "/admin/questions",
  "/admin/categories",
  "/admin/catalogs",
  "/admin/ai-generator",
  "/admin/ai-generated",
];

const RETIRED_FEATURE_IMPORT =
  /from\s+["']@\/(legacy\/|features\/(games|questions|categories|catalogs|ai-generation|music)\b)/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = resolve(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

/** Every source file the application ships. */
function activeSources(): string[] {
  return walk(SRC).filter(
    (path) =>
      /\.(ts|tsx)$/.test(path) &&
      !path.includes("/test/") &&
      !/\.(test|spec)\.tsx?$/.test(path),
  );
}

describe("the retired Lammah-era system is gone from the application", () => {
  it("has no route file under a retired path", () => {
    const appFiles = walk(APP).map((path) => path.slice(APP.length));
    const offenders = appFiles.filter((path) =>
      RETIRED_ROUTE_PREFIXES.some(
        (prefix) => path === prefix || path.startsWith(`${prefix}/`),
      ),
    );
    expect(offenders, "a file under app/ means the route still exists").toEqual(
      [],
    );
  });

  it("keeps no legacy source tree or retired feature folder", () => {
    for (const dir of [
      "legacy",
      "features/games",
      "features/questions",
      "features/categories",
      "features/catalogs",
      "features/ai-generation",
      "features/music",
    ]) {
      expect(existsSync(resolve(SRC, dir)), `src/${dir} must stay deleted`).toBe(
        false,
      );
    }
  });

  it("points no active navigation at a retired route", () => {
    const offenders: string[] = [];
    for (const path of activeSources()) {
      const source = readFileSync(path, "utf8");
      const navigation = source.match(
        /(?:href[=:]|router\.(?:push|replace)\(|redirect\()\s*[{("`]*\s*["'`]\/(?:games|questions|categories|register|admin\/(?:questions|categories|catalogs|ai-generator|ai-generated))\b[^"'`]*/g,
      );
      if (navigation) offenders.push(`${path.slice(SRC.length)}: ${navigation}`);
    }
    expect(offenders).toEqual([]);
  });

  it("lists no retired screen in the admin navigation", () => {
    const hrefs = adminNavigation.map((item) => item.href);
    for (const prefix of RETIRED_ROUTE_PREFIXES) {
      expect(hrefs.filter((href) => href.startsWith(prefix))).toEqual([]);
    }
  });

  it("never imports a removed feature from active code", () => {
    const offenders = activeSources()
      .filter((path) => RETIRED_FEATURE_IMPORT.test(readFileSync(path, "utf8")))
      .map((path) => path.slice(SRC.length));
    expect(offenders).toEqual([]);
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
      resolve(SRC, "features/auth/components/passwordless-login-form.tsx"),
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
