"use client";

import { BidiText } from "@/components/akwaan/bidi-text";
import { teamName } from "../presentation";
import {
  ChallengeWinnerBanner,
  ResultRoundCard,
} from "./challenge-result-banner";
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

  return (
    <div className="space-y-5" data-testid="ryo-result-recap">
      {/* One card a round, read like three cards laid face up: the decision in
          the middle because it is what this challenge is about, a stamp for
          whether the answer landed, and the point along the bottom. The old
          list repeated every question in prose, which on a screen read from
          across a room nobody reads. */}
      <ol
        className="grid list-none gap-5 sm:grid-cols-2 lg:grid-cols-3"
        data-testid="ryo-result-items"
      >
        {items.map((item, index) => (
          <ResultRoundCard
            key={item.itemIndex ?? index}
            data-testid={`ryo-result-item-${index}`}
            round={index + 1}
            snapshot={snapshot}
            {...(item.prompt
              ? { question: <BidiText>{item.prompt}</BidiText> }
              : {})}
            stamp={{
              label: item.correct ? "جاوب صح" : "جاوب غلط",
              tone: item.correct ? "correct" : "wrong",
              testId: `ryo-result-stamp-${index}`,
            }}
            facts={[
              {
                // Whose answer it was, and what they sent.
                label: `إجابة ${
                  person(item.answererParticipantId) ||
                  teamName(snapshot, item.answeringTeamId)
                }`,
                value: <BidiText>{String(item.selectedAnswer ?? "—")}</BidiText>,
              },
              {
                label: "الإجابة الصحيحة",
                value: <BidiText>{String(item.correctAnswer ?? "—")}</BidiText>,
              },
              {
                // The decision is what this challenge is about, so the person
                // who made it is named with it.
                label: `قراءة ${
                  person(item.deciderParticipantId) ||
                  teamName(snapshot, item.opposingTeamId)
                }`,
                value: ryoDecisionRevealLabel(item.decision),
              },
            ]}
            points={item.mechanicPoints ?? []}
          />
        ))}
      </ol>

      {/* RYO's payoff matrix can genuinely tie, so a tie is stated rather than
          dressed up as a win for whoever happens to be listed first. The
          challenge's own signed totals and the one Match point are separate
          numbers, and the banner keeps them apart. */}
      <ChallengeWinnerBanner
        result={result}
        snapshot={snapshot}
        totals={mechanicTotals}
        testIds={{
          root: "ryo-result-winner",
          totals: "ryo-mechanic-totals",
          matchPoint: "ryo-match-point",
        }}
      />
    </div>
  );
}
