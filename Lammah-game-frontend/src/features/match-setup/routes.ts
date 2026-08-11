/** The single place the pre-match setup route is named. */
export const MATCH_SETUP_ROUTE = "/matches/new";

/** Opens setup at Scope selection for the first occurrence. */
export const matchSetupRouteForWorld = (worldId: string) =>
  `${MATCH_SETUP_ROUTE}?worldId=${encodeURIComponent(worldId)}`;
