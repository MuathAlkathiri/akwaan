import { Flame, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { BidiText } from "@/components/akwaan/bidi-text";
import { teamIdentityOf } from "@/lib/team-identity";
import type { LiveSessionSnapshot } from "../../model";
import type { MatchChallengeResult } from "../types";
import { teamName } from "../presentation";

interface LaTahriqhaDetails {
  mechanicTotals?: Record<string, number>;
  burns?: number;
  perfectDishes?: number;
  dishes?: Array<{
    dishName: string;
    teams?: Array<{
      teamId: string;
      points: number;
      burned: boolean;
      perfect: boolean;
    }>;
  }>;
}

/**
 * What the three dishes cost.
 *
 * The per-dish line is the story of the mechanic: a burn and a perfect dish are
 * the two outcomes worth naming, because a bare "0" and a bare "7" do not say
 * that one team reached for the fifth ingredient and one team was caught by a
 * single wrong card.
 */
export function LaTahriqhaResultRecap({
  result,
  snapshot,
}: {
  result: MatchChallengeResult;
  snapshot: LiveSessionSnapshot;
}) {
  const details = result.details as LaTahriqhaDetails;
  return (
    <div className="space-y-5" data-testid="la-tahriqha-challenge-result">
      <p className="text-center text-2xl font-black">
        {result.tie
          ? "تعادل في نقاط الأطباق"
          : `فوز ${teamName(snapshot, result.winnerTeamId!)}`}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {snapshot.teams.map((team) => {
          const identity = teamIdentityOf(team.id, snapshot.teams);
          const matchPoints =
            result.matchPoints.find((entry) => entry.teamId === team.id)
              ?.points ?? 0;
          return (
            <div
              key={team.id}
              className={cn(
                "rounded-[var(--radius)] border p-4 text-center",
                identity.surface,
                identity.border,
              )}
            >
              <p className={cn("font-black", identity.text)}>{team.name}</p>
              <p className="akwaan-numeral mt-1 text-3xl font-black">
                {details.mechanicTotals?.[team.id] ?? 0}
              </p>
              <p className="text-xs font-bold text-muted-foreground">
                نقاط داخلية · +{matchPoints} للمباراة
              </p>
            </div>
          );
        })}
      </div>
      <ol className="space-y-2">
        {details.dishes?.map((dish, index) => (
          <li
            key={`${index}:${dish.dishName}`}
            className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-border p-3 text-sm"
          >
            <BidiText className="font-black">{dish.dishName}</BidiText>
            <span className="flex flex-wrap items-center gap-3 text-muted-foreground">
              {dish.teams?.map((team) => (
                <span key={team.teamId} className="flex items-center gap-1">
                  {team.burned && (
                    <Flame className="size-4 text-destructive" aria-hidden />
                  )}
                  {team.perfect && (
                    <Star className="size-4 text-brand-gold" aria-hidden />
                  )}
                  {teamName(snapshot, team.teamId)}
                  <span className="akwaan-numeral font-black text-foreground">
                    {team.points}
                  </span>
                </span>
              ))}
            </span>
          </li>
        ))}
      </ol>
      {(details.burns || details.perfectDishes) && (
        <p className="text-center text-sm font-bold text-muted-foreground">
          <span className="akwaan-numeral">{details.perfectDishes ?? 0}</span>{" "}
          طبق مثالي ·{" "}
          <span className="akwaan-numeral">{details.burns ?? 0}</span> طبق محروق
        </p>
      )}
    </div>
  );
}
