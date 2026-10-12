"use client";

import { useQuery } from "@tanstack/react-query";
import apiClient from "@/lib/api/client";
import type { PublishedTutorial } from "./tutorial-scenario";

/**
 * The published tutorial for one mechanic.
 *
 * Keyed by the mechanic's canonical slug — the same identifier gameplay and the
 * Preflight already use — and never by World or Scope. What a host is taught is
 * a property of the mechanic, so the same demonstration serves every Match that
 * plays it.
 *
 * `null` is a real answer, not an error: a mechanic with no published tutorial
 * has none, and the caller shows the authored instructions instead of inventing
 * a demonstration.
 *
 * This is a read of approved teaching material. It touches no Match, reserves no
 * content and records no exposure.
 */
export function usePublishedTutorial(mechanicKey: string | undefined) {
  return useQuery({
    queryKey: ["mechanic-tutorial", mechanicKey],
    enabled: Boolean(mechanicKey),
    // Published content changes on an editor's schedule, not a Match's, so this
    // is cached for the session rather than refetched behind the host.
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async (): Promise<PublishedTutorial | null> => {
      const response = await apiClient.get<{ data: PublishedTutorial | null }>(
        `/mechanics/${mechanicKey}/tutorial`,
      );
      return response.data?.data ?? null;
    },
  });
}
