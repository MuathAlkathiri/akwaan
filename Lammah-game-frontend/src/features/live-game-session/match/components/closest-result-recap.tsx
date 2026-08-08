"use client";

import { cn } from "@/lib/utils";
import { teamIdentityOf } from "@/lib/team-identity";
import type { LiveSessionSnapshot } from "../../model";
import type { MatchChallengeResult } from "../types";

interface ClosestRecapItem {
  itemIndex: number;
  correctValue: number;
  answers: Record<string, number | null>;
  distances: Record<string, number | null>;
  winnerTeamId: string | null;
  tie: boolean;
}

export function ClosestResultRecap({
  result,
  snapshot,
}: {
  result: MatchChallengeResult;
  snapshot: LiveSessionSnapshot;
}) {
  const items = Array.isArray(result.details.items)
    ? (result.details.items as unknown as ClosestRecapItem[])
    : [];
  const totals =
    result.details.mechanicTotals && typeof result.details.mechanicTotals === "object"
      ? (result.details.mechanicTotals as Record<string, number>)
      : {};
  const teams = snapshot.teams.filter((team) => team.active);
  return (
    <div className="space-y-5" data-testid="closest-challenge-result">
      <div className="text-center">
        <p className="text-sm font-black text-muted-foreground">نتيجة تحدي مين أقرب</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {teams.map((team) => {
            const identity = teamIdentityOf(team.id, snapshot.teams);
            return (
              <div key={team.id} className={cn("rounded-[var(--radius)] border p-4", identity.surface, identity.border)}>
                <p className={cn("font-black", identity.text)}>{team.name}</p>
                <p className="akwaan-numeral text-4xl font-black">{totals[team.id] ?? 0}</p>
              </div>
            );
          })}
        </div>
        <p className="mt-4 text-xl font-black">
          {result.tie
            ? "تعادل التحدي — لا توجد نقطة للمباراة"
            : `${teams.find((team) => team.id === result.winnerTeamId)?.name ?? "الفريق"} فاز بالتحدي — +1 نقطة للمباراة`}
        </p>
      </div>
      <ol className="grid gap-3 sm:grid-cols-3">
        {items.map((item) => (
          <li key={item.itemIndex} className="rounded-[var(--radius)] border border-border bg-muted/35 p-3 text-center">
            <p className="text-xs font-black text-muted-foreground">السؤال {item.itemIndex + 1}</p>
            <p className="akwaan-numeral mt-1 text-xl font-black">الصحيح: {item.correctValue}</p>
            <p className="mt-2 text-xs font-bold text-muted-foreground">
              {teams.map((team) => `${team.name}: ${item.answers[team.id] ?? "—"}`).join(" · ")}
            </p>
            <p className="mt-2 font-black">
              {item.tie ? "تعادل" : teams.find((team) => team.id === item.winnerTeamId)?.name}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
