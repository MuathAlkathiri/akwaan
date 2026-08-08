import type { Game, Team } from "@/types";

export interface CurrentGameTurn {
  team: Team;
  teamIndex: 0 | 1;
}

export function resolveCurrentGameTurn(
  game: Game | undefined,
): CurrentGameTurn | undefined {
  if (!game) return undefined;

  const teamIndex: 0 | 1 =
    game.currentTeamIndex !== undefined
      ? game.currentTeamIndex
      : game.currentTeamTurn === "B"
        ? 1
        : 0;
  const team =
    game.teams?.[teamIndex] ??
    (teamIndex === 0 ? game.teamA : game.teamB);

  return team ? { team, teamIndex } : undefined;
}
