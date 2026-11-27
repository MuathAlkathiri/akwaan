"use client";

import { createContext, useContext } from "react";
import { cn } from "@/lib/utils";
import { teamIdentityOf } from "@/lib/team-identity";
import type { LiveSessionSnapshot } from "../../model";
import { teamName } from "../presentation";
import type { MatchChallengeResult } from "../types";

export interface ChallengeResultContinueAction {
  label: string;
  disabled?: boolean;
  onClick?: () => void;
  /** Decorative preview inside an explainer: identical appearance, never fires. */
  inert?: boolean;
}

export const ChallengeResultActionContext =
  createContext<ChallengeResultContinueAction | null>(null);

const signed = (value: number) => (value > 0 ? `+${value}` : String(value));

/**
 * The gold banner a finished challenge ends on, the same for every challenge:
 * who won it, what each team scored inside it, and — as its own line — the one
 * point that moves the Match.
 *
 * Gold because a point moved; the team is a dot beside its name and never a
 * surface. A tie is stated as a tie and is not gold, because nothing moved.
 */
export function ChallengeWinnerBanner({
  result,
  snapshot,
  totals,
  totalsUnit,
  testIds = {},
  className,
}: {
  result: MatchChallengeResult;
  snapshot: LiveSessionSnapshot;
  /** The challenge's own per-team score, when the mechanic keeps one. */
  totals?: Record<string, number>;
  /**
   * What a total counts, when it is a count and not a signed score: «من أفضل
   * 5». With a unit the number is shown plain, without a plus sign.
   */
  totalsUnit?: string;
  testIds?: { root?: string; totals?: string; matchPoint?: string };
  className?: string;
}) {
  const continueAction = useContext(ChallengeResultActionContext);
  const winnerId = result.winnerTeamId ?? undefined;
  const tied = !winnerId;
  const matchPoint =
    (result.matchPoints ?? []).find((entry) => entry.teamId === winnerId)
      ?.points ?? 1;
  return (
    <section
      data-testid={testIds.root ?? "challenge-winner-banner"}
      data-tie={tied ? "true" : "false"}
      className={cn(
        "akwaan-rise flex flex-wrap items-center justify-between gap-x-6 gap-y-4 rounded-3xl border-[3px] border-[hsl(var(--brand-navy))] px-7 py-[18px] text-[hsl(var(--brand-navy))] shadow-[7px_8px_0_hsl(var(--brand-navy))]",
        tied ? "bg-brand-lavender" : "bg-[hsl(var(--brand-gold))]",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="text-base font-semibold">نتيجة التحدي</p>
        <p className="inline-flex min-w-0 items-center gap-3 font-display text-3xl font-black lg:text-[40px]">
          {winnerId && (
            <span
              aria-hidden
              className={cn(
                "size-5 flex-none rounded-full border-2 border-[hsl(var(--brand-navy))]",
                teamIdentityOf(winnerId, snapshot.teams).dot,
              )}
            />
          )}
          <span className="truncate">
            {winnerId ? `فوز ${teamName(snapshot, winnerId)}` : "تعادل"}
          </span>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {totals && (
          <ul
            className="flex list-none flex-wrap items-center gap-3"
            data-testid={testIds.totals ?? "challenge-result-totals"}
          >
            {Object.entries(totals).map(([teamId, total]) => (
              <li
                key={teamId}
                className="inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-[hsl(var(--brand-navy))] bg-white px-4 text-[17px] font-bold"
              >
                <span
                  aria-hidden
                  className={cn(
                    "size-3.5 flex-none rounded-full border-2 border-[hsl(var(--brand-navy))]",
                    teamIdentityOf(teamId, snapshot.teams).dot,
                  )}
                />
                {teamName(snapshot, teamId)}
                <span dir="ltr" className="akwaan-numeral">
                  {totalsUnit ? total : signed(total)}
                </span>
                {totalsUnit}
              </li>
            ))}
          </ul>
        )}
        <p
          data-testid={testIds.matchPoint ?? "challenge-match-point"}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[hsl(var(--brand-navy))] px-[18px] text-[17px] font-extrabold text-white"
        >
          {tied ? (
            "لا نقطة مباراة، تعادل"
          ) : (
            <>
              <span dir="ltr" className="akwaan-numeral">
                +{matchPoint}
              </span>{" "}
              نقطة للمباراة
            </>
          )}
        </p>
      </div>
      {continueAction && (
        <button
          type="button"
          disabled={continueAction.disabled}
          onClick={continueAction.inert ? undefined : continueAction.onClick}
          data-testid={
            continueAction.inert
              ? "challenge-result-continue-preview"
              : "challenge-result-continue"
          }
          className="inline-flex min-h-[52px] shrink-0 items-center justify-center rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-navy))] px-7 font-display text-xl font-extrabold text-white transition-transform hover:-translate-y-0.5 disabled:opacity-60"
        >
          {continueAction.label}
        </button>
      )}
    </section>
  );
}

/**
 * One round of a finished challenge, laid face up.
 *
 * The approved result card: the round number and a stamp across the top, the
 * question kept short, each fact as a small label over a bold value, and the
 * point along the bottom — gold when a team gained it.
 */
export function ResultRoundCard({
  round,
  stamp,
  question,
  facts,
  points = [],
  snapshot,
  children,
  className,
  ...rest
}: {
  round: number;
  /** Green for a right answer, red for a wrong one. Nothing else is stamped. */
  stamp?: { label: string; tone: "correct" | "wrong"; testId?: string };
  question?: React.ReactNode;
  facts?: Array<{ label: string; value: React.ReactNode }>;
  points?: Array<{ teamId: string; points: number }>;
  snapshot: LiveSessionSnapshot;
  children?: React.ReactNode;
  className?: string;
  "data-testid"?: string;
}) {
  return (
    <li
      {...rest}
      className={cn(
        "flex min-w-0 flex-col gap-2.5 rounded-[20px] border-[3px] border-[hsl(var(--brand-navy))] bg-brand-paper px-5 py-[18px] text-[hsl(var(--brand-navy))] shadow-[5px_6px_0_hsl(var(--brand-navy))]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-base font-bold text-brand-slate">
          الجولة <span className="akwaan-numeral">{round}</span>
        </span>
        {stamp && (
          <span
            data-testid={stamp.testId}
            className={cn(
              // A stamp is a sticker: mint or coral fill, navy line, navy words.
              "inline-flex min-h-[30px] -rotate-6 items-center rounded-[10px] border-[3px] border-brand-navy px-3 text-[15px] font-extrabold text-sem-reveal-foreground",
              stamp.tone === "correct" ? "bg-sem-success" : "bg-sem-error",
            )}
          >
            {stamp.label}
          </span>
        )}
      </div>
      {question && (
        <p className="text-[17px] font-semibold leading-relaxed line-clamp-3">
          {question}
        </p>
      )}
      {facts?.map((fact) => (
        <div key={fact.label} className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[13px] text-brand-slate">{fact.label}</span>
          <span className="break-words text-xl font-bold">{fact.value}</span>
        </div>
      ))}
      {children}
      <div className="mt-auto flex flex-col gap-2 pt-1">
        {points
          .filter((entry) => entry.points !== 0)
          .map((entry) => (
            <p
              key={entry.teamId}
              className={cn(
                "inline-flex min-h-11 items-center justify-center gap-2.5 rounded-full border-[3px] border-[hsl(var(--brand-navy))] px-3 text-[17px] font-extrabold",
                entry.points > 0 ? "bg-[hsl(var(--brand-gold))]" : "bg-white",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "size-3.5 flex-none rounded-full border-2 border-[hsl(var(--brand-navy))]",
                  teamIdentityOf(entry.teamId, snapshot.teams).dot,
                )}
              />
              {teamName(snapshot, entry.teamId)}
              <span dir="ltr" className="akwaan-numeral">
                {signed(entry.points)}
              </span>
            </p>
          ))}
      </div>
    </li>
  );
}
