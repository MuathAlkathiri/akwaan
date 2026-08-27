"use client";

import { useQuery } from "@tanstack/react-query";
import { getMyMatches } from "./api";

export function useMyMatches(page: number) {
  return useQuery({
    queryKey: ["my-matches", page],
    queryFn: () => getMyMatches(page),
  });
}
