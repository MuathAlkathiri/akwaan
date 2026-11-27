"use client";

import { BookOpen } from "lucide-react";
import { Spark, STICKER } from "@/components/akwaan/sticker";
import { cn } from "@/lib/utils";

/**
 * The pre-challenge screen when the explainer is not playing.
 *
 * The room has met this challenge before, or there is no example to play, and
 * the screen still belongs to the challenge that is about to start: the same
 * lavender card the scene lives in, with the challenge named, its one line, and
 * the way back to the rules. Without it the page is a band, a stray button and a
 * lot of nothing.
 */
export function ExplainerClosed({
  challengeName,
  line,
  onReplay,
  note,
}: {
  challengeName: string;
  /** The challenge's own line, when the content has one. */
  line?: string;
  /** Absent when there is no explainer to replay. */
  onReplay?: () => void;
  /** A quiet line for the host: why there is nothing to watch. */
  note?: string;
}) {
  return (
    <section
      dir="rtl"
      data-testid="explainer-closed"
      className={cn(
        "flex min-h-[320px] flex-1 flex-col items-center justify-center gap-5 rounded-[26px] bg-brand-lavender px-8 py-9 text-center",
        STICKER.base,
      )}
    >
      <span
        aria-hidden
        className="grid size-24 place-items-center rounded-full border-[3px] border-brand-navy bg-brand-gold shadow-[4px_5px_0_hsl(var(--brand-navy))]"
      >
        <Spark className="size-12" />
      </span>
      <h2 className="font-display text-[34px] font-black leading-[1.3] text-brand-navy">
        {challengeName}
      </h2>
      <p className="max-w-[46rem] text-lg font-semibold leading-[1.8] text-brand-slate">
        {line ?? "جاهزين؟ اضغطوا «ابدأ التحدي» من الشاشة الرئيسية."}
      </p>
      {note && (
        <p
          role="status"
          className="text-sm font-bold text-brand-slate"
          data-testid="explainer-closed-note"
        >
          {note}
        </p>
      )}
      {onReplay && (
        <button
          type="button"
          data-testid="explainer-replay"
          onClick={onReplay}
          className="inline-flex min-h-[60px] items-center gap-2.5 rounded-full border-[3px] border-brand-navy bg-white px-7 font-display text-xl font-extrabold text-brand-navy shadow-[4px_5px_0_hsl(var(--brand-navy))] transition-transform hover:-translate-y-0.5"
        >
          <BookOpen className="size-5" aria-hidden />
          ذكّرني بالقواعد
        </button>
      )}
    </section>
  );
}
