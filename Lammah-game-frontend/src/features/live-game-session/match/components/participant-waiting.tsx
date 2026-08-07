"use client";

import { Smartphone } from "lucide-react";

/**
 * What a player's phone shows when it is not needed.
 *
 * A phone's whole lifecycle is waiting → preflight → gameplay → waiting, and it
 * never leaves the page it joined on: no redirect, no reload, and never the
 * host's board, which is a different device's screen. The socket stays open
 * underneath, so the next phone-required challenge simply replaces this screen.
 */
export function ParticipantWaiting({
  teamName,
  matchComplete = false,
}: {
  teamName?: string;
  /** The Match is over; nothing further will start. */
  matchComplete?: boolean;
}) {
  return (
    <section
      dir="rtl"
      data-testid="participant-waiting"
      data-match-complete={matchComplete ? "true" : "false"}
      className="mx-auto max-w-md space-y-3 rounded-2xl border border-black/[0.06] bg-white p-8 text-center"
    >
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
      {teamName && (
        <p className="text-sm font-bold text-slate-600">
          أنت مع فريق {teamName}
        </p>
      )}
    </section>
  );
}
