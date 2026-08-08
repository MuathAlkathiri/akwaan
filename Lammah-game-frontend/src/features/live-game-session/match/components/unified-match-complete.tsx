"use client";

import { CheckCircle2, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { occurrenceLabel } from "@/features/match-setup";
import { usePlayableWorlds } from "@/features/worlds/hooks/use-player-catalog";
import { WorldMedia } from "@/components/akwaan/world-media";
import { TeamScore } from "@/components/akwaan/team-score";
import { teamIdentityOf } from "@/lib/team-identity";
import { cn } from "@/lib/utils";
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
  // Host surfaces only; see UnifiedBoard.
  const worlds = usePlayableWorlds(actor !== "participant");
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

  const winnerIdentity = winner
    ? teamIdentityOf(winner.teamId, standings.map((team) => ({ id: team.teamId })))
    : undefined;

  return (
    <div
      className="mx-auto max-w-6xl space-y-5"
      data-testid="unified-match-complete"
    >
      <header
        className={cn(
          "akwaan-rise surface-card border-2 p-6 text-center sm:p-8",
          winnerIdentity?.border,
        )}
      >
        <Trophy className="mx-auto size-10 text-warning" aria-hidden />
        <h1 className="mt-3 text-3xl font-black text-foreground sm:text-4xl">
          انتهت المباراة
        </h1>
        <p className="mt-1 text-sm font-bold text-muted-foreground">
          <span className="akwaan-numeral">
            {unified.board.completedPositionCount}/
            {unified.board.totalPositionCount}
          </span>{" "}
          تحديًا مكتمل
        </p>
        {/* The winner comes from the Match's own result; nothing is derived by
            comparing the two totals on this screen. */}
        <p
          className={cn(
            "mt-3 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-lg font-black",
            winnerIdentity
              ? cn(winnerIdentity.surface, winnerIdentity.border, winnerIdentity.text)
              : "border-border bg-muted text-foreground",
          )}
        >
          {result?.tie
            ? "تعادل"
            : winner
              ? `الفائز: ${winner.name}`
              : "النتيجة النهائية"}
        </p>
        <ul className="mx-auto mt-5 flex max-w-xl list-none flex-wrap justify-center gap-3">
          {standings.map((team) => (
            <li key={team.teamId} className="min-w-[11rem] flex-1">
              <TeamScore
                name={team.name}
                score={team.displayTotal}
                identity={teamIdentityOf(
                  team.teamId,
                  standings.map((entry) => ({ id: entry.teamId })),
                )}
                size="lg"
              />
            </li>
          ))}
        </ul>
        {/* Said once, where the final number is largest: it counts challenges,
            not the points any one of them was decided by. */}
        <p
          data-testid="match-complete-score-meaning"
          className="mt-3 text-xs font-bold text-muted-foreground"
        >
          كل تحدٍّ مكتمل يساوي نقطة واحدة للمباراة
        </p>
      </header>

      {unified.occurrences.map((occurrence) => (
        <section
          key={occurrence.occurrenceIndex}
          aria-label={occurrenceLabel(occurrence.occurrenceIndex)}
          data-testid={`complete-occurrence-${occurrence.occurrenceIndex}`}
          className="surface-card space-y-3 overflow-hidden"
        >
          <WorldMedia
            name={occurrence.worldName ?? "عالم"}
            eyebrow={occurrenceLabel(occurrence.occurrenceIndex)}
            variant="strip"
            {...(worlds.data?.find((world) => world.id === occurrence.worldId)
              ?.banner?.url
              ? {
                  imageUrl: worlds.data.find(
                    (world) => world.id === occurrence.worldId,
                  )!.banner!.url,
                }
              : {})}
            className="rounded-none"
          />
          <div className="space-y-3 px-4 pb-4">
            <p className="flex flex-wrap gap-1.5">
              {occurrence.subtotals.map((score) => {
                const identity = teamIdentityOf(
                  score.teamId,
                  standings.map((team) => ({ id: team.teamId })),
                );
                return (
                  <span
                    key={score.teamId}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-black",
                      identity.surface,
                      identity.border,
                      identity.text,
                    )}
                  >
                    {standings.find((team) => team.teamId === score.teamId)
                      ?.name ?? "فريق"}
                    <span className="akwaan-numeral">{score.displayTotal}</span>
                  </span>
                );
              })}
            </p>
            <Separator />
            <ul className="grid list-none gap-2 sm:grid-cols-2">
            {unified.board.positions
              .filter(
                (position) =>
                  position.occurrenceIndex === occurrence.occurrenceIndex,
              )
              .map((position) => (
                <li
                  key={position.positionKey}
                  data-testid={`complete-position-${position.positionKey}`}
                  className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2"
                >
                  {position.status === "completed" && (
                    <CheckCircle2
                      className="size-4 shrink-0 text-completed"
                      aria-label="مكتمل"
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-foreground/85">
                    {position.challengeName}
                  </span>
                  {position.scoreSummary && (
                    <Badge variant="outline" className="akwaan-numeral">
                      {position.scoreSummary
                        .map((score) => score.displayTotal)
                        .join("-")}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}

      {actor === "controller" && (
        <p className="text-center text-sm font-bold text-muted-foreground">
          لا حاجة لأي إعداد إضافي. المباراة مكتملة ومحفوظة.
        </p>
      )}
    </div>
  );
}
