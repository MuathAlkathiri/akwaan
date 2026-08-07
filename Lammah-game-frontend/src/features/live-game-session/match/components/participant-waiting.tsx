"use client";

import { PartyPopper, Smartphone } from "lucide-react";
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
  const winnerPoints = challengeResult?.teamPoints.find(
    (entry) => entry.teamId === challengeResult.winnerTeamId,
  )?.points;

  return (
    <section
      dir="rtl"
      data-testid="participant-waiting"
      data-match-complete={matchComplete ? "true" : "false"}
      data-showing-result={challengeResult ? "true" : "false"}
      className="mx-auto max-w-md space-y-3 rounded-2xl border border-black/[0.06] bg-white p-8 text-center"
    >
      {challengeResult && !matchComplete ? (
        <>
          <PartyPopper className="mx-auto size-8 text-violet-500" aria-hidden />
          <h1 className="text-lg font-black text-slate-900">انتهى التحدي 🎉</h1>
          {winnerName && (
            <p className="text-base font-black text-slate-800">
              فاز {winnerName}
              {winnerPoints ? ` · +${winnerPoints} نقطة` : ""}
            </p>
          )}
          <p className="text-sm leading-6 text-slate-500">
            بانتظار التحدي القادم…
            <br />
            سيتم تحديث الصفحة تلقائياً عند بدء تحدٍ يحتاج الجوال.
          </p>
        </>
      ) : (
        <>
          <Smartphone className="mx-auto size-8 text-slate-400" aria-hidden />
          <h1 className="text-lg font-black text-slate-900">
            {matchComplete
              ? "انتهت المباراة"
              : "لا يوجد تحدٍ يحتاج الجوال حالياً"}
          </h1>
          <p className="text-sm leading-6 text-slate-500">
            {matchComplete
              ? "شكرًا لكم. لا حاجة لإبقاء الجوال مفتوحًا."
              : "سيتم تحديث الصفحة تلقائياً عند بدء التحدي التالي."}
          </p>
        </>
      )}
      {joinedTeamName && (
        <p className="text-sm font-bold text-slate-600">
          أنت مع فريق {joinedTeamName}
        </p>
      )}
    </section>
  );
}
