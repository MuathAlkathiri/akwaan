"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as api from "../api/world-content.api";
import { worldContentKeys } from "./world-content.keys";
import type { DeletionEntityKind, DeletionExecuteInput } from "../types";

/**
 * The impact of deleting (or detaching) one record, fetched only while its
 * confirmation dialog is open.
 *
 * Never cached across dialogs: it is the basis of an irreversible decision, so
 * it is re-read from the server every time. The key sits outside the World
 * Content tree on purpose, so the post-deletion invalidation does not refetch
 * the preview of a record that no longer exists.
 */
export function useDeletionPreview(kind: DeletionEntityKind, id: string) {
  return useQuery({
    queryKey: ["world-content-deletion-preview", kind, id],
    queryFn: () => api.fetchDeletionPreview(kind, id),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

/**
 * Executes a reviewed deletion. Every World Content query is invalidated on
 * success: Worlds, Scopes, content, mechanics, boards and readiness all derive
 * from what was just removed.
 */
export function useExecuteDeletion(kind: DeletionEntityKind, id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: DeletionExecuteInput) =>
      api.executeDeletion(kind, id, input),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: worldContentKeys.all }),
  });
}
