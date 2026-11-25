import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * What the answer was, held for a beat before the challenge moves on.
 *
 * The round card of the approved result screen, used live: a sticker card with
 * small labels, the answers in bold, and the verdict as a stamp. Presentation
 * only: callers supply already-authorized server result material.
 */
export function ResolutionReveal({
  title,
  children,
  compact = false,
}: {
  title: string;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <section
      dir="rtl"
      aria-label={title}
      data-testid="resolution-reveal"
      className={cn(
        "flex min-w-0 flex-col rounded-[20px] border-[3px] border-[hsl(var(--brand-navy))] bg-brand-paper text-[hsl(var(--brand-navy))] shadow-[5px_6px_0_hsl(var(--brand-navy))]",
        compact ? "gap-3 p-4" : "gap-4 p-5 sm:p-6",
      )}
    >
      <h3
        className={cn(
          "break-words font-display font-extrabold",
          compact ? "text-lg" : "text-xl sm:text-2xl",
        )}
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

export function ResolutionAnswerRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <p className="text-[13px] text-brand-slate sm:text-sm">{label}</p>
      <div className="break-words text-xl font-bold [overflow-wrap:anywhere] sm:text-2xl">
        {children}
      </div>
    </div>
  );
}

/**
 * The verdict. Green and red are spent here and nowhere else on the card: a
 * stamp for a right or a wrong answer, a plain lavender line for anything that
 * is neither.
 */
export function ResolutionOutcome({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "correct" | "wrong" | "neutral";
}) {
  if (tone === "neutral") {
    return (
      <p
        data-outcome-tone="neutral"
        className="break-words rounded-[14px] border-2 border-[hsl(var(--brand-navy))] bg-brand-lavender px-3.5 py-2 text-base font-bold"
      >
        {children}
      </p>
    );
  }
  return (
    <p
      data-outcome-tone={tone}
      className={cn(
        "inline-flex min-h-9 -rotate-3 items-center self-start break-words rounded-[10px] border-[3px] bg-white px-3.5 text-base font-extrabold",
        tone === "correct"
          ? "border-success text-success"
          : "border-sem-error text-sem-error",
      )}
    >
      {children}
    </p>
  );
}
