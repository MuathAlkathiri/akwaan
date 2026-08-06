import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
  "src/app/worlds/[worldId]/board/page.tsx",
  "src/features/worlds/components/worlds-home.tsx",
  "src/features/worlds/components/world-screen.tsx",
  "src/features/worlds/components/board-screen.tsx",
  "src/features/worlds/hooks/use-player-catalog.ts",
  "src/features/worlds/hooks/use-scope-pool-selection.ts",
  "src/features/worlds/api/player-catalog.api.ts",
  // Pre-match setup is a player surface too: it reads Worlds and Scopes through
  // the same public projections and must never reach an authoring module.
  "src/app/games/new/setup/page.tsx",
  "src/features/match-setup/components/match-setup-wizard.tsx",
  "src/features/match-setup/components/occurrence-world-step.tsx",
  "src/features/match-setup/components/occurrence-scopes-step.tsx",
  "src/features/match-setup/components/match-setup-review.tsx",
  "src/features/match-setup/components/match-setup-teams.tsx",
  "src/features/match-setup/state/match-setup-draft.ts",
  "src/features/match-setup/state/match-setup-storage.ts",
  "src/features/match-setup/state/use-match-setup.ts",
  "src/features/match-setup/api/unified-match.api.ts",
  "src/features/match-setup/api/create-configured-match.ts",
  "src/features/match-setup/errors/match-setup-errors.ts",
] as const;

/** The sequential setup the wizard replaces. None of it may reappear here. */
const MATCH_SETUP_FILES = [
  "src/features/match-setup/components/match-setup-wizard.tsx",
  "src/features/match-setup/components/occurrence-world-step.tsx",
  "src/features/match-setup/components/occurrence-scopes-step.tsx",
  "src/features/match-setup/components/match-setup-review.tsx",
  "src/features/match-setup/components/match-setup-teams.tsx",
  "src/features/match-setup/state/match-setup-draft.ts",
  "src/features/match-setup/state/use-match-setup.ts",
  "src/features/match-setup/api/create-configured-match.ts",
  "src/features/match-setup/api/unified-match.api.ts",
] as const;

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

  it("keeps pre-match setup off the sequential Match endpoints and stages", () => {
    for (const relativePath of MATCH_SETUP_FILES) {
      const source = readFileSync(resolve(process.cwd(), relativePath), "utf8");

      // Setup happens before a Match exists, so none of these can apply.
      for (const forbidden of [
        "/match/create",
        "/worlds/select",
        "/scopes/select",
        "/worlds/continue",
        "/coin-toss",
        "world_selection",
        "scope_selection",
        "coin_toss",
        "world_complete",
        "currentOccurrence",
        "match/api/match-api",
      ]) {
        expect(source, `${relativePath} → ${forbidden}`).not.toContain(forbidden);
      }
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
      "/live-game-sessions/${input.sessionId}/match/unified/challenges/launch",
      "/live-game-sessions/${sessionId}/ready",
      "/live-game-sessions/${sessionId}/start",
    ]);
    // Never the development alias.
    expect(api).not.toContain("/development");
  });
});
