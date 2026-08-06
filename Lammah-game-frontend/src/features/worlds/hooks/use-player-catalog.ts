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

/** Active Worlds, readable by any authenticated player. */
export function usePlayableWorlds() {
  return useQuery({
    queryKey: playerCatalogKeys.worlds,
    queryFn: fetchPlayableWorlds,
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
