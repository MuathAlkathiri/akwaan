"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { occurrenceLabel } from "@/features/match-setup";
import { teamIdentityOf } from "@/lib/team-identity";
import { cn } from "@/lib/utils";
import { useLiveSession } from "../../hooks/live-session-context";
import { teamName } from "../presentation";
import { winnerOf } from "./world-orbit";
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

  const winnerIdentity = winner
    ? teamIdentityOf(winner.teamId, standings.map((team) => ({ id: team.teamId })))
    : undefined;

  const everyTeam = standings.map((team) => ({ id: team.teamId }));
  const tie = Boolean(result?.tie) || !winner;

  return (
    <div
      className="mx-auto w-full max-w-6xl space-y-6"
      data-testid="unified-match-complete"
    >
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <header className="akwaan-rise flex flex-col items-center gap-5 rounded-[28px] border-[3px] border-[hsl(var(--brand-navy))] bg-brand-lavender px-5 py-8 text-center shadow-[6px_7px_0_hsl(var(--brand-navy))] sm:px-8 sm:py-10">
          <p className="font-display inline-flex min-h-14 -rotate-2 items-center rounded-2xl border-[3px] border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))] px-6 text-2xl font-extrabold text-[hsl(var(--brand-navy))] shadow-[5px_6px_0_hsl(var(--brand-navy))] sm:text-[32px]">
            {tie ? "تعادل!" : "أبطال الأكوان"}
          </p>
          <h1 className="sr-only">انتهت المباراة</h1>
          {/* The winner comes from the Match's own result; nothing is derived
              by comparing the two totals on this screen. */}
          <p className="font-display inline-flex items-center gap-3 text-3xl font-black text-[hsl(var(--brand-navy))] sm:text-5xl">
            {winner && !tie && (
              <span
                aria-hidden
                className={cn(
                  "size-5 shrink-0 rounded-full border-[3px] border-[hsl(var(--brand-navy))] sm:size-6",
                  winnerIdentity?.dot,
                )}
              />
            )}
            {tie
              ? result?.tie
                ? "تعادل"
                : "النتيجة النهائية"
              : `الفائز: ${winner!.name}`}
          </p>
          {tie && result?.tie && (
            <p className="text-lg font-bold text-brand-slate">
              ما أحد غلب أحد. الحسم في المباراة الجاية.
            </p>
          )}
          <ul className="m-0 flex list-none flex-wrap items-stretch justify-center gap-4 p-0">
            {standings.map((team) => {
              const leads = tie || team.teamId === winner?.teamId;
              return (
                <li
                  key={team.teamId}
                  className="flex min-w-[10rem] flex-col items-center gap-1 rounded-[20px] border-[3px] border-[hsl(var(--brand-navy))] bg-white px-6 py-4"
                >
                  <span className="inline-flex items-center gap-2 text-lg font-bold text-[hsl(var(--brand-navy))]">
                    <span
                      aria-hidden
                      className={cn(
                        "size-3.5 rounded-full border-2 border-[hsl(var(--brand-navy))]",
                        teamIdentityOf(team.teamId, everyTeam).dot,
                      )}
                    />
                    {team.name}
                  </span>
                  {/* Gold on the number that won; both, when nobody did. */}
                  <span
                    className={cn(
                      "akwaan-numeral text-6xl font-bold leading-none sm:text-7xl",
                      leads
                        ? "text-[#B8892F]"
                        : "text-[hsl(var(--brand-navy))]",
                    )}
                  >
                    {team.displayTotal}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="text-sm font-bold text-brand-slate">
            <span className="akwaan-numeral">
              {unified.board.completedPositionCount}/
              {unified.board.totalPositionCount}
            </span>{" "}
            تحديًا مكتمل
          </p>
          {/* Said once, where the final number is largest: it counts
              challenges, not the points any one of them was decided by. */}
          <p
            data-testid="match-complete-score-meaning"
            className="text-xs font-bold text-brand-slate"
          >
            كل تحدٍّ مكتمل يساوي نقطة واحدة للمباراة
          </p>
          {actor === "controller" && (
            <div className="flex flex-wrap items-center justify-center gap-4 pt-1">
              <Link
                href="/#worlds"
                className="font-display inline-flex min-h-[3.75rem] items-center rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))] px-9 text-xl font-extrabold text-[hsl(var(--brand-navy))] no-underline shadow-[5px_6px_0_hsl(var(--brand-navy))] transition-transform hover:-translate-y-0.5"
              >
                مباراة جديدة
              </Link>
              <Link
                href="/"
                className="inline-flex min-h-[3.75rem] items-center rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-white px-8 text-lg font-bold text-[hsl(var(--brand-navy))] no-underline shadow-[4px_5px_0_hsl(var(--brand-navy))] transition-transform hover:-translate-y-0.5"
              >
                الرئيسية
              </Link>
            </div>
          )}
        </header>

        {/* How the Match went, World by World: who took it, counted the only
            way a World can be counted — by the challenges each side won in it. */}
        <section className="space-y-4" aria-labelledby="match-story-title">
          <h2
            id="match-story-title"
            className="font-display text-2xl font-extrabold text-[hsl(var(--brand-navy))]"
          >
            كيف مشت المباراة
          </h2>
          {unified.occurrences.map((occurrence) => {
            const positions = unified.board.positions.filter(
              (position) =>
                position.occurrenceIndex === occurrence.occurrenceIndex,
            );
            const wins = standings.map((team) => ({
              team,
              won: positions.filter(
                (position) =>
                  position.status === "completed" &&
                  winnerOf(position) === team.teamId,
              ).length,
            }));
            const best = Math.max(...wins.map((entry) => entry.won), 0);
            const leaders = wins.filter((entry) => entry.won === best);
            const worldWinner =
              best > 0 && leaders.length === 1 ? leaders[0].team : undefined;
            return (
              <section
                key={occurrence.occurrenceIndex}
                aria-label={occurrenceLabel(occurrence.occurrenceIndex)}
                data-testid={`complete-occurrence-${occurrence.occurrenceIndex}`}
                className="surface-card space-y-3 p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-display text-xl font-extrabold text-[hsl(var(--brand-navy))]">
                    {occurrence.worldName ?? "عالم"}
                  </h3>
                  <span
                    data-testid={`complete-world-score-${occurrence.occurrenceIndex}`}
                    className="akwaan-numeral inline-flex min-h-8 items-center rounded-full border-2 border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))] px-3 text-base font-extrabold text-[hsl(var(--brand-navy))]"
                    dir="ltr"
                  >
                    {wins.map((entry) => entry.won).join(" - ")}
                  </span>
                </div>
                <p className="inline-flex items-center gap-2 text-base font-bold text-brand-slate">
                  {worldWinner ? (
                    <>
                      <span
                        aria-hidden
                        className={cn(
                          "size-3 rounded-full border-2 border-[hsl(var(--brand-navy))]",
                          teamIdentityOf(worldWinner.teamId, everyTeam).dot,
                        )}
                      />
                      {worldWinner.name} أخذ هالعالم
                    </>
                  ) : (
                    "تعادل في هالعالم"
                  )}
                </p>
                <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
                  {positions.map((position) => (
                    <li
                      key={position.positionKey}
                      data-testid={`complete-position-${position.positionKey}`}
                      className="flex items-center gap-2 rounded-xl border-2 border-brand-mist bg-white px-3 py-2"
                    >
                      {position.status === "completed" && (
                        <CheckCircle2
                          className="size-4 shrink-0 text-[hsl(var(--brand-navy))]"
                          aria-label="مكتمل"
                        />
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm font-bold text-[hsl(var(--brand-navy))]">
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
              </section>
            );
          })}
        </section>
      </div>

      {actor === "controller" && (
        <p className="text-center text-sm font-bold text-brand-slate">
          لا حاجة لأي إعداد إضافي. المباراة مكتملة ومحفوظة.
        </p>
      )}
    </div>
  );
}
