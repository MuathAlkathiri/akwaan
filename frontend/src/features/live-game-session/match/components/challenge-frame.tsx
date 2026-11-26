"use client";

import { createContext, useContext } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

/**
 * Where a challenge's progress goes when the shared screen has a context strip.
 *
 * The approved question screen puts «السؤال 1 من 3» and its dashes in the navy
 * strip, beside the challenge's name. The strip belongs to the Match stage and
 * the progress belongs to the mechanic, so the stage lends the frame a place in
 * it. With no strip around it — an explainer, a test, a phone — the frame draws
 * its progress inside its own card.
 */
export const ChallengeStripSlotContext = createContext<HTMLElement | null>(
  null,
);

/** «السؤال 2 من 3» → { current: 2, total: 3 }, when the label counts. */
function countOf(label: string | undefined) {
  const match = label?.match(/(\d+)\s*من\s*(\d+)/);
  if (!match) return undefined;
  const current = Number(match[1]);
  const total = Number(match[2]);
  // Past a dozen the dashes stop being countable at a glance.
  if (!total || total > 12 || current > total) return undefined;
  return { current, total };
}

/** How far through the challenge the room is: a label, and dashes when it counts. */
export function ChallengeProgress({
  label,
  value,
  tone = "light",
  compact = false,
  className,
}: {
  label: string;
  /** 0–100, drawn as a bar when the label is not a count. */
  value?: number;
  /** `dark` on the navy strip, `light` on a card. */
  tone?: "light" | "dark";
  compact?: boolean;
  className?: string;
}) {
  const count = countOf(label);
  return (
    <div
      data-testid="challenge-progress"
      className={cn(
        "flex min-w-0 max-w-full items-center",
        compact ? "flex-col items-start gap-2" : "gap-4",
        className,
      )}
    >
      <span
        className={cn(
          "whitespace-nowrap font-bold",
          compact ? "font-display text-lg font-extrabold" : "text-lg lg:text-xl",
        )}
      >
        {label}
      </span>
      {count ? (
        <span
          role="img"
          aria-label={label}
          // The dashes share the row they are given and shrink to fit it: ten
          // of them at a fixed width ran off the edge of a phone.
          className="flex min-w-0 max-w-full gap-1.5"
        >
          {Array.from({ length: count.total }, (_unused, index) => (
            <span
              key={index}
              className={cn(
                "h-2.5 rounded-full border-2 border-[hsl(var(--brand-navy))]",
                "min-w-0 shrink",
                compact ? "w-[30px]" : "w-8 lg:w-11",
                index < count.current
                  ? "bg-[hsl(var(--brand-gold))]"
                  : "bg-brand-mist",
              )}
            />
          ))}
        </span>
      ) : (
        value !== undefined && (
          <span
            role="progressbar"
            aria-label={label}
            aria-valuenow={Math.round(value)}
            aria-valuemin={0}
            aria-valuemax={100}
            className={cn(
              "h-2.5 w-28 overflow-hidden rounded-full border-2 border-[hsl(var(--brand-navy))]",
              tone === "dark" ? "bg-white/20" : "bg-brand-mist",
            )}
          >
            <span
              className="block h-full bg-[hsl(var(--brand-gold))]"
              style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
            />
          </span>
        )
      )}
    </div>
  );
}

/**
 * The card a challenge is played inside — one shell for every challenge.
 *
 * Shared where it helps and no further: every mechanic gets the same sticker
 * card, the same place for its heading, its progress and its clock, and then
 * owns everything below. Forcing two mechanics with different gameplay into one
 * identical body is how a shared system starts fighting the game it serves.
 *
 * On the shared screen the progress moves up into the Match's navy strip when
 * there is one. A phone renders the same card at thumb scale: progress and
 * dashes on one side, the clock on the other, the heading under them.
 */
export function ChallengeFrame({
  eyebrow,
  title,
  /** e.g. "البطاقة 3 من 10" — the mechanic's own idea of progress. */
  progressLabel,
  progressValue,
  /** The clock, a phase chip, whatever the mechanic needs beside its heading. */
  aside,
  compact = false,
  children,
  className,
}: {
  eyebrow?: string;
  /**
   * The card's own heading. Leave it out when the mechanic's body already
   * opens with the question: the shell must not say it twice.
   */
  title?: string;
  progressLabel?: string;
  progressValue?: number;
  aside?: React.ReactNode;
  compact?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const stripSlot = useContext(ChallengeStripSlotContext);
  const inStrip = !compact && Boolean(stripSlot) && Boolean(progressLabel);

  if (compact) {
    return (
      <section
        dir="rtl"
        data-testid="challenge-frame"
        data-frame-surface="phone"
        className={cn(
          // A phone frame has to be able to fill the height it is given — that
          // is what lets a mechanic push its primary action down to the thumb
          // instead of stacking it under the question.
          "flex min-h-0 flex-1 flex-col gap-3.5 rounded-[22px] border-[3px] border-[hsl(var(--brand-navy))] bg-brand-paper p-4 text-[hsl(var(--brand-navy))] shadow-[5px_6px_0_hsl(var(--brand-navy))]",
          className,
        )}
      >
        <header className="flex items-center justify-between gap-2.5">
          <div className="min-w-0">
            {eyebrow && (
              <p className="truncate text-[13px] font-semibold text-brand-slate">
                {eyebrow}
              </p>
            )}
            {progressLabel ? (
              <ChallengeProgress
                compact
                label={progressLabel}
                {...(progressValue !== undefined
                  ? { value: progressValue }
                  : {})}
              />
            ) : (
              title && (
                <h1 className="font-display text-lg font-extrabold leading-snug [text-wrap:pretty] line-clamp-3">
                  {title}
                </h1>
              )
            )}
          </div>
          {aside && <div className="flex shrink-0 items-center gap-2">{aside}</div>}
        </header>
        {progressLabel && title && (
          <h1 className="text-center font-display text-lg font-extrabold leading-relaxed [text-wrap:pretty] line-clamp-3">
            {title}
          </h1>
        )}
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </section>
    );
  }

  return (
    <section
      dir="rtl"
      data-testid="challenge-frame"
      data-frame-surface="screen"
      className={cn(
        // The approved question card: the content on one side, the clock on the
        // other, centred against it. Below `lg` the clock moves above.
        "flex flex-col-reverse gap-6 rounded-[28px] border-[3px] border-[hsl(var(--brand-navy))] bg-brand-paper px-6 py-6 text-[hsl(var(--brand-navy))] shadow-[7px_8px_0_hsl(var(--brand-navy))] sm:px-9 sm:py-7 lg:flex-row lg:items-center lg:gap-10",
        className,
      )}
    >
      {inStrip &&
        stripSlot &&
        progressLabel &&
        createPortal(
          <ChallengeProgress
            tone="dark"
            label={progressLabel}
            {...(progressValue !== undefined ? { value: progressValue } : {})}
          />,
          stripSlot,
        )}
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {(eyebrow || title || (progressLabel && !inStrip)) && (
          <header className="flex flex-col items-start gap-2">
            {eyebrow && (
              <p className="inline-flex min-h-8 max-w-full items-center truncate rounded-full border-2 border-[hsl(var(--brand-navy))] bg-brand-lavender px-3.5 text-[15px] font-semibold">
                {eyebrow}
              </p>
            )}
            {title && (
              <h1
                className={cn(
                  // The full topic must stay readable: wrap naturally (RTL
                  // Arabic wraps by word) up to a three-line safety cap for
                  // extreme content, rather than ellipsizing a long topic.
                  "font-display text-xl font-extrabold leading-snug [text-wrap:pretty] line-clamp-3 sm:text-2xl lg:text-[28px]",
                )}
              >
                {title}
              </h1>
            )}
            {progressLabel && !inStrip && (
              <ChallengeProgress
                label={progressLabel}
                {...(progressValue !== undefined
                  ? { value: progressValue }
                  : {})}
              />
            )}
          </header>
        )}
        <div className="min-w-0">{children}</div>
      </div>
      {aside && (
        <div className="flex shrink-0 items-center justify-center gap-3 self-center">
          {aside}
        </div>
      )}
    </section>
  );
}
