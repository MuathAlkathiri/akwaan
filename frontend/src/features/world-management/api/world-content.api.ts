import apiClient from "@/lib/api/client";
import type {
  ChallengeType,
  ContentItem,
  DeletionEntityKind,
  DeletionExecuteInput,
  DeletionPreview,
  DeletionResult,
  Scope,
  World,
  WorldBoard,
  WorldChallengeConfiguration,
  WorldContentMetadata,
} from "../types";

/**
 * One client for the World Management admin API. Every mutation accepts an
 * optional image file, which is sent as multipart alongside the JSON payload the
 * backend's multipart parser expects.
 */

type Payload = Record<string, unknown>;

function body(field: string, data: Payload, file?: File): Payload | FormData {
  if (!file) return data;
  const formData = new FormData();
  formData.append(field, JSON.stringify(data));
  formData.append("asset", file);
  return formData;
}

async function unwrap<T>(request: Promise<{ data: { data: T } }>): Promise<T> {
  return (await request).data.data;
}

/* Worlds */

export const fetchWorlds = () =>
  unwrap<World[]>(apiClient.get("/admin/worlds"));

export const createWorld = (data: Payload, file?: File) =>
  unwrap<World>(apiClient.post("/admin/worlds", body("world", data, file)));

export const updateWorld = (worldId: string, data: Payload, file?: File) =>
  unwrap<World>(
    apiClient.patch(`/admin/worlds/${worldId}`, body("world", data, file)),
  );

/**
 * The World's 16:9 question backdrop (roadmap §30.22 Track A). It has its own
 * endpoints because the World write already carries one image for the banner,
 * and because only an uploaded file — never a URL — may become the asset.
 */
export const setWorldQuestionFallback = (worldId: string, file: File) => {
  const formData = new FormData();
  formData.append("asset", file);
  return unwrap<World>(
    apiClient.post(`/admin/worlds/${worldId}/question-fallback`, formData),
  );
};

export const clearWorldQuestionFallback = (worldId: string) =>
  unwrap<World>(
    apiClient.delete(`/admin/worlds/${worldId}/question-fallback`),
  );

/* Scopes */

export const fetchScopes = (worldId: string) =>
  unwrap<Scope[]>(apiClient.get(`/admin/worlds/${worldId}/scopes`));

export const createScope = (worldId: string, data: Payload, file?: File) =>
  unwrap<Scope>(
    apiClient.post(
      `/admin/worlds/${worldId}/scopes`,
      body("scope", data, file),
    ),
  );

export const updateScope = (scopeId: string, data: Payload, file?: File) =>
  unwrap<Scope>(
    apiClient.patch(`/admin/scopes/${scopeId}`, body("scope", data, file)),
  );

/* Global challenge types */

export const fetchChallengeTypes = () =>
  unwrap<ChallengeType[]>(apiClient.get("/admin/challenge-types"));

export const fetchWorldContentMetadata = () =>
  unwrap<WorldContentMetadata>(
    apiClient.get("/admin/challenge-types/metadata"),
  );

export const createChallengeType = (data: Payload, file?: File) =>
  unwrap<ChallengeType>(
    apiClient.post("/admin/challenge-types", body("challengeType", data, file)),
  );

export const updateChallengeType = (
  challengeTypeId: string,
  data: Payload,
  file?: File,
) =>
  unwrap<ChallengeType>(
    apiClient.patch(
      `/admin/challenge-types/${challengeTypeId}`,
      body("challengeType", data, file),
    ),
  );

/* World-specific challenge configurations */

export const fetchWorldBoard = (worldId: string) =>
  unwrap<WorldBoard>(
    apiClient.get(`/admin/worlds/${worldId}/challenge-configurations`),
  );

/**
 * World choices for the mechanic-centric tutorial editor.  The list is derived
 * from the same board configuration records the server uses to authorize a
 * scoped tutorial; no World names or slugs are hard-coded in the client.
 */
export interface TutorialWorldOption {
  worldId: string;
  worldName: string;
  worldSlug: string;
  configurationId: string;
  effectiveName: string;
  isEnabled: boolean;
}

export async function fetchTutorialWorldOptions(
  mechanicKey: string,
): Promise<TutorialWorldOption[]> {
  const worlds = await fetchWorlds();
  const boards = await Promise.all(
    worlds.map(async (world) => {
      try {
        return { world, board: await fetchWorldBoard(world.id) };
      } catch {
        // A stale/deleted World must not make the entire mechanic editor
        // unusable. The server remains authoritative when a scope is selected.
        return null;
      }
    }),
  );

  return boards
    .flatMap((entry) => {
      if (!entry) return [];
      const configuration = entry.board.configurations.find(
        (candidate) => candidate.challengeType.slug === mechanicKey,
      );
      if (!configuration) return [];
      return [
        {
          worldId: entry.world.id,
          worldName: entry.world.name,
          worldSlug: entry.world.slug,
          configurationId: configuration.id,
          effectiveName: configuration.effectiveName,
          isEnabled: configuration.isEnabled,
        },
      ];
    })
    .sort((left, right) => left.worldName.localeCompare(right.worldName));
}

export const createWorldChallengeConfiguration = (
  worldId: string,
  data: Payload,
  file?: File,
) =>
  unwrap<WorldChallengeConfiguration>(
    apiClient.post(
      `/admin/worlds/${worldId}/challenge-configurations`,
      body("configuration", data, file),
    ),
  );

export const updateWorldChallengeConfiguration = (
  configurationId: string,
  data: Payload,
  file?: File,
) =>
  unwrap<WorldChallengeConfiguration>(
    apiClient.patch(
      `/admin/challenge-configurations/${configurationId}`,
      body("configuration", data, file),
    ),
  );

/* Content items */

export const fetchContentItems = (params: {
  worldId?: string;
  scopeId?: string;
  challengeTypeId?: string;
}) => unwrap<ContentItem[]>(apiClient.get("/admin/content-items", { params }));

export const createContentItem = (data: Payload) =>
  unwrap<ContentItem>(apiClient.post("/admin/content-items", data));

export const uploadContentItemAsset = (file: File) => {
  const form = new FormData();
  form.append("asset", file);
  return unwrap<{ url: string; path: string; filename: string }>(
    apiClient.post("/admin/content-items/upload-asset", form),
  );
};

export const updateContentItem = (contentItemId: string, data: Payload) =>
  unwrap<ContentItem>(
    apiClient.patch(`/admin/content-items/${contentItemId}`, data),
  );

/* Permanent deletion and detach (roadmap §19.1) */

/**
 * Where each entity's preview and execute endpoints live. A board slot is never
 * deleted from here: it is *detached*, which removes the association only.
 */
const DELETION_ROUTES: Record<
  DeletionEntityKind,
  (id: string) => { preview: string; execute: string }
> = {
  world: (id) => ({
    preview: `/admin/worlds/${id}/deletion-preview`,
    execute: `/admin/worlds/${id}/permanent-delete`,
  }),
  scope: (id) => ({
    preview: `/admin/scopes/${id}/deletion-preview`,
    execute: `/admin/scopes/${id}/permanent-delete`,
  }),
  challengeType: (id) => ({
    preview: `/admin/challenge-types/${id}/deletion-preview`,
    execute: `/admin/challenge-types/${id}/permanent-delete`,
  }),
  contentItem: (id) => ({
    preview: `/admin/content-items/${id}/deletion-preview`,
    execute: `/admin/content-items/${id}/permanent-delete`,
  }),
  configuration: (id) => ({
    preview: `/admin/challenge-configurations/${id}/detach-preview`,
    execute: `/admin/challenge-configurations/${id}/detach`,
  }),
};

/** Read-only: what deleting (or detaching) this record would change. */
export const fetchDeletionPreview = (kind: DeletionEntityKind, id: string) =>
  unwrap<DeletionPreview>(apiClient.get(DELETION_ROUTES[kind](id).preview));

/**
 * Execute exactly the reviewed plan. The server refuses with
 * `DELETION_PREVIEW_STALE` if the impact changed since `previewFingerprint`, and
 * replays (never repeats) a `requestId` it has already executed.
 */
export const executeDeletion = (
  kind: DeletionEntityKind,
  id: string,
  input: DeletionExecuteInput,
) =>
  unwrap<DeletionResult>(
    apiClient.post(DELETION_ROUTES[kind](id).execute, input),
  );
