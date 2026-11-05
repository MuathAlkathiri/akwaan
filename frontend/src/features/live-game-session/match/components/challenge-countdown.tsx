"use client";

import { AlarmClock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The seconds left, drawn once for every mechanic that has a deadline.
 *
 * Four panels each rendered their own small grey chip. On the decision screen that
 * was a real defect rather than an inconsistency: a ~10-second blind window is the
 * only tension driver in the mechanic, and a chip does not drive tension.
 *
 * Three things this component owns, none of which a caller can get wrong:
 *
 *  - **Tabular numerals.** Without `tabular-nums` the digits change width every tick
 *    and the number visibly jitters — the most-watched element on the screen twitching
 *    once a second. `.akwaan-numeral` carries this along with LTR isolation.
 *  - **Arabic word order.** "ثانية ٢٢" is backwards. The prominent form prints the
 *    bare numeral with a small "ثانية" beneath it; the chip form says "22 ثانية".
 *  - **The last three seconds.** Neutral, then warning, then the error red. The
 *    colour is a *transient* state on a transient element, which is the one place
 *    `--sem-error` is allowed to appear.
 *
 * Urgency is never carried by colour alone: from the warning threshold on, a static
 * alarm icon appears (no animation, so reduced motion keeps the cue). Brand gold is
 * not used for the digits — it cannot reach legible contrast on the cream room. The
 * prominent numeral is large text, where `--warning` clears 3:1; the small chip
 * keeps navy digits and takes the warning colour on its border and fill instead.
 */
export function ChallengeCountdown({
  remainingMs,
  variant = "chip",
  className,
}: {
  remainingMs: number;
  /** `prominent` for a blind-decision window; `chip` inside a frame header. */
  variant?: "chip" | "prominent";
  className?: string;
}) {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  /**
   * Urgency is read off the clock, not passed in, so every mechanic escalates at the
   * same moment.
   *
   * The warning threshold is 6s, not 10s: RYO's blind window *is* ten seconds, so at
   * 10s the timer was already amber and never had a calm state to escalate from —
   * observed in the browser, where the whole window rendered as a warning.
   */
  const urgency = seconds <= 3 ? "critical" : seconds <= 6 ? "warning" : "calm";
  const urgent = urgency !== "calm";

  if (variant === "chip") {
    const chipTone =
      urgency === "critical"
        ? "text-sem-error"
        : urgency === "warning"
          ? "border-warning bg-warning-subtle text-foreground"
          : "text-foreground";
    return (
      <span
        data-testid="challenge-countdown"
        data-urgency={urgency}
        role="timer"
        aria-label={`الوقت المتبقي ${seconds} ثانية`}
        className={cn(
          "inline-flex items-baseline gap-1 rounded-full border border-border px-2.5 py-1 text-sm font-black transition-colors duration-fast ease-akwaan",
          chipTone,
          className,
        )}
      >
        {urgent && (
          <AlarmClock
            data-testid="challenge-countdown-urgent-cue"
            className="size-3.5 shrink-0 self-center"
            aria-hidden
          />
        )}
        <span className="akwaan-numeral">{seconds}</span>
        <span className="text-[0.7rem] font-bold">ثانية</span>
      </span>
    );
  }

  return (
    <div
      data-testid="challenge-countdown"
      data-urgency={urgency}
      role="timer"
      aria-label={`الوقت المتبقي ${seconds} ثانية`}
      className={cn(
        "flex flex-col items-center leading-none transition-colors duration-fast ease-akwaan",
        urgency === "critical"
          ? "text-sem-error"
          : urgency === "warning"
            ? "text-warning"
            : "text-foreground",
        className,
      )}
    >
      {/* Second-largest on the screen, and second by a real margin: at `text-6xl` the
          clock rendered at 72px against a 40px question, which inverted the hierarchy
          — the room read the timer first and the question second. */}
      <span className="relative akwaan-numeral text-3xl font-black sm:text-4xl">
        {seconds}
        {/* Out of flow, so the numeral neither moves nor re-centres when it appears. */}
        {urgent && (
          <AlarmClock
            data-testid="challenge-countdown-urgent-cue"
            className="absolute end-full top-1/2 me-1.5 size-5 -translate-y-1/2 sm:size-6"
            aria-hidden
          />
        )}
      </span>
      <span className="mt-1 text-xs font-bold text-muted-foreground">ثانية</span>
    </div>
  );
}
