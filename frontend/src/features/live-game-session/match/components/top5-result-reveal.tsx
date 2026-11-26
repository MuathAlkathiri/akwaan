"use client";

import { ChallengeWinnerBanner } from "./challenge-result-banner";
import { useEffect, useMemo, useState } from "react";
import { teamIdentityOf } from "@/lib/team-identity";
import { cn } from "@/lib/utils";
import { teamName } from "../presentation";
import type { LiveSessionSnapshot } from "../../model";
import type { MatchChallengeResult } from "../types";

/**
 * How long one card stays face up before the next is turned.
 *
 * Named so the pace can be tuned in one place. The reveal is suspense, not
 * information: every value it walks through was already decided and persisted
 * by the server, so changing this number cannot change a result.
 */
export const TOP5_REVEAL_STEP_MS = 1800;

export interface Top5ResultDetails {
  title?: string;
  rankingBasis?: string;
  sourceLabel?: string;
  entries: Array<{ id: string; label: string; rank: number | null }>;
  ownership: Array<{
    entryId: string;
    ownerTeamId: string;
    /** Deal order, from 0. Absent on a record written before it was kept. */
    turn?: number;
    /** The team that decided. It differs from the owner when the card was given. */
    actingTeamId?: string;
    action?: string;
  }>;
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

/** «نقطة», «نقطتين», «3 نقاط» — never «2 نقاط». */
function pointsLabel(count: number) {
  if (count === 1) return "نقطة";
  if (count === 2) return "نقطتين";
  return `${count} نقاط`;
}

/**
 * The Top 5 reveal — the screen this challenge is played for.
 *
 * Each team's cards sit in its own column, and every card says how the team
 * came to hold it: they kept it, or the other side slipped it to them. Then the
 * cards are turned over one at a time, in the order they were dealt, and each
 * one that really is in the top 5 pays its holder a point.
 *
 * Nothing here decides anything. The owner, the rank and the winner are the
 * server's record; this component only chooses when to show them.
 */
export function Top5ResultReveal({
  result,
  snapshot,
  stepMs = TOP5_REVEAL_STEP_MS,
}: {
  result: MatchChallengeResult;
  snapshot: LiveSessionSnapshot;
  /** Overridable so a test does not have to wait for every card. */
  stepMs?: number;
}) {
  const details = useMemo(
    () => parseTop5Details(result.details),
    [result.details],
  );
  const [revealedCount, setRevealedCount] = useState(0);

  // The cards in the order they were dealt. A record without a turn keeps the
  // position the server listed it in, which is the same order.
  const dealt = useMemo(() => {
    if (!details) return [];
    const entryById = new Map(
      details.entries.map((entry) => [entry.id, entry]),
    );
    return details.ownership
      .map((record, index) => ({ record, order: record.turn ?? index }))
      .sort((left, right) => left.order - right.order)
      .flatMap(({ record }, index) => {
        const entry = entryById.get(record.entryId);
        if (!entry) return [];
        return [
          {
            id: entry.id,
            label: entry.label,
            rank: entry.rank,
            cardNumber: index + 1,
            ownerTeamId: record.ownerTeamId,
            // Given, when the team that decided is not the team that holds it.
            givenByTeamId:
              record.actingTeamId && record.actingTeamId !== record.ownerTeamId
                ? record.actingTeamId
                : undefined,
          },
        ];
      });
  }, [details]);

  const total = dealt.length;
  useEffect(() => {
    // Restart whenever a different challenge's result arrives, so a second
    // Top 5 in the same Match replays from the first card.
    setRevealedCount(0);
  }, [result.id]);
  useEffect(() => {
    if (revealedCount >= total) return;
    const timer = setTimeout(
      () => setRevealedCount((count) => count + 1),
      stepMs,
    );
    return () => clearTimeout(timer);
  }, [revealedCount, total, stepMs]);

  if (!details) {
    return (
      <p
        role="alert"
        data-testid="top5-result-unreadable"
        className="rounded-[18px] border-[3px] border-[hsl(var(--brand-navy))] bg-brand-coral-tint p-4 text-base font-bold text-[hsl(var(--brand-navy))]"
      >
        ما قدرنا نعرض تفاصيل نتيجة توب 5.
      </p>
    );
  }

  const complete = revealedCount >= total;
  const teams = snapshot.teams.filter((team) => team.active !== false);

  return (
    <div className="space-y-4" data-testid="top5-result-reveal">
      <p
        data-testid="top5-reveal-step"
        className="mx-auto flex w-fit min-h-9 items-center rounded-full border-2 border-[hsl(var(--brand-navy))] bg-white px-4 text-[15px] font-bold text-[hsl(var(--brand-navy))]"
      >
        {complete
          ? "انكشفت كل البطاقات"
          : `الكشف · البطاقة ${Math.min(revealedCount + 1, total)} من ${total}`}
      </p>

      <div className="grid gap-5 md:grid-cols-2">
        {teams.map((team) => {
          const identity = teamIdentityOf(team.id, snapshot.teams);
          const cards = dealt.filter((card) => card.ownerTeamId === team.id);
          const points = cards.filter(
            (card) => card.rank !== null && card.cardNumber <= revealedCount,
          ).length;
          return (
            <section
              key={team.id}
              data-testid={`top5-team-column-${team.id}`}
              className="flex min-w-0 flex-col gap-2 rounded-[24px] border-[3px] border-[hsl(var(--brand-navy))] bg-brand-paper px-4 py-3.5 text-[hsl(var(--brand-navy))]"
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="inline-flex min-w-0 items-center gap-2 font-display text-xl font-black lg:text-[22px]">
                  <span
                    aria-hidden
                    className={cn(
                      "size-4 flex-none rounded-full border-2 border-[hsl(var(--brand-navy))]",
                      identity.dot,
                    )}
                  />
                  بطاقات {team.name}
                </h2>
                <span
                  data-testid={`top5-live-count-${team.id}`}
                  data-count={points}
                  className="inline-flex min-h-9 shrink-0 items-center rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))] px-3.5 text-lg font-extrabold"
                >
                  {pointsLabel(points)}
                </span>
              </div>
              <ul className="flex list-none flex-col gap-[7px]">
                {cards.map((card) => {
                  const revealed = card.cardNumber <= revealedCount;
                  const turning =
                    card.cardNumber === revealedCount && !complete;
                  const inTop5 = card.rank !== null;
                  return (
                    <li
                      key={card.id}
                      data-testid={`top5-field-${card.id}`}
                      data-revealed={revealed ? "true" : "false"}
                      data-in-top5={revealed ? String(inTop5) : ""}
                      data-owner-team={card.ownerTeamId}
                      className={cn(
                        "flex flex-col gap-1.5 rounded-2xl px-3.5 py-2 transition-all duration-slow ease-akwaan",
                        !revealed &&
                          "border-2 border-dashed border-brand-dash bg-white",
                        revealed &&
                          "border-[3px] border-[hsl(var(--brand-navy))]",
                        revealed &&
                          (inTop5
                            ? "bg-brand-mint-tint"
                            : "bg-brand-coral-tint"),
                        // The card being turned over right now.
                        turning &&
                          "-rotate-1 shadow-[5px_6px_0_hsl(var(--brand-navy))]",
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          aria-label={`البطاقة ${card.cardNumber}`}
                          className="akwaan-numeral inline-flex size-[30px] flex-none items-center justify-center rounded-full bg-[hsl(var(--brand-navy))] text-sm font-bold text-white"
                        >
                          {card.cardNumber}
                        </span>
                        <span className="min-w-0 flex-1 font-display text-lg font-extrabold [overflow-wrap:anywhere] lg:text-[21px]">
                          {card.label}
                        </span>
                        {/* How the team came to hold it: where the teasing is. */}
                        {card.givenByTeamId ? (
                          <span
                            data-testid="top5-card-given"
                            className="inline-flex min-h-7 shrink-0 items-center rounded-full border-2 border-dashed border-brand-plum bg-brand-wash px-2.5 text-[13px] font-extrabold text-brand-plum"
                          >
                            دسّها عليهم {teamName(snapshot, card.givenByTeamId)}
                          </span>
                        ) : (
                          <span
                            data-testid="top5-card-kept"
                            className="inline-flex min-h-7 shrink-0 items-center rounded-full border-2 border-[hsl(var(--brand-navy))] bg-white px-2.5 text-[13px] font-bold"
                          >
                            احتفظوا فيها
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ps-10">
                        {!revealed ? (
                          <span className="inline-flex min-h-[30px] items-center rounded-full border-2 border-dashed border-brand-dash px-3.5 text-sm font-bold text-brand-plum">
                            ما انكشفت
                          </span>
                        ) : inTop5 ? (
                          <>
                            <span className="inline-flex min-h-[30px] items-center gap-1.5 rounded-full border-2 border-[hsl(var(--brand-navy))] bg-brand-mint px-3 text-sm font-extrabold">
                              ✓ من التوب 5 · المركز{" "}
                              <span className="akwaan-numeral">
                                {card.rank}
                              </span>
                            </span>
                            <span
                              dir="ltr"
                              data-testid="top5-point-badge"
                              className="akwaan-pop akwaan-numeral inline-flex min-h-[30px] items-center rounded-full border-2 border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))] px-3 text-[15px] font-extrabold"
                            >
                              +1
                            </span>
                          </>
                        ) : (
                          <span className="inline-flex min-h-[30px] items-center gap-1.5 rounded-full border-2 border-[hsl(var(--brand-navy))] bg-brand-coral px-3 text-sm font-extrabold">
                            ✗ برا التوب 5
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      {!complete && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-[18px] border-[3px] border-[hsl(var(--brand-navy))] bg-brand-lavender px-5 py-2.5 text-[17px] font-bold text-[hsl(var(--brand-navy))]">
          <span>الكشف يمشي بنفس ترتيب ظهور البطاقات، وحدة وحدة.</span>
          <span className="text-brand-slate">
            الجاية: البطاقة{" "}
            <span className="akwaan-numeral">
              {Math.min(revealedCount + 1, total)}
            </span>
          </span>
        </div>
      )}

      {/* The winner is withheld until the last card has been turned. */}
      {complete && result.winnerTeamId && (
        <ChallengeWinnerBanner
          className="akwaan-rise"
          result={result}
          snapshot={snapshot}
          testIds={{ root: "top5-winner" }}
        />
      )}
    </div>
  );
}
