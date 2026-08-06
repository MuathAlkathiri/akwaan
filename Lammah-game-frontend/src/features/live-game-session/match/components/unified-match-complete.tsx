"use client";

import { CheckCircle2, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { occurrenceLabel } from "@/features/match-setup";
import { useLiveSession } from "../../hooks/live-session-context";
import { teamName } from "../presentation";
import type { MatchActor, MatchTeamStanding } from "../types";

/**
 * The end of a preconfigured Match.
 *
 * Every score here is the Match's own authoritative total — nothing is recomputed
 * on the client. The twelve positions are shown as they finished, grouped by
 * occurrence, so a repeated World reads as two separate stretches of the Match.
 */
export function UnifiedMatchComplete({ actor }: { actor: MatchActor }) {
  const { snapshot } = useLiveSession();
  const match = snapshot?.match;
  const unified = match?.unified;
  if (!snapshot || !match || !unified) return null;

  const standings: MatchTeamStanding[] =
    match.standings ??
    match.scoring.matchTotals.map((score) => ({
      ...score,
      name: teamName(snapshot, score.teamId),
    }));
  const result = match.result;
  const winner = result?.winnerTeamId
    ? standings.find((team) => team.teamId === result.winnerTeamId)
    : undefined;

  return (
    <div className="space-y-5" data-testid="unified-match-complete">
      <header className="rounded-2xl border border-black/[0.05] bg-white p-6 text-center">
        <Trophy className="mx-auto size-10 text-amber-500" aria-hidden />
        <h1 className="mt-3 text-3xl font-black text-slate-900">
          انتهت المباراة
        </h1>
        <p className="mt-1 text-sm font-bold text-slate-500">
          {unified.board.completedPositionCount}/
          {unified.board.totalPositionCount} تحديًا مكتمل
        </p>
        <p className="mt-3 text-lg font-black text-primary">
          {result?.tie
            ? "تعادل"
            : winner
              ? `الفائز: ${winner.name}`
              : "النتيجة النهائية"}
        </p>
        <ul className="mt-4 flex list-none flex-wrap justify-center gap-6">
          {standings.map((team) => (
            <li key={team.teamId} className="text-center">
              <p className="text-sm font-bold text-slate-500">{team.name}</p>
              <p className="text-3xl font-black tabular-nums text-slate-900">
                {team.displayTotal}
              </p>
            </li>
          ))}
        </ul>
      </header>

      {unified.occurrences.map((occurrence) => (
        <section
          key={occurrence.occurrenceIndex}
          aria-label={occurrenceLabel(occurrence.occurrenceIndex)}
          data-testid={`complete-occurrence-${occurrence.occurrenceIndex}`}
          className="space-y-2 rounded-2xl border border-black/[0.05] bg-white p-4"
        >
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-black text-slate-900">
              {occurrenceLabel(occurrence.occurrenceIndex)}
              {occurrence.worldName ? ` · ${occurrence.worldName}` : ""}
            </h2>
            <p className="text-xs font-bold text-slate-500">
              {occurrence.subtotals
                .map(
                  (score) =>
                    `${standings.find((team) => team.teamId === score.teamId)?.name ?? "فريق"}: ${score.displayTotal}`,
                )
                .join(" · ")}
            </p>
          </header>
          <ul className="grid list-none gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {unified.board.positions
              .filter(
                (position) =>
                  position.occurrenceIndex === occurrence.occurrenceIndex,
              )
              .map((position) => (
                <li
                  key={position.positionKey}
                  data-testid={`complete-position-${position.positionKey}`}
                  className="flex items-center gap-2 rounded-xl border border-black/[0.05] bg-slate-50 px-3 py-2"
                >
                  {position.status === "completed" && (
                    <CheckCircle2
                      className="size-4 shrink-0 text-emerald-600"
                      aria-label="مكتمل"
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-slate-700">
                    {position.challengeName}
                  </span>
                  {position.scoreSummary && (
                    <Badge variant="outline" className="tabular-nums">
                      {position.scoreSummary
                        .map((score) => score.displayTotal)
                        .join("-")}
                    </Badge>
                  )}
                </li>
              ))}
          </ul>
        </section>
      ))}

      {actor === "controller" && (
        <p className="text-center text-sm text-slate-500">
          لا حاجة لأي إعداد إضافي. المباراة مكتملة ومحفوظة.
        </p>
      )}
    </div>
  );
}
