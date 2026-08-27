import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock("@/lib/api/client", () => ({
  default: { get: mocks.get },
}));

import {
  fetchPlayableScopes,
  fetchPlayableWorld,
  fetchPlayableWorlds,
} from "@/features/worlds/api/player-catalog.api";

const PLAYER_JOURNEY_FILES = [
  "src/app/page.tsx",
  "src/app/worlds/[worldId]/page.tsx",
  "src/features/worlds/components/worlds-home.tsx",
  "src/features/worlds/hooks/use-player-catalog.ts",
  "src/features/worlds/api/player-catalog.api.ts",
  "src/features/worlds/utils/scopes.ts",
  // Pre-match setup is a player surface too: it reads Worlds and Scopes through
  // the same public projections and must never reach an authoring module.
  "src/app/matches/new/page.tsx",
  "src/features/match-setup/components/match-setup-wizard.tsx",
  "src/features/match-setup/components/occurrence-world-step.tsx",
  "src/features/match-setup/components/occurrence-scopes-step.tsx",
  "src/features/match-setup/components/match-setup-teams.tsx",
  "src/features/match-setup/state/match-setup-draft.ts",
  "src/features/match-setup/state/match-setup-storage.ts",
  "src/features/match-setup/state/use-match-setup.ts",
  "src/features/match-setup/api/unified-match.api.ts",
  "src/features/match-setup/api/create-configured-match.ts",
  "src/features/match-setup/errors/match-setup-errors.ts",
] as const;

/**
 * Everything the sequential Match journey left behind.
 *
 * The point of scanning for these is not tidiness. Each one is a way for a second
 * Match journey to grow back: a stage the server no longer has, an endpoint it no
 * longer serves, a client-side list of which mechanics are playable, or a request
 * that names its own content. A file that mentions one has stopped consuming the
 * unified contract, whether or not it still compiles.
 */
const REMOVED_LEGACY_SYMBOLS = [
  // Stages and setup modes the server no longer reports.
  "legacy_sequential",
  "unified_preconfigured",
  "setupMode",
  "world_selection",
  "scope_selection",
  "world_complete",
  "coin_toss",
  // Projection fields of the sequential Match.
  "currentOccurrence",
  "worldSelection",
  "WorldSelectionMethod",
  // Endpoints Phase 5 deleted.
  "/match/create",
  "/match/start",
  "/coin-toss",
  "/worlds/select",
  "/scopes/select",
  "/worlds/continue",
  "/match/development",
  "match/api/match-api",
  // Client-side gameplay rules: the server decides all of these.
  "contentItemIds",
  "PLAYABLE_CHALLENGE_SLUGS",
  "isPlayableMechanic",
  "buildOccurrenceBoard",
  // Modules and routes this phase deleted.
  "useMatchController",
  "useScopePoolSelection",
  "DevelopmentLaunchDialog",
  "ScopeSelection",
  "BoardScreen",
  "/worlds/${worldId}/board",
] as const;

/**
 * Placeholder language for a World or a mechanic that is, in fact, either
 * playable or permanently unavailable — never merely "being prepared". This is a
 * rule about *Worlds and mechanics*, not about the home page's curated roadmap
 * teaser, which advertises future *content categories* (films, series, songs)
 * that are not Worlds in the system at all.
 */
const WORLD_PREPARATION_PLACEHOLDERS = ["قيد التجهيز", "قريبًا", "قريباً"] as const;

/**
 * The one production file allowed to say "قريباً": the home roadmap teaser, whose
 * cards are content-category promises, not Worlds. Every other file must still be
 * clean, so a real World or mechanic can never be labelled as being prepared.
 */
const ROADMAP_TEASER_FILE =
  "src/features/worlds/components/worlds-home.tsx";

/** Production source only: the tests themselves may name what they forbid. */
function productionSources(): string[] {
  const root = resolve(process.cwd(), "src");
  const files: string[] = [];
  const walk = (directory: string) => {
    for (const entry of readdirSync(directory)) {
      const path = join(directory, entry);
      if (statSync(path).isDirectory()) {
        if (entry === "test" || entry === "generated") continue;
        walk(path);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      if (/\.(test|spec)\.tsx?$/.test(entry)) continue;
      files.push(path);
    }
  };
  walk(root);
  return files.map((path) => relative(process.cwd(), path).split(sep).join("/"));
}

describe("player World API boundary", () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.get.mockResolvedValue({ data: { data: [] } });
  });

  it("calls only the authenticated player catalog endpoints", async () => {
    await fetchPlayableWorlds();
    await fetchPlayableWorld("world-1");
    await fetchPlayableScopes("world-1");

    expect(mocks.get.mock.calls.map(([url]) => url)).toEqual([
      "/worlds",
      "/worlds/world-1",
      "/worlds/world-1/scopes",
    ]);
    expect(mocks.get.mock.calls.flat().join(" ")).not.toContain("/admin/");
  });

  it("keeps every player route, screen, and shared hook out of admin modules", () => {
    for (const relativePath of PLAYER_JOURNEY_FILES) {
      const source = readFileSync(resolve(process.cwd(), relativePath), "utf8");

      expect(source, relativePath).not.toMatch(/\/admin\//);
      expect(source, relativePath).not.toMatch(/features\/world-management/);
      expect(source, relativePath).not.toMatch(/useAdminWorlds|useAdminScopes/);
      expect(source, relativePath).not.toMatch(/\buseWorlds\b|\buseScopes\b/);
    }
  });

  it("creates a Match only through the unified production route", () => {
    const api = readFileSync(
      resolve(process.cwd(), "src/features/match-setup/api/unified-match.api.ts"),
      "utf8",
    );
    const routes = [...api.matchAll(/`(\/live-game-sessions\/[^`]*)`/g)].map(
      (match) => match[1],
    );
    expect(routes).toEqual([
      "/live-game-sessions/${sessionId}/match/unified",
      // Preparing holds a position; launching starts it. Both name a position
      // only — the server chooses the content.
      "/live-game-sessions/${input.sessionId}/match/unified/challenges/prepare",
      "/live-game-sessions/${input.sessionId}/match/unified/challenges/cancel",
      // Leaving the result is its own explicit command; the stage never expires
      // on a timer and the client never advances it locally.
      "/live-game-sessions/${input.sessionId}/match/unified/challenges/continue",
      // Idle-board recovery controls (Double, ±1 score correction, turn switch)
      // share one authoritative board-command endpoint; the path names the action.
      "/live-game-sessions/${sessionId}/match/unified/${path}",
      // Back to Board aborts the running challenge authoritatively before any
      // navigation happens. Leaving a challenge is a server transition, not a
      // client-side route change.
      "/live-game-sessions/${input.sessionId}/runtime/cancel",
      "/live-game-sessions/${input.sessionId}/match/unified/challenges/launch",
      "/live-game-sessions/${sessionId}/ready",
      "/live-game-sessions/${sessionId}/start",
    ]);
    // Never the development alias.
    expect(api).not.toContain("/development");
  });
});

describe("no sequential Match journey survives in production source", () => {
  const sources = productionSources().map((path) => ({
    path,
    text: readFileSync(resolve(process.cwd(), path), "utf8"),
  }));

  it("scans a real, non-trivial slice of the application", () => {
    expect(sources.length).toBeGreaterThan(100);
    expect(sources.map((file) => file.path)).toContain(
      "src/features/live-game-session/match/match-stage-router.tsx",
    );
  });

  it.each(REMOVED_LEGACY_SYMBOLS)("has no reference to %s", (symbol) => {
    const offenders = sources
      .filter((file) => file.text.includes(symbol))
      .map((file) => file.path);
    expect(offenders).toEqual([]);
  });

  it.each(WORLD_PREPARATION_PLACEHOLDERS)(
    "never labels a World or mechanic as %s",
    (phrase) => {
      // The roadmap teaser advertises future content categories, not Worlds, so
      // it alone may carry this word; everywhere else it would wrongly imply a
      // World or mechanic is merely being prepared.
      const offenders = sources
        .filter((file) => file.path !== ROADMAP_TEASER_FILE)
        .filter((file) => file.text.includes(phrase))
        .map((file) => file.path);
      expect(offenders).toEqual([]);
    },
  );

  it("keeps exactly one Match API client", () => {
    const clients = sources
      .filter((file) => file.text.includes("/match/unified"))
      .map((file) => file.path);
    expect(clients).toEqual([
      "src/features/match-setup/api/unified-match.api.ts",
    ]);
  });

  it("keeps exactly one Match stage router", () => {
    const routers = sources
      .filter((file) => /export function MatchStageRouter/.test(file.text))
      .map((file) => file.path);
    expect(routers).toEqual([
      "src/features/live-game-session/match/match-stage-router.tsx",
    ]);
  });

  it("has no board route beside the unified Match board", () => {
    const boardRoutes = sources.filter(
      (file) =>
        file.path.startsWith("src/app/") && file.path.includes("/board/"),
    );
    expect(boardRoutes).toEqual([]);
  });
});
