"use client";

import { PartyPopper, Smartphone, Trophy } from "lucide-react";
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
  matchComplete = false,
  challengeResult,
}: {
  teamName?: string;
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
          {/* The moment, then the wait — one screen, read top to bottom. Calm on
              purpose: a player can sit here for minutes between challenges, so
              nothing loops or pulses. */}
          <span
            aria-hidden
            className="grid size-16 place-items-center rounded-full border border-brand-gold/40 bg-brand-gold/10"
          >
            <PartyPopper className="size-8 text-brand-gold" />
          </span>
          <h1 className="text-xl font-black text-foreground">انتهى التحدي</h1>
          {winnerName && (
            <p
              data-testid="participant-challenge-winner"
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-base font-black",
                winnerIdentity?.surface,
                winnerIdentity?.border,
                winnerIdentity?.text,
              )}
            >
              <span
                aria-hidden
                className={cn("size-2 rounded-full", winnerIdentity?.dot)}
              />
              فاز {winnerName}
              {/* Only what the Match actually awarded. A challenge that granted
                  no point says nothing rather than inventing one. */}
              {winnerPoints ? (
                <span
                  className="akwaan-numeral"
                  data-testid="participant-challenge-points"
                >
                  +{winnerPoints} نقطة
                </span>
              ) : null}
            </p>
          )}
          {/* The hand-off: the result settles above, and the wait for the next
              challenge sits quietly under it behind a hairline. */}
          <p className="mt-2 w-full max-w-xs border-t border-border/70 pt-3 text-sm leading-6 text-muted-foreground">
            بانتظار التحدي القادم…
            <br />
            سنفتح التحدي القادم هنا. أبقِ جوالك معك.
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
              "grid place-items-center rounded-full border",
              matchComplete
                ? "size-20 border-brand-gold/50 bg-brand-gold/12"
                : "size-14 border-border bg-muted/50",
            )}
          >
            {matchComplete ? (
              <Trophy className="size-10 text-brand-gold" />
            ) : (
              <Smartphone className="size-7 text-muted-foreground" />
            )}
          </span>
          <h1
            className={cn(
              "font-black text-foreground",
              matchComplete ? "text-2xl" : "text-lg",
            )}
          >
            {matchComplete
              ? "انتهت المباراة"
              : "ما فيه تحدي يحتاج الجوال الحين"}
          </h1>
          <p className="max-w-xs text-sm leading-6 text-muted-foreground">
            {matchComplete
              ? "تمام، ما تحتاجون تخلون الجوال مفتوح."
              : "بنفتح التحدي الجاي هنا. خلّ جوالك معك."}
          </p>
        </>
      )}
      {joinedTeamName && (
        <p className="text-sm font-bold text-muted-foreground">
          أنت مع فريق {joinedTeamName}
        </p>
      )}
    </section>
  );
}
