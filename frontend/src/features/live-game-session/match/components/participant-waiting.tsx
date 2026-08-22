"use client";

import { PartyPopper, Smartphone } from "lucide-react";
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

  return (
    <section
      dir="rtl"
      data-testid="participant-waiting"
      data-match-complete={matchComplete ? "true" : "false"}
      data-showing-result={challengeResult ? "true" : "false"}
      className="surface-card mx-auto mt-8 max-w-md space-y-3 p-8 text-center"
    >
      {challengeResult && !matchComplete ? (
        <>
          {/* Calm on purpose: a player can sit here for minutes between
              challenges, so nothing loops or pulses. */}
          <PartyPopper className="mx-auto size-8 text-brand-gold" aria-hidden />
          <h1 className="text-lg font-black text-foreground">انتهى التحدي</h1>
          {winnerName && (
            <p
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-base font-black",
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
              {winnerPoints ? (
                <span className="akwaan-numeral">+{winnerPoints} نقطة</span>
              ) : null}
            </p>
          )}
          <p className="text-sm leading-6 text-muted-foreground">
            بانتظار التحدي القادم…
            <br />
            سنفتح التحدي القادم هنا. أبقِ جوالك معك.
          </p>
        </>
      ) : (
        <>
          <Smartphone
            className="mx-auto size-8 text-muted-foreground"
            aria-hidden
          />
          <h1 className="text-lg font-black text-foreground">
            {matchComplete
              ? "انتهت المباراة"
              : "ما فيه تحدي يحتاج الجوال الحين"}
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
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
