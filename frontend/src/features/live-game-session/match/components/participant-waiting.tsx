"use client";

import { Smartphone, Trophy } from "lucide-react";
import { FacePlanet } from "@/components/akwaan/state-card";
import { Spark } from "@/components/akwaan/sticker";
import { teamIdentityOf } from "@/lib/team-identity";
import { cn } from "@/lib/utils";
import { useLiveSession } from "../../hooks/live-session-context";
import { teamName } from "../presentation";
import type { MatchChallengeResult } from "../types";

/**
 * What a player's phone shows when it is not needed.
 *
 * A phone's whole lifecycle is waiting → preflight → gameplay → result/waiting,
 * and it never leaves the page it joined on: no redirect, no reload, and never
 * the host's board, which is a different device's screen. The socket stays open
 * underneath, so the next phone-required challenge simply replaces this screen.
 *
 * The result and the wait are deliberately one screen rather than two. A phone
 * has nothing to do between challenges, so a separate "result" page that the
 * player would have to dismiss would only be something else to get stuck on.
 */
export function ParticipantWaiting({
  teamName: joinedTeamName,
  teamId,
  matchComplete = false,
  challengeResult,
}: {
  teamName?: string;
  /** This phone's team, so the end of the Match can be told from its side. */
  teamId?: string;
  /** The Match is over; nothing further will start. */
  matchComplete?: boolean;
  /** The challenge that just finished, when one has. */
  challengeResult?: MatchChallengeResult;
}) {
  const { snapshot } = useLiveSession();
  const winnerName =
    challengeResult?.winnerTeamId && snapshot
      ? teamName(snapshot, challengeResult.winnerTeamId)
      : undefined;
  const winnerPoints = challengeResult?.matchPoints.find(
    (entry) => entry.teamId === challengeResult.winnerTeamId,
  )?.points;
  const winnerIdentity =
    challengeResult?.winnerTeamId && snapshot
      ? teamIdentityOf(challengeResult.winnerTeamId, snapshot.teams)
      : undefined;

  const match = snapshot?.match;
  // Told from this phone's side only when the Match published its result;
  // without one there is nothing to take a side on.
  if (matchComplete && snapshot && match?.result && teamId) {
    const totals = match.standings ?? match.scoring.matchTotals;
    const own = totals.find((entry) => entry.teamId === teamId);
    const other = totals.find((entry) => entry.teamId !== teamId);
    if (own && other) {
      return (
        <MatchEnd
          outcome={
            match.result.tie || !match.result.winnerTeamId
              ? "tie"
              : match.result.winnerTeamId === teamId
                ? "win"
                : "lose"
          }
          ownTotal={own.displayTotal}
          otherTotal={other.displayTotal}
          teamName={joinedTeamName}
          dot={teamIdentityOf(teamId, snapshot.teams).dot}
        />
      );
    }
  }

  // The state owns the phone rather than floating in it: it fills whatever the
  // shell leaves and centres inside that, so a player looking down sees a
  // composed screen instead of a small card stranded under the header.
  return (
    <section
      dir="rtl"
      data-testid="participant-waiting"
      data-match-complete={matchComplete ? "true" : "false"}
      data-showing-result={challengeResult ? "true" : "false"}
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-2 text-center"
    >
      {challengeResult && !matchComplete ? (
        <>
          {/* The moment, then the wait — one screen, read top to bottom, as the
              board draws it. Calm on purpose: a player can sit here for minutes
              between challenges, so nothing loops or pulses. */}
          <div className="relative">
            <Spark
              outlined
              fill="hsl(var(--brand-purple))"
              className="absolute -top-2.5 end-[-30px] size-[34px] rotate-12"
            />
            <Spark
              outlined
              fill="hsl(var(--brand-purple))"
              className="absolute bottom-0 start-[-24px] size-[22px] -rotate-12"
            />
            <span
              aria-hidden
              className="grid size-24 place-items-center rounded-full border-[3px] border-brand-navy bg-brand-gold shadow-[4px_5px_0_hsl(var(--brand-navy))]"
            >
              <Spark className="size-12" />
            </span>
          </div>
          <h1 className="font-display text-[34px] font-black text-brand-navy">
            انتهى التحدي
          </h1>
          {winnerName && (
            <p
              data-testid="participant-challenge-winner"
              // Gold: a point moved. Whose it is, is the dot.
              className="inline-flex min-h-[52px] items-center gap-2.5 rounded-full border-[3px] border-brand-navy bg-brand-gold px-[22px] text-[19px] font-extrabold text-brand-navy"
            >
              <span
                aria-hidden
                className={cn(
                  "size-4 rounded-full border-2 border-brand-navy",
                  winnerIdentity?.dot,
                )}
              />
              فاز {winnerName}
              {/* Only what the Match actually awarded. A challenge that granted
                  no point says nothing rather than inventing one. */}
              {winnerPoints ? (
                <span
                  className="akwaan-numeral"
                  data-testid="participant-challenge-points"
                >
                  <bdi dir="ltr">+{winnerPoints}</bdi> نقطة
                </span>
              ) : null}
            </p>
          )}
          {/* The hand-off: the result settles above, and the wait for the next
              challenge sits quietly under it behind a hairline. */}
          <span aria-hidden className="h-0.5 w-[70%] bg-brand-mist" />
          <p className="max-w-xs text-base leading-[1.8] text-brand-slate">
            بانتظار التحدي الجاي… بنفتحه لك هنا، خلّ جوالك معك.
          </p>
        </>
      ) : (
        <>
          {/* Match complete is deliberately a different mark and a different
              weight from a challenge result: the Match ending is the bigger
              moment, and a player must be able to tell them apart at a glance. */}
          <span
            aria-hidden
            className={cn(
              "grid place-items-center rounded-full border-[3px] border-brand-navy",
              matchComplete
                ? "size-20 bg-brand-gold shadow-[4px_5px_0_hsl(var(--brand-navy))]"
                : "size-16 bg-brand-lavender",
            )}
          >
            {matchComplete ? (
              <Trophy className="size-10 text-brand-navy" />
            ) : (
              <Smartphone className="size-7 text-brand-navy" />
            )}
          </span>
          <h1
            className={cn(
              "font-display font-black text-brand-navy",
              matchComplete ? "text-3xl" : "text-xl",
            )}
          >
            {matchComplete
              ? "انتهت المباراة"
              : "ما فيه تحدي يحتاج الجوال الحين"}
          </h1>
          <p className="max-w-xs text-sm leading-6 text-brand-slate">
            {matchComplete
              ? "تمام، ما تحتاجون تخلون الجوال مفتوح."
              : "بنفتح التحدي الجاي هنا. خلّ جوالك معك."}
          </p>
        </>
      )}
      {joinedTeamName && (
        <p className="text-[15px] font-bold text-brand-navy">
          أنت مع {joinedTeamName}
        </p>
      )}
    </section>
  );
}

const END_COPY = {
  win: {
    title: "فزتم بالمباراة!",
    line: "أبطال الأكوان الليلة. شوفوا الشاشة للتفاصيل.",
  },
  lose: {
    title: "راحت عليكم هالمرة",
    line: "شوفوا الشاشة للتفاصيل، والجولة الجاية لكم.",
  },
  tie: {
    title: "تعادل!",
    line: "ما أحد غلب أحد. الحسم في المباراة الجاية.",
  },
} as const;

/**
 * The end of the Match, told from this phone's side: won, lost or level, with
 * the two totals the Match itself published. Gold sits on the total that won —
 * both of them when nobody did.
 */
function MatchEnd({
  outcome,
  ownTotal,
  otherTotal,
  teamName,
  dot,
}: {
  outcome: "win" | "lose" | "tie";
  ownTotal: number | string;
  otherTotal: number | string;
  teamName?: string;
  dot?: string;
}) {
  const copy = END_COPY[outcome];
  const total = (label: string, value: number | string, gold: boolean) => (
    <div
      className={cn(
        "flex flex-1 flex-col items-center gap-0.5 rounded-2xl border-[3px] border-brand-navy p-2.5",
        gold ? "bg-brand-gold" : "bg-white",
      )}
    >
      <span className="text-[13px] font-bold">{label}</span>
      <span className="akwaan-numeral text-[44px] font-bold leading-[1.2]">
        {value}
      </span>
    </div>
  );
  return (
    <section
      dir="rtl"
      data-testid="participant-waiting"
      data-match-complete="true"
      data-match-outcome={outcome}
      data-showing-result="false"
      className={cn(
        "flex min-h-0 flex-1 flex-col items-center justify-center gap-4 rounded-[22px] border-[3px] border-brand-navy px-[18px] py-6 text-center text-brand-navy shadow-[5px_6px_0_hsl(var(--brand-navy))]",
        outcome === "lose" ? "bg-brand-paper" : "bg-brand-lavender",
      )}
    >
      {outcome === "win" ? (
        <span
          aria-hidden
          className="grid size-[110px] place-items-center rounded-full border-[3px] border-brand-navy bg-brand-gold shadow-[4px_5px_0_hsl(var(--brand-navy))]"
        >
          <Trophy className="size-14 text-brand-navy" />
        </span>
      ) : (
        <FacePlanet className="size-24" />
      )}
      <h1 className="font-display text-[34px] font-black leading-[1.4]">
        {copy.title}
      </h1>
      {teamName && (
        <p className="inline-flex min-h-[34px] items-center gap-2 rounded-full border-2 border-brand-navy bg-white px-3.5 text-sm font-bold">
          <span
            aria-hidden
            className={cn(
              "size-3 rounded-full border-2 border-brand-navy",
              dot,
            )}
          />
          أنت مع {teamName}
        </p>
      )}
      <div className="flex gap-2.5 self-stretch">
        {total("فريقكم", ownTotal, outcome !== "lose")}
        {total("الخصم", otherTotal, outcome !== "win")}
      </div>
      <p className="text-base leading-[1.8] text-brand-slate">{copy.line}</p>
    </section>
  );
}
