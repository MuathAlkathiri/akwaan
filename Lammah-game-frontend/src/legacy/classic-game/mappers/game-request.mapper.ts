import type { CreateGameDto } from "@/api/generated/models";
import type { CreateGamePayload } from "@/types";

export const toCreateGameRequest = (
  payload: CreateGamePayload,
): CreateGameDto => ({
  name: payload.name,
  teams: payload.teams.map((team) => ({
    name: team.name,
    members: team.members,
    color: team.color,
  })),
  categoryIds: payload.categoryIds,
});
