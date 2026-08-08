import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

/**
 * A paired phone must never call an authenticated endpoint.
 *
 * Phones join with a participant credential, not a user session. The API client
 * redirects to `/login` on a 401 — so a participant surface that fetches an
 * authenticated resource does not degrade, it throws the player out of the game
 * mid-Match and loses their pairing.
 *
 * This is a real regression that shipped once: adding the World catalog to the
 * preflight so the host could show artwork also ran it on every phone, and the
 * phones bounced to the login screen the moment they joined. The rule that
 * prevents it is mechanical, so it is checked mechanically.
 */

/** Components the Match router can render for `actor="participant"`. */
const PARTICIPANT_SURFACES = [
  "src/features/live-game-session/match/components/unified-preflight-stage.tsx",
  "src/features/live-game-session/match/components/unified-challenge-stage.tsx",
  "src/features/live-game-session/match/components/participant-waiting.tsx",
  "src/features/live-game-session/match/match-stage-router.tsx",
  "src/features/live-game-session/components/player-join-page.tsx",
  "src/features/live-game-session/components/player-lobby.tsx",
  "src/features/live-game-session/components/top5-panel.tsx",
  "src/features/live-game-session/components/ryo-gameplay-panel.tsx",
];

/** Hooks that read a user-authenticated resource. */
const AUTHENTICATED_HOOKS = [
  "usePlayableWorlds",
  "usePlayableWorld",
  "usePlayableScopes",
  "useCurrentUser",
];

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("participant surfaces never fetch authenticated resources", () => {
  it("guards every authenticated hook a phone-reachable component calls", () => {
    const offenders: string[] = [];
    for (const path of PARTICIPANT_SURFACES) {
      const source = read(path);
      for (const hook of AUTHENTICATED_HOOKS) {
        // An unguarded call — `useX()` with no `enabled` argument — is the bug.
        if (new RegExp(`${hook}\\(\\s*\\)`).test(source)) {
          offenders.push(`${path}: ${hook}()`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("passes an actor-derived guard wherever the preflight reads the catalog", () => {
    const source = read(
      "src/features/live-game-session/match/components/unified-preflight-stage.tsx",
    );
    // The guard must depend on the actor, not on a constant that could be
    // flipped to `true` without anyone noticing.
    expect(source).toMatch(/usePlayableWorlds\(\s*actor\s*[!=]==?\s*"/);
  });

  it("keeps the catalog hook gateable at all", () => {
    const source = read("src/features/worlds/hooks/use-player-catalog.ts");
    expect(source).toContain("usePlayableWorlds(enabled");
    expect(source).toContain("enabled,");
  });
});
