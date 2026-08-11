import apiClient from "@/lib/api/client";
import type {
  ChallengeType,
  ChallengeTypeDeletionPreview,
  ContentItem,
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

export const fetchWorlds = () => unwrap<World[]>(apiClient.get("/admin/worlds"));

export const createWorld = (data: Payload, file?: File) =>
  unwrap<World>(apiClient.post("/admin/worlds", body("world", data, file)));

export const updateWorld = (worldId: string, data: Payload, file?: File) =>
  unwrap<World>(
    apiClient.patch(`/admin/worlds/${worldId}`, body("world", data, file)),
  );

export const deleteWorld = async (worldId: string) => {
  await apiClient.delete(`/admin/worlds/${worldId}`);
};

/* Scopes */

export const fetchScopes = (worldId: string) =>
  unwrap<Scope[]>(apiClient.get(`/admin/worlds/${worldId}/scopes`));

export const createScope = (worldId: string, data: Payload, file?: File) =>
  unwrap<Scope>(
    apiClient.post(`/admin/worlds/${worldId}/scopes`, body("scope", data, file)),
  );

export const updateScope = (scopeId: string, data: Payload, file?: File) =>
  unwrap<Scope>(
    apiClient.patch(`/admin/scopes/${scopeId}`, body("scope", data, file)),
  );

export const deleteScope = async (scopeId: string) => {
  await apiClient.delete(`/admin/scopes/${scopeId}`);
};

/* Global challenge types */

export const fetchChallengeTypes = () =>
  unwrap<ChallengeType[]>(apiClient.get("/admin/challenge-types"));

export const fetchWorldContentMetadata = () =>
  unwrap<WorldContentMetadata>(apiClient.get("/admin/challenge-types/metadata"));

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

export const deleteChallengeType = async (challengeTypeId: string) => {
  await apiClient.delete(`/admin/challenge-types/${challengeTypeId}`);
};

export const fetchChallengeTypeDeletionPreview = (challengeTypeId: string) =>
  unwrap<ChallengeTypeDeletionPreview>(
    apiClient.get(
      `/admin/challenge-types/${challengeTypeId}/deletion-preview`,
    ),
  );

export const archiveChallengeType = (challengeTypeId: string) =>
  unwrap<ChallengeType>(
    apiClient.post(`/admin/challenge-types/${challengeTypeId}/archive`),
  );

/* World-specific challenge configurations */

export const fetchWorldBoard = (worldId: string) =>
  unwrap<WorldBoard>(
    apiClient.get(`/admin/worlds/${worldId}/challenge-configurations`),
  );

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

export const deleteWorldChallengeConfiguration = async (
  configurationId: string,
) => {
  await apiClient.delete(`/admin/challenge-configurations/${configurationId}`);
};

/* Content items */

export const fetchContentItems = (params: {
  worldId?: string;
  scopeId?: string;
  challengeTypeId?: string;
}) =>
  unwrap<ContentItem[]>(apiClient.get("/admin/content-items", { params }));

export const createContentItem = (data: Payload) =>
  unwrap<ContentItem>(apiClient.post("/admin/content-items", data));

export const updateContentItem = (contentItemId: string, data: Payload) =>
  unwrap<ContentItem>(
    apiClient.patch(`/admin/content-items/${contentItemId}`, data),
  );

export const deleteContentItem = async (contentItemId: string) => {
  await apiClient.delete(`/admin/content-items/${contentItemId}`);
};
