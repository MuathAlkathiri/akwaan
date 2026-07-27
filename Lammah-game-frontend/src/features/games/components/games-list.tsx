"use client";

import { GameCard } from "@/components/game";
import { EmptyState, LoadingState } from "@/components/shared";
import { useGames } from "../hooks/use-games";
import { getEntityId, getStatusLabel } from "@/lib/utils";

export function GamesList() {
  const { data, isLoading, error } = useGames();
  const games = data || [];

  if (isLoading) return <LoadingState count={2} />;
  if (error)
    return <EmptyState title="تعذر تحميل الألعاب" />;
  if (!games.length)
    return <EmptyState title="لا توجد ألعاب" />;

  return (
    <div className="grid gap-5 md:grid-cols-2">
      {games.map((game) => (
        <GameCard
          key={getEntityId(game)}
          id={getEntityId(game)}
          name={game.name}
          status={getStatusLabel(game.status)}
          teamA={{
            name: (game.teamA || game.teams?.[0])?.name || "الفريق أ",
            score: (game.teamA || game.teams?.[0])?.score ?? 0,
          }}
          teamB={{
            name: (game.teamB || game.teams?.[1])?.name || "الفريق ب",
            score: (game.teamB || game.teams?.[1])?.score ?? 0,
          }}
        />
      ))}
    </div>
  );
}
