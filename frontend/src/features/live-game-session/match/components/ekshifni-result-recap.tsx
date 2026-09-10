import { cn } from "@/lib/utils";
import { BidiText } from "@/components/akwaan/bidi-text";
import { teamIdentityOf } from "@/lib/team-identity";
import type { LiveSessionSnapshot } from "../../model";
import type { MatchChallengeResult } from "../types";
import { teamName } from "../presentation";

interface EkshifniDetails {
  mechanicTotals?: Record<string, number>;
  items?: Array<{
    identity: string;
    winnerTeamId: string | null;
    value: number;
    revealedRegionIds?: string[];
    resolvedBy?: "answer" | "timeout";
  }>;
}

/**
 * What the three celebrities cost.
 *
 * The per-image line is the story of the mechanic: who got it, and how many
 * windows they had to open first. A picture nobody solved shows no value at all,
 * because a timeout rewards no one.
 */
export function EkshifniResultRecap({
  result,
  snapshot,
}: {
  result: MatchChallengeResult;
  snapshot: LiveSessionSnapshot;
}) {
  const details = result.details as EkshifniDetails;
  return (
    <div className="space-y-5" data-testid="ekshifni-challenge-result">
      <p className="text-center text-2xl font-black">
        {result.tie
          ? "تعادل في نقاط المشاهير"
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
        {details.items?.map((item, index) => (
          <li
            key={`${index}:${item.identity}`}
            className="flex items-center justify-between rounded-[var(--radius)] border border-border p-3 text-sm"
          >
            <BidiText className="font-black">{item.identity}</BidiText>
            <span className="text-muted-foreground">
              {item.winnerTeamId
                ? `${teamName(snapshot, item.winnerTeamId)} · ${item.value} نقاط بعد ${item.revealedRegionIds?.length ?? 0} كشف`
                : "لم يُحسم"}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
