"use client";

import { useQuery } from "@tanstack/react-query";
import {
  fetchPlayableScopes,
  fetchPlayableWorld,
  fetchPlayableWorlds,
} from "../api/player-catalog.api";

export const playerCatalogKeys = {
  worlds: ["player-catalog", "worlds"] as const,
  scopes: (worldId: string) =>
    ["player-catalog", "worlds", worldId, "scopes"] as const,
};

export function usePlayableWorld(worldId?: string) {
  return useQuery({
    queryKey: [...playerCatalogKeys.worlds, worldId ?? "none"],
    queryFn: () => fetchPlayableWorld(worldId as string),
    enabled: Boolean(worldId),
  });
}

/**
 * Active Worlds, readable by any authenticated **user**.
 *
 * `enabled` is not optional in spirit: a paired phone has no user session, and
 * the API client redirects to the login page on a 401 — so a participant surface
 * that fetches this throws the player out of the game mid-Match. Any component a
 * phone can reach must pass `false`.
 */
export function usePlayableWorlds(enabled = true) {
  return useQuery({
    queryKey: playerCatalogKeys.worlds,
    queryFn: fetchPlayableWorlds,
    enabled,
  });
}

/** Active Scopes of one active World. */
export function usePlayableScopes(worldId?: string) {
  return useQuery({
    queryKey: playerCatalogKeys.scopes(worldId ?? "none"),
    queryFn: () => fetchPlayableScopes(worldId as string),
    enabled: Boolean(worldId),
  });
}
