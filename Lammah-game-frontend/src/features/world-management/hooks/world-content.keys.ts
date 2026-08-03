const ROOT = "world-content";

export const worldContentKeys = {
  all: [ROOT] as const,
  worlds: [ROOT, "worlds"] as const,
  scopes: (worldId: string) => [ROOT, "scopes", worldId] as const,
  challengeTypes: [ROOT, "challenge-types"] as const,
  metadata: [ROOT, "metadata"] as const,
  worldBoard: (worldId: string) =>
    [ROOT, "challenge-configurations", worldId] as const,
  contentItems: (filters: Record<string, string | undefined>) =>
    [ROOT, "content-items", filters] as const,
};
