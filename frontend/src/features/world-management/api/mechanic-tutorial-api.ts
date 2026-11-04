import apiClient from "@/lib/api/client";
import type { TutorialScenario } from "@/features/challenge-explainer";
import { notifyPublishedTutorialInvalidation } from "@/features/challenge-explainer/tutorial-cache-events";

/**
 * The Admin side of a mechanic's tutorial.
 *
 * Every call here is under `/admin`, which is role-guarded server side. The
 * public read lives in the explainer feature and can only ever see published
 * content — these two surfaces are deliberately different endpoints rather than
 * one endpoint with a flag.
 */

/** What an editor authors. The outcome is derived server-side and never sent. */
export type TutorialScenarioDraft = TutorialScenario extends infer Scenario
  ? Scenario extends { outcome: unknown }
    ? Omit<Scenario, "outcome">
    : never
  : never;

export interface AdminTutorialState {
  mechanicKey: string;
  mechanicName: string;
  draft: TutorialScenario | null;
  published: TutorialScenario | null;
  publishedRevision: number;
  publishedAt: string | null;
  draftUpdatedAt: string | null;
  hasUnpublishedChanges: boolean;
  worldId?: string;
  challengeTypeId?: string;
  associated?: boolean;
  generic?: { published: boolean; publishedRevision: number };
  withdrawnAt?: string | null;
  revisions?: {
    revision: number;
    publishedAt: string;
    restoredFromRevision: number | null;
  }[];
}

export interface TutorialValidation {
  valid: boolean;
  issues: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  }[];
  competitiveOverlap: { contentItemId: string; similarity: number }[];
  outcome: TutorialScenario["outcome"] | null;
}

const base = (mechanicKey: string, worldId?: string) =>
  worldId
    ? `/admin/worlds/${worldId}/mechanics/${mechanicKey}/tutorial`
    : `/admin/mechanics/${mechanicKey}/tutorial`;

export async function fetchAdminTutorial(
  mechanicKey: string,
  worldId?: string,
): Promise<AdminTutorialState> {
  const response = await apiClient.get<{ data: AdminTutorialState }>(
    base(mechanicKey, worldId),
  );
  return response.data.data;
}

export async function saveTutorialDraft(
  mechanicKey: string,
  scenario: TutorialScenarioDraft,
  worldId?: string,
): Promise<AdminTutorialState> {
  const response = await apiClient.put<{ data: AdminTutorialState }>(
    `${base(mechanicKey, worldId)}/draft`,
    scenario,
  );
  return response.data.data;
}

/** Dry-run the publish checks, including the competitive-overlap guard. */
export async function validateTutorialDraft(
  mechanicKey: string,
  scenario: TutorialScenarioDraft,
  worldId?: string,
): Promise<TutorialValidation> {
  const response = await apiClient.post<{ data: TutorialValidation }>(
    `${base(mechanicKey, worldId)}/validate`,
    scenario,
  );
  return response.data.data;
}

export async function publishTutorial(
  mechanicKey: string,
  worldId?: string,
): Promise<AdminTutorialState> {
  const response = await apiClient.post<{ data: AdminTutorialState }>(
    `${base(mechanicKey, worldId)}/publish`,
    {},
  );
  const state = response.data.data;
  notifyPublishedTutorialInvalidation({ mechanicKey, worldId });
  return state;
}

export interface ScopedAdminTutorialState extends AdminTutorialState {
  worldId: string;
  challengeTypeId: string;
  associated: boolean;
  generic: { published: boolean; publishedRevision: number };
  withdrawnAt: string | null;
  revisions: {
    revision: number;
    publishedAt: string;
    restoredFromRevision: number | null;
  }[];
}

const scopedBase = (worldId: string, mechanicKey: string) =>
  `/admin/worlds/${worldId}/mechanics/${mechanicKey}/tutorial`;

export async function fetchScopedAdminTutorial(
  worldId: string,
  mechanicKey: string,
): Promise<ScopedAdminTutorialState> {
  const response = await apiClient.get<{ data: ScopedAdminTutorialState }>(
    scopedBase(worldId, mechanicKey),
  );
  return response.data.data;
}

export async function saveScopedTutorialDraft(
  worldId: string,
  mechanicKey: string,
  scenario: TutorialScenarioDraft,
): Promise<ScopedAdminTutorialState> {
  const response = await apiClient.put<{ data: ScopedAdminTutorialState }>(
    `${scopedBase(worldId, mechanicKey)}/draft`,
    scenario,
  );
  return response.data.data;
}

export async function validateScopedTutorialDraft(
  worldId: string,
  mechanicKey: string,
  scenario: TutorialScenarioDraft,
): Promise<TutorialValidation> {
  const response = await apiClient.post<{ data: TutorialValidation }>(
    `${scopedBase(worldId, mechanicKey)}/validate`,
    scenario,
  );
  return response.data.data;
}

export async function publishScopedTutorial(
  worldId: string,
  mechanicKey: string,
): Promise<ScopedAdminTutorialState> {
  const response = await apiClient.post<{ data: ScopedAdminTutorialState }>(
    `${scopedBase(worldId, mechanicKey)}/publish`,
    {},
  );
  const state = response.data.data;
  notifyPublishedTutorialInvalidation({ mechanicKey, worldId });
  return state;
}

export async function withdrawScopedTutorial(
  worldId: string,
  mechanicKey: string,
): Promise<ScopedAdminTutorialState> {
  const response = await apiClient.post<{ data: ScopedAdminTutorialState }>(
    `${scopedBase(worldId, mechanicKey)}/withdraw`,
    {},
  );
  const state = response.data.data;
  notifyPublishedTutorialInvalidation({ mechanicKey, worldId });
  return state;
}

export async function restoreScopedTutorial(
  worldId: string,
  mechanicKey: string,
  revision: number,
): Promise<ScopedAdminTutorialState> {
  const response = await apiClient.post<{ data: ScopedAdminTutorialState }>(
    `${scopedBase(worldId, mechanicKey)}/revisions/${revision}/restore`,
    {},
  );
  const state = response.data.data;
  notifyPublishedTutorialInvalidation({ mechanicKey, worldId });
  return state;
}
