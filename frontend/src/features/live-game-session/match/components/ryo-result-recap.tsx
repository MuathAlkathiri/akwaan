"use client";

import { BidiText } from "@/components/akwaan/bidi-text";
import { Separator } from "@/components/ui/separator";
import { teamIdentityOf } from "@/lib/team-identity";
import { cn } from "@/lib/utils";
import { teamName } from "../presentation";
import { HelpCircle, Swords } from "lucide-react";
import { ryoDecisionRevealLabel } from "../ryo-decision.presentation";
import type { LiveSessionSnapshot } from "../../model";
import type { MatchChallengeResult } from "../types";

/**
 * One RYO item, as the server recorded it.
 *
 * All three interactions are here — the answer, whether it was right, and the
 * opposing team's blind Trust/Steal — plus the two participants who were
 * authoritative for them. That last part is new: "team B stole" is much less
 * interesting than "Khaled stole".
 */
export interface RyoResultItem {
  itemIndex?: number;
  prompt?: string;
  answeringTeamId?: string;
  answererParticipantId?: string;
  selectedAnswer?: string | number | null;
  correctAnswer?: string | number | null;
  correct?: boolean;
  opposingTeamId?: string;
  deciderParticipantId?: string;
  decision?: "trust" | "steal" | string;
  /**
   * The signed payoff this interaction moved *inside the mechanic*. Not a Match
   * point: RYO's three items can swing ±1 each, and the Match still only ever
   * receives one point for whoever won the challenge overall.
   */
  mechanicPoints?: Array<{ teamId: string; points: number }>;
}

export interface RyoResultDetails {
  itemsPlayed?: number;
  items?: RyoResultItem[];
  /** The challenge's own signed totals, e.g. `{ teamA: 2, teamB: -1 }`. */
  mechanicTotals?: Record<string, number>;
  tie?: boolean;
}

/**
 * The three-item recap.
 *
 * Read-only and entirely server-sourced: the winner comes from the record, and
 * the per-item points come from the events the challenge already minted.
 */
export function RyoResultRecap({
  result,
  snapshot,
}: {
  result: MatchChallengeResult;
  snapshot: LiveSessionSnapshot;
}) {
  const details = result.details as RyoResultDetails | undefined;
  const items = details?.items ?? [];
  const person = (participantId?: string) =>
    snapshot.participants.find((candidate) => candidate.id === participantId)
      ?.displayName;
  // The mechanic's own totals, derived from the per-item payoffs when the
  // server did not persist them (a result recorded before normalisation).
  const mechanicTotals: Record<string, number> =
    details?.mechanicTotals ??
    items.reduce<Record<string, number>>((totals, item) => {
      for (const entry of item.mechanicPoints ?? []) {
        totals[entry.teamId] = (totals[entry.teamId] ?? 0) + entry.points;
      }
      return totals;
    }, {});
  const winnerIdentity = result.winnerTeamId
    ? teamIdentityOf(result.winnerTeamId, snapshot.teams)
    : undefined;

  return (
    <div className="space-y-5" data-testid="ryo-result-recap">
      {/* One card a round, read like three cards laid face up: the decision in
          the middle because it is what this challenge is about, a stamp for
          whether the answer landed, and the point along the bottom. The old
          list repeated every question in prose, which on a screen read from
          across a room nobody reads. */}
      <ol
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        data-testid="ryo-result-items"
      >
        {items.map((item, index) => {
          const DecisionIcon = item.decision === "steal" ? Swords : HelpCircle;
          return (
            <li
              key={item.itemIndex ?? index}
              data-testid={`ryo-result-item-${index}`}
              className="relative flex flex-col items-center gap-3 overflow-hidden rounded-[var(--radius)] border-2 border-brand-navy bg-card p-4 text-center shadow-[0_5px_0_hsl(var(--brand-navy))]"
            >
              <span
                data-testid={`ryo-result-stamp-${index}`}
                className={cn(
                  "absolute end-3 top-3 rotate-[-12deg] rounded-md border-4 border-double px-2 py-0.5 text-xs font-black",
                  item.correct
                    ? "border-[hsl(var(--sem-success))] text-[hsl(var(--sem-success))]"
                    : "border-[hsl(var(--sem-error))] text-[hsl(var(--sem-error))]",
                )}
              >
                {item.correct ? "جاوب صح" : "جاوب غلط"}
              </span>
              <p className="self-start text-xs font-black text-muted-foreground">
                الجولة {index + 1}
              </p>
              <span
                aria-hidden
                className="grid size-16 place-items-center rounded-full border-2 border-brand-navy bg-muted"
              >
                <DecisionIcon className="size-8" />
              </span>
              <div>
                <p className="text-lg font-black text-foreground">
                  {ryoDecisionRevealLabel(item.decision)}
                </p>
                {/* Whose read it was. The decision is this card's subject, so
                    the person who made it belongs with it and not in a line
                    somewhere else. */}
                <p className="mt-0.5 text-xs font-bold text-muted-foreground">
                  {person(item.deciderParticipantId) ||
                    teamName(snapshot, item.opposingTeamId)}
                </p>
              </div>
              <div className="w-full border-t border-border pt-3 text-sm">
                <p className="font-black text-foreground">
                  {person(item.answererParticipantId) ||
                    teamName(snapshot, item.answeringTeamId)}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {item.correct ? (
                    <BidiText>{String(item.selectedAnswer ?? "—")}</BidiText>
                  ) : (
                    <>
                      {"الصحيح: "}
                      <BidiText>{String(item.correctAnswer ?? "—")}</BidiText>
                    </>
                  )}
                </p>
              </div>
              {(item.mechanicPoints ?? [])
                .filter((entry) => entry.points !== 0)
                .map((entry) => {
                  const identity = teamIdentityOf(entry.teamId, snapshot.teams);
                  return (
                    <p
                      key={entry.teamId}
                      className={cn(
                        "mt-auto inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius)] border-2 border-brand-navy px-2 py-1.5 text-sm font-black text-brand-navy",
                        entry.points > 0 ? "bg-brand-gold" : "bg-muted",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "size-2.5 rounded-full border border-brand-navy",
                          identity.solid,
                        )}
                      />
                      {teamName(snapshot, entry.teamId)}
                      <span className="akwaan-numeral">
                        {entry.points > 0 ? `+${entry.points}` : entry.points}
                      </span>
                    </p>
                  );
                })}
            </li>
          );
        })}
      </ol>

      <Separator />

      {/* RYO's payoff matrix can genuinely tie, so a tie is stated rather than
          dressed up as a win for whoever happens to be listed first. */}
      <section
        className={cn(
          "akwaan-rise space-y-2 rounded-[var(--radius)] border-2 p-6 text-center",
          winnerIdentity
            ? cn(winnerIdentity.surface, winnerIdentity.border)
            : "border-border bg-muted",
        )}
        data-testid="ryo-result-winner"
        data-tie={result.winnerTeamId ? "false" : "true"}
      >
        <p className="text-2xl font-black text-foreground sm:text-3xl">
          {result.winnerTeamId
            ? `فوز ${teamName(snapshot, result.winnerTeamId)}`
            : "تعادل في هذا التحدي"}
        </p>
        {/* The challenge's own signed totals — the thing the three items above
            actually add up to. Deliberately labelled as the challenge result,
            because the Match point below is a different number entirely. */}
        <p className="text-xs font-bold text-muted-foreground">
          نتيجة التحدي
        </p>
        <ul
          className="flex list-none flex-wrap justify-center gap-2"
          data-testid="ryo-mechanic-totals"
        >
          {Object.entries(mechanicTotals).map(([teamId, total]) => {
            const identity = teamIdentityOf(teamId, snapshot.teams);
            return (
              <li
                key={teamId}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-sm font-black",
                  identity.border,
                  identity.text,
                )}
              >
                <span
                  aria-hidden
                  className={cn("size-2 rounded-full", identity.dot)}
                />
                {teamName(snapshot, teamId)}
                <span className="akwaan-numeral">
                  {total > 0 ? `+${total}` : total}
                </span>
              </li>
            );
          })}
        </ul>

        {/* And the one line that actually moves the Match. */}
        <p
          className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-sm font-black text-success"
          data-testid="ryo-match-point"
        >
          {result.tie ? (
            "لا نقطة مباراة — تعادل"
          ) : (
            <>
              <span className="akwaan-numeral">
                +
                {result.matchPoints.find(
                  (entry) => entry.teamId === result.winnerTeamId,
                )?.points ?? 1}
              </span>{" "}
              نقطة للمباراة
            </>
          )}
        </p>
      </section>
    </div>
  );
}
