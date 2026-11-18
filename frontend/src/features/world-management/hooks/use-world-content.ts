"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import * as api from "../api/world-content.api";
import { worldContentKeys } from "./world-content.keys";

/**
 * Every mutation invalidates the whole World Content tree: readiness for a World
 * depends on its scopes, its board, the global mechanics, and other Worlds'
 * configurations, so a narrower invalidation would show stale readiness.
 */
function useInvalidateWorldContent() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: worldContentKeys.all });
}

/* Worlds */

export function useWorlds() {
  return useQuery({
    queryKey: worldContentKeys.worlds,
    queryFn: api.fetchWorlds,
  });
}

export function useCreateWorld() {
  const invalidate = useInvalidateWorldContent();
  return useMutation({
    mutationFn: ({
      data,
      file,
    }: {
      data: Record<string, unknown>;
      file?: File;
    }) => api.createWorld(data, file),
    onSuccess: invalidate,
  });
}

export function useUpdateWorld() {
  const invalidate = useInvalidateWorldContent();
  return useMutation({
    mutationFn: ({
      id,
      data,
      file,
    }: {
      id: string;
      data: Record<string, unknown>;
      file?: File;
    }) => api.updateWorld(id, data, file),
    onSuccess: invalidate,
  });
}

/* Scopes */

export function useScopes(worldId?: string) {
  return useQuery({
    queryKey: worldContentKeys.scopes(worldId ?? "none"),
    queryFn: () => api.fetchScopes(worldId as string),
    enabled: Boolean(worldId),
  });
}

export function useCreateScope(worldId: string) {
  const invalidate = useInvalidateWorldContent();
  return useMutation({
    mutationFn: ({
      data,
      file,
    }: {
      data: Record<string, unknown>;
      file?: File;
    }) => api.createScope(worldId, data, file),
    onSuccess: invalidate,
  });
}

export function useUpdateScope() {
  const invalidate = useInvalidateWorldContent();
  return useMutation({
    mutationFn: ({
      id,
      data,
      file,
    }: {
      id: string;
      data: Record<string, unknown>;
      file?: File;
    }) => api.updateScope(id, data, file),
    onSuccess: invalidate,
  });
}

/* Global challenge types */

export function useChallengeTypes() {
  return useQuery({
    queryKey: worldContentKeys.challengeTypes,
    queryFn: api.fetchChallengeTypes,
  });
}

/** The domain vocabulary and rule tables every form renders from. */
export function useWorldContentMetadata() {
  return useQuery({
    queryKey: worldContentKeys.metadata,
    queryFn: api.fetchWorldContentMetadata,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateChallengeType() {
  const invalidate = useInvalidateWorldContent();
  return useMutation({
    mutationFn: ({
      data,
      file,
    }: {
      data: Record<string, unknown>;
      file?: File;
    }) => api.createChallengeType(data, file),
    onSuccess: invalidate,
  });
}

export function useUpdateChallengeType() {
  const invalidate = useInvalidateWorldContent();
  return useMutation({
    mutationFn: ({
      id,
      data,
      file,
    }: {
      id: string;
      data: Record<string, unknown>;
      file?: File;
    }) => api.updateChallengeType(id, data, file),
    onSuccess: invalidate,
  });
}

/* World challenge configurations */

export function useWorldBoard(worldId?: string) {
  return useQuery({
    queryKey: worldContentKeys.worldBoard(worldId ?? "none"),
    queryFn: () => api.fetchWorldBoard(worldId as string),
    enabled: Boolean(worldId),
  });
}

export function useCreateWorldChallengeConfiguration(worldId: string) {
  const invalidate = useInvalidateWorldContent();
  return useMutation({
    mutationFn: ({
      data,
      file,
    }: {
      data: Record<string, unknown>;
      file?: File;
    }) => api.createWorldChallengeConfiguration(worldId, data, file),
    onSuccess: invalidate,
  });
}

/** Upload or remove a World's question backdrop artwork. */
export function useWorldQuestionFallback() {
  const invalidate = useInvalidateWorldContent();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File | null }) =>
      file
        ? api.setWorldQuestionFallback(id, file)
        : api.clearWorldQuestionFallback(id),
    onSuccess: invalidate,
  });
}

export function useUpdateWorldChallengeConfiguration() {
  const invalidate = useInvalidateWorldContent();
  return useMutation({
    mutationFn: ({
      id,
      data,
      file,
    }: {
      id: string;
      data: Record<string, unknown>;
      file?: File;
    }) => api.updateWorldChallengeConfiguration(id, data, file),
    onSuccess: invalidate,
  });
}

/* Content items */

export function useContentItems(filters: {
  worldId?: string;
  scopeId?: string;
  challengeTypeId?: string;
}) {
  return useQuery({
    queryKey: worldContentKeys.contentItems(filters),
    queryFn: () => api.fetchContentItems(filters),
    enabled: Boolean(filters.worldId),
  });
}

export function useCreateContentItem() {
  const invalidate = useInvalidateWorldContent();
  return useMutation({
    mutationFn: ({ data }: { data: Record<string, unknown> }) =>
      api.createContentItem(data),
    onSuccess: invalidate,
  });
}

export function useUpdateContentItem() {
  const invalidate = useInvalidateWorldContent();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      api.updateContentItem(id, data),
    onSuccess: invalidate,
  });
}
