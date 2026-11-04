/**
 * Admin authoring and Match preflight can live in the same browser session.
 * Keep the public tutorial query cache fresh when an approved publication
 * changes, without coupling the raw Admin API module to a React Query client.
 */
export const PUBLISHED_TUTORIAL_INVALIDATED =
  "akwaan:published-tutorial-invalidated";

export interface PublishedTutorialInvalidation {
  mechanicKey: string;
  worldId?: string;
}

export function notifyPublishedTutorialInvalidation(
  detail: PublishedTutorialInvalidation,
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<PublishedTutorialInvalidation>(
      PUBLISHED_TUTORIAL_INVALIDATED,
      { detail },
    ),
  );
}
