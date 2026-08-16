import apiClient from "@/lib/api/client";
import type { PlayableScope, PlayableWorld } from "../types";

/** Public, player-safe read surface kept separate from content authoring. */

async function unwrap<T>(request: Promise<{ data: { data: T } }>): Promise<T> {
  return (await request).data.data;
}

export const fetchPlayableWorlds = () =>
  unwrap<PlayableWorld[]>(apiClient.get("/worlds"));

export const fetchPlayableWorld = (worldId: string) =>
  unwrap<PlayableWorld>(apiClient.get(`/worlds/${worldId}`));

export const fetchPlayableScopes = (worldId: string) =>
  unwrap<PlayableScope[]>(apiClient.get(`/worlds/${worldId}/scopes`));
