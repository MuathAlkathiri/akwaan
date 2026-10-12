import apiClient from "@/lib/api/client";
import type { RyoTutorialScenario } from "@/features/challenge-explainer";

/**
 * The Admin side of a mechanic's tutorial.
 *
 * Every call here is under `/admin`, which is role-guarded server side. The
 * public read lives in the explainer feature and can only ever see published
 * content — these two surfaces are deliberately different endpoints rather than
 * one endpoint with a flag.
 */

/** What an editor authors. The outcome is derived server-side and never sent. */
export type TutorialScenarioDraft = Omit<RyoTutorialScenario, "outcome">;

export interface AdminTutorialState {
  mechanicKey: string;
  mechanicName: string;
  draft: RyoTutorialScenario | null;
  published: RyoTutorialScenario | null;
  publishedRevision: number;
  publishedAt: string | null;
  draftUpdatedAt: string | null;
  hasUnpublishedChanges: boolean;
}

export interface TutorialValidation {
  valid: boolean;
  issues: { code: string; message: string; details?: Record<string, unknown> }[];
  competitiveOverlap: { contentItemId: string; similarity: number }[];
  outcome: RyoTutorialScenario["outcome"] | null;
}

const base = (mechanicKey: string) =>
  `/admin/mechanics/${mechanicKey}/tutorial`;

export async function fetchAdminTutorial(
  mechanicKey: string,
): Promise<AdminTutorialState> {
  const response = await apiClient.get<{ data: AdminTutorialState }>(
    base(mechanicKey),
  );
  return response.data.data;
}

export async function saveTutorialDraft(
  mechanicKey: string,
  scenario: TutorialScenarioDraft,
): Promise<AdminTutorialState> {
  const response = await apiClient.put<{ data: AdminTutorialState }>(
    `${base(mechanicKey)}/draft`,
    scenario,
  );
  return response.data.data;
}

/** Dry-run the publish checks, including the competitive-overlap guard. */
export async function validateTutorialDraft(
  mechanicKey: string,
  scenario: TutorialScenarioDraft,
): Promise<TutorialValidation> {
  const response = await apiClient.post<{ data: TutorialValidation }>(
    `${base(mechanicKey)}/validate`,
    scenario,
  );
  return response.data.data;
}

export async function publishTutorial(
  mechanicKey: string,
): Promise<AdminTutorialState> {
  const response = await apiClient.post<{ data: AdminTutorialState }>(
    `${base(mechanicKey)}/publish`,
    {},
  );
  return response.data.data;
}
