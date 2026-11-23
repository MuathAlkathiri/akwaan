import { useQuery } from "@tanstack/react-query";
import apiClient from "@/lib/api/client";

/**
 * How many questions each World still owes this player.
 *
 * Not the World's total. A player who has been through a World three times
 * should see it emptying, because the number is there to help them choose what
 * to play — and a count that never moves is decoration.
 *
 * The figure is the player's own: the server reads the account from the token
 * and there is no way to ask about somebody else's.
 */
export interface WorldRemaining {
  worldId: string;
  remaining: number;
}

export const worldRemainingQueryKey = (worldIds: string[]) =>
  ["content-progress", "worlds", [...worldIds].sort().join(",")] as const;

/**
 * The endpoint takes at most twenty Worlds at a time, so the caller passes the
 * ones actually on screen rather than everything it knows about.
 */
export function useWorldRemaining(worldIds: string[], enabled: boolean) {
  const ids = worldIds.slice(0, 20);

  return useQuery({
    queryKey: worldRemainingQueryKey(ids),
    enabled: enabled && ids.length > 0,
    queryFn: async (): Promise<Map<string, number>> => {
      const response = await apiClient.get<WorldRemaining[]>(
        "/content-progress/worlds",
        { params: { worldIds: ids } },
      );
      return new Map(response.data.map((row) => [row.worldId, row.remaining]));
    },
    // Counts move only when a Match is played, so a fresh read on every
    // re-render would be a request per card for a number that rarely changes.
    staleTime: 60_000,
    // A missing count is not an error worth showing: the card simply omits the
    // sticker, which is the same thing it does for a signed-out visitor.
    retry: false,
  });
}
