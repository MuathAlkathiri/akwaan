"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import apiClient from "@/lib/api/client";
import type { PublishedTutorial } from "./tutorial-scenario";
import {
  PUBLISHED_TUTORIAL_INVALIDATED,
  type PublishedTutorialInvalidation,
} from "./tutorial-cache-events";

/**
 * The published tutorial for one mechanic.
 *
 * Keyed by the mechanic's canonical slug and the authoritative World when one
 * is present. A scoped example must never be served from another World's
 * cache; the generic slot remains the compatibility fallback when no World is
 * supplied.
 *
 * `null` is a real answer, not an error: a mechanic with no published tutorial
 * has none, and the caller shows the authored instructions instead of inventing
 * a demonstration.
 *
 * This is a read of approved teaching material. It touches no Match, reserves no
 * content and records no exposure.
 */
export function usePublishedTutorial(
  mechanicKey: string | undefined,
  worldId?: string,
) {
  const queryClient = useQueryClient();
  const scope = worldId ?? "generic";
  const queryKey = ["mechanic-tutorial", scope, mechanicKey] as const;

  useEffect(() => {
    const onInvalidated = (event: Event) => {
      const detail = (event as CustomEvent<PublishedTutorialInvalidation>)
        .detail;
      if (!detail || detail.mechanicKey !== mechanicKey) return;

      if (detail.worldId) {
        void queryClient.invalidateQueries({
          queryKey: ["mechanic-tutorial", detail.worldId, mechanicKey],
        });
        return;
      }

      // A generic publication is also the fallback for every World without a
      // scoped publication, so invalidate all cached scopes for this mechanic.
      void queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === "mechanic-tutorial" &&
          query.queryKey[2] === mechanicKey,
      });
    };

    window.addEventListener(PUBLISHED_TUTORIAL_INVALIDATED, onInvalidated);
    return () =>
      window.removeEventListener(PUBLISHED_TUTORIAL_INVALIDATED, onInvalidated);
  }, [mechanicKey, queryClient]);

  return useQuery({
    queryKey,
    enabled: Boolean(mechanicKey),
    // Published content changes on an editor's schedule, not a Match's, so this
    // is cached for the session rather than refetched behind the host.
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async (): Promise<PublishedTutorial | null> => {
      const response = await apiClient.get<{ data: PublishedTutorial | null }>(
        worldId
          ? `/worlds/${worldId}/mechanics/${mechanicKey}/tutorial`
          : `/mechanics/${mechanicKey}/tutorial`,
      );
      return response.data?.data ?? null;
    },
  });
}
