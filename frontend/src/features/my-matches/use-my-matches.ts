"use client";

import { useQuery } from "@tanstack/react-query";
import { getMyMatches } from "./api";

/**
 * `enabled` is not a convenience: this endpoint needs a session, and the API
 * client sends a 401 to the login page. A surface a signed-out visitor can
 * reach must pass `false`, or it throws them out of the page they asked for.
 */
export function useMyMatches(page: number, enabled = true) {
  return useQuery({
    queryKey: ["my-matches", page],
    queryFn: () => getMyMatches(page),
    enabled,
  });
}
