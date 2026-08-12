"use client";

import { useEffect, useMemo, useState } from "react";
import { Separator } from "@/components/ui/separator";
import { teamIdentityOf, type TeamIdentity } from "@/lib/team-identity";
import { cn } from "@/lib/utils";
import { teamName } from "../presentation";
import type { LiveSessionSnapshot } from "../../model";
import type { MatchChallengeResult } from "../types";

/**
 * How long one ownership field stays neutral before the next lights up.
 *
 * Named so the pace can be tuned in one place. The reveal is suspense, not
 * information: every value it walks through was already decided and persisted by
 * the server, so changing this number cannot change a result.
 */
export const TOP5_REVEAL_STEP_MS = 700;
/** A beat after the last field before the winner is announced. */
export const TOP5_WINNER_DELAY_MS = 900;

export interface Top5ResultDetails {
  title?: string;
  rankingBasis?: string;
  sourceLabel?: string;
  entries: Array<{ id: string; label: string; rank: number | null }>;
  ownership: Array<{ entryId: string; ownerTeamId: string }>;
  top5Counts: Record<string, number>;
  trapCounts: Record<string, number>;
  /** Ten ids, each once, minted server side. Never generated here. */
  revealOrder: string[];
  winnerTeamId: string | null;
}

export function parseTop5Details(
  details: Record<string, unknown> | undefined,
): Top5ResultDetails | undefined {
  if (!details) return undefined;
  const candidate = details as Partial<Top5ResultDetails>;
  if (
    !Array.isArray(candidate.entries) ||
    !Array.isArray(candidate.ownership) ||
    !Array.isArray(candidate.revealOrder) ||
    !candidate.top5Counts
  ) {
    return undefined;
  }
  return {
    ...candidate,
    entries: candidate.entries,
    ownership: candidate.ownership,
    revealOrder: candidate.revealOrder,
    top5Counts: candidate.top5Counts,
    trapCounts: candidate.trapCounts ?? {},
    winnerTeamId: candidate.winnerTeamId ?? null,
  };
}

/**
 * The Top 5 reveal.
 *
 * Two factual sections in a fixed order — the ranked five, then the traps — and
 * an ownership reveal that walks the server's `revealOrder`. The list order and
 * the reveal order are deliberately different things: the facts stay stable while
 * the colours arrive at random, which is where the tension comes from.
 *
 * The counter this screen animates is the server's own count reached one step at
 * a time; the final numbers are read from the record, not accumulated here.
 */
export function Top5ResultReveal({
  result,
  snapshot,
  stepMs = TOP5_REVEAL_STEP_MS,
}: {
  result: MatchChallengeResult;
  snapshot: LiveSessionSnapshot;
  /** Overridable so a test does not have to wait seven seconds per card. */
  stepMs?: number;
}) {
  const details = useMemo(
    () => parseTop5Details(result.details),
    [result.details],
  );
  const [revealedCount, setRevealedCount] = useState(0);

  const total = details?.revealOrder.length ?? 0;
  useEffect(() => {
    // Restart whenever a different challenge's result arrives, so a second Top 5
    // in the same Match replays from neutral.
    setRevealedCount(0);
  }, [result.id]);
  useEffect(() => {
    if (revealedCount >= total) return;
    const timer = setTimeout(() => setRevealedCount((count) => count + 1), stepMs);
    return () => clearTimeout(timer);
  }, [revealedCount, total, stepMs]);

  // The same two colours the teams wear everywhere else in the Match.
  const identityByTeam = useMemo(() => {
    const map = new Map<string, TeamIdentity>();
    for (const team of snapshot.teams) {
      map.set(team.id, teamIdentityOf(team.id, snapshot.teams));
    }
    return map;
  }, [snapshot.teams]);

  if (!details) {
    return (
      <p
        role="alert"
        data-testid="top5-result-unreadable"
        className="rounded-[var(--radius)] border border-warning/40 bg-warning-subtle p-4 text-sm font-bold text-foreground"
      >
        تعذّر عرض تفاصيل نتيجة أفضل 5.
      </p>
    );
  }

  const ownerByEntry = new Map(
    details.ownership.map((record) => [record.entryId, record.ownerTeamId]),
  );
  const revealed = new Set(details.revealOrder.slice(0, revealedCount));
  const complete = revealedCount >= total;

  // The visible counter is the reveal so far, not a second tally: only entries
  // whose ownership has already lit up are counted.
  const liveTop5Counts = new Map<string, number>();
  for (const entry of details.entries) {
    if (entry.rank === null || !revealed.has(entry.id)) continue;
    const owner = ownerByEntry.get(entry.id);
    if (!owner) continue;
    liveTop5Counts.set(owner, (liveTop5Counts.get(owner) ?? 0) + 1);
  }

  const field = (entry: { id: string; label: string; rank: number | null }) => {
    const owner = ownerByEntry.get(entry.id);
    const identity = owner ? identityByTeam.get(owner) : undefined;
    const isRevealed = revealed.has(entry.id);
    return (
      <li
        key={entry.id}
        data-testid={`top5-field-${entry.id}`}
        data-revealed={isRevealed ? "true" : "false"}
        data-owner-team={isRevealed ? (owner ?? "") : ""}
        className={cn(
          "flex items-center justify-between gap-3 rounded-[var(--radius)] border-2 px-4 py-3 transition-colors duration-slow ease-akwaan",
          isRevealed && identity
            ? cn(identity.surface, identity.border, identity.text, "akwaan-claim")
            : "border-border bg-muted/60 text-foreground/70",
        )}
      >
        <span className="flex min-w-0 items-center gap-2.5 font-bold">
          {entry.rank !== null && (
            <span
              className={cn(
                "akwaan-numeral inline-flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-black",
                isRevealed && identity
                  ? "bg-card/70"
                  : "bg-background text-muted-foreground",
              )}
            >
              {entry.rank}
            </span>
          )}
          <span className="truncate text-base">{entry.label}</span>
        </span>
        {isRevealed && (
          <span className="flex shrink-0 items-center gap-2">
            {/* Ownership is never colour alone: the owner is named next to it. */}
            <span className="hidden text-xs font-black opacity-80 sm:inline">
              {teamName(snapshot, owner)}
            </span>
            {entry.rank !== null && (
              // Traps take their owner's colour too, but only a real Top 5
              // entry pays — so only a real entry gets the +1 moment.
              <span
                className="akwaan-pop rounded-full bg-card/80 px-2 py-0.5 text-sm font-black"
                data-testid="top5-point-badge"
              >
                +1
              </span>
            )}
          </span>
        )}
      </li>
    );
  };

  const ranked = details.entries
    .filter((entry) => entry.rank !== null)
    .sort((left, right) => (left.rank ?? 0) - (right.rank ?? 0));
  const traps = details.entries.filter((entry) => entry.rank === null);

  const winnerIdentity = result.winnerTeamId
    ? identityByTeam.get(result.winnerTeamId)
    : undefined;

  return (
    <div className="space-y-6" data-testid="top5-result-reveal">
      {/* The two factual groups, in a fixed order. Only the ownership colour is
          shuffled; the ranked list stays 1..5 and the traps stay put. */}
      <div className="grid gap-5 md:grid-cols-2">
        <section className="space-y-2.5">
          <h2 className="flex items-baseline gap-2 text-lg font-black text-foreground">
            أفضل 5
            <span className="text-xs font-bold text-muted-foreground">
              المداخل الحقيقية
            </span>
          </h2>
          <ol className="space-y-2">{ranked.map(field)}</ol>
        </section>
        <section className="space-y-2.5">
          <h2 className="flex items-baseline gap-2 text-lg font-black text-foreground">
            الفخاخ
            <span className="text-xs font-bold text-muted-foreground">
              لا تُحتسب
            </span>
          </h2>
          <ul className="space-y-2">{traps.map(field)}</ul>
        </section>
      </div>

      <Separator />

      <ul
        className="flex list-none flex-wrap items-stretch justify-center gap-3"
        data-testid="top5-live-score"
      >
        {snapshot.teams.map((team) => {
          const identity = identityByTeam.get(team.id);
          return (
            <li
              key={team.id}
              className={cn(
                "min-w-[10rem] rounded-[var(--radius)] border px-5 py-3 text-center transition-colors duration-base ease-akwaan",
                identity?.surface,
                identity?.border,
              )}
            >
              <p
                className={cn(
                  "flex items-center justify-center gap-1.5 text-sm font-black",
                  identity?.text,
                )}
              >
                <span
                  aria-hidden
                  className={cn("size-2 rounded-full", identity?.dot)}
                />
                {team.name}
              </p>
              <p
                className="akwaan-numeral text-4xl font-black leading-tight text-foreground"
                data-testid={`top5-live-count-${team.id}`}
              >
                {liveTop5Counts.get(team.id) ?? 0}
              </p>
              <p className="text-[0.7rem] font-bold text-muted-foreground">
                من أفضل 5
              </p>
            </li>
          );
        })}
      </ul>

      {/* The winner is withheld until every field has turned. */}
      {complete && result.winnerTeamId && (
        <section
          className={cn(
            "akwaan-rise space-y-1.5 rounded-[var(--radius)] border-2 p-6 text-center",
            winnerIdentity?.surface,
            winnerIdentity?.border,
          )}
          data-testid="top5-winner"
        >
          <p className="text-3xl font-black text-foreground sm:text-4xl">
            فوز {teamName(snapshot, result.winnerTeamId)}
          </p>
          <p className={cn("text-sm font-bold", winnerIdentity?.text)}>
            <span className="akwaan-numeral">
              {details.top5Counts[result.winnerTeamId] ?? 0}
            </span>{" "}
            من أفضل 5
          </p>
          <p className="inline-flex items-center gap-1 rounded-full bg-card px-3 py-1 text-sm font-black text-success">
            <span className="akwaan-numeral">
              +
              {result.matchPoints.find(
                (entry) => entry.teamId === result.winnerTeamId,
              )?.points ?? 1}
            </span>{" "}
            نقطة للمباراة
          </p>
        </section>
      )}
    </div>
  );
}
