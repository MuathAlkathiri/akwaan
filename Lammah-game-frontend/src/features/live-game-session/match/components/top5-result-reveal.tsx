"use client";

import { useEffect, useMemo, useState } from "react";
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

/** The two team colours the reveal paints ownership with. */
const TEAM_TONES = [
  {
    field: "border-violet-400 bg-violet-100 text-violet-900",
    dot: "bg-violet-500",
    text: "text-violet-700",
  },
  {
    field: "border-emerald-400 bg-emerald-100 text-emerald-900",
    dot: "bg-emerald-500",
    text: "text-emerald-700",
  },
] as const;

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

  const toneByTeam = useMemo(() => {
    const tones = new Map<string, (typeof TEAM_TONES)[number]>();
    snapshot.teams.forEach((team, index) => {
      tones.set(team.id, TEAM_TONES[index % TEAM_TONES.length]);
    });
    return tones;
  }, [snapshot.teams]);

  if (!details) {
    return (
      <p role="alert" data-testid="top5-result-unreadable" className="text-sm">
        تعذّر قراءة تفاصيل نتيجة أفضل 5 من الخادم.
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
    const tone = owner ? toneByTeam.get(owner) : undefined;
    const isRevealed = revealed.has(entry.id);
    return (
      <li
        key={entry.id}
        data-testid={`top5-field-${entry.id}`}
        data-revealed={isRevealed ? "true" : "false"}
        data-owner-team={isRevealed ? (owner ?? "") : ""}
        className={`flex items-center justify-between gap-3 rounded-xl border-2 px-4 py-3 transition-colors duration-500 ${
          isRevealed && tone
            ? tone.field
            : "border-slate-200 bg-slate-50 text-slate-700"
        }`}
      >
        <span className="flex items-center gap-2 font-bold">
          {entry.rank !== null && (
            <span className="tabular-nums text-slate-500">{entry.rank}.</span>
          )}
          {entry.label}
        </span>
        {isRevealed && entry.rank !== null && (
          // Traps light up too, but only a real Top 5 entry pays.
          <span className="text-sm font-black" data-testid="top5-point-badge">
            +1
          </span>
        )}
      </li>
    );
  };

  const ranked = details.entries
    .filter((entry) => entry.rank !== null)
    .sort((left, right) => (left.rank ?? 0) - (right.rank ?? 0));
  const traps = details.entries.filter((entry) => entry.rank === null);

  return (
    <div className="space-y-6" data-testid="top5-result-reveal">
      <div className="grid gap-4 md:grid-cols-2">
        <section className="space-y-2">
          <h2 className="text-lg font-black text-slate-900">أفضل 5</h2>
          <ol className="space-y-2">{ranked.map(field)}</ol>
        </section>
        <section className="space-y-2">
          <h2 className="text-lg font-black text-slate-900">الفخاخ</h2>
          <ul className="space-y-2">{traps.map(field)}</ul>
        </section>
      </div>

      <ul
        className="flex list-none flex-wrap items-center justify-center gap-8"
        data-testid="top5-live-score"
      >
        {snapshot.teams.map((team) => (
          <li key={team.id} className="text-center">
            <p className={`text-sm font-bold ${toneByTeam.get(team.id)?.text ?? ""}`}>
              {team.name}
            </p>
            <p
              className="text-3xl font-black tabular-nums"
              data-testid={`top5-live-count-${team.id}`}
            >
              {liveTop5Counts.get(team.id) ?? 0}
            </p>
          </li>
        ))}
      </ul>

      {/* The winner is withheld until every field has turned. */}
      {complete && result.winnerTeamId && (
        <section
          className="space-y-1 rounded-2xl bg-slate-900 p-6 text-center text-white"
          data-testid="top5-winner"
        >
          <p className="text-2xl font-black">
            🏆 فوز {teamName(snapshot, result.winnerTeamId)}
          </p>
          <p className="text-sm text-slate-200">
            {details.top5Counts[result.winnerTeamId] ?? 0} من أفضل 5
          </p>
          <p className="text-sm font-black text-emerald-300">
            +
            {result.teamPoints.find(
              (entry) => entry.teamId === result.winnerTeamId,
            )?.points ?? 1}{" "}
            نقطة للمباراة
          </p>
        </section>
      )}
    </div>
  );
}
