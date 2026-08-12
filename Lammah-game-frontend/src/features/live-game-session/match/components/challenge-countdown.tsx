"use client";

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
 *  - **The last three seconds.** Neutral, then brand gold, then the error red. The
 *    colour is a *transient* state on a transient element, which is the one place
 *    `--sem-error` is allowed to appear.
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
  const tone =
    urgency === "critical"
      ? "text-sem-error"
      : urgency === "warning"
        ? "text-brand-gold"
        : "text-foreground";

  if (variant === "chip") {
    return (
      <span
        data-testid="challenge-countdown"
        data-urgency={urgency}
        role="timer"
        aria-label={`الوقت المتبقي ${seconds} ثانية`}
        className={cn(
          "inline-flex items-baseline gap-1 rounded-full border border-border px-2.5 py-1 text-sm font-black transition-colors duration-fast ease-akwaan",
          tone,
          className,
        )}
      >
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
        tone,
        className,
      )}
    >
      {/* Second-largest on the screen, and second by a real margin: at `text-6xl` the
          clock rendered at 72px against a 40px question, which inverted the hierarchy
          — the room read the timer first and the question second. */}
      <span className="akwaan-numeral text-3xl font-black sm:text-4xl">
        {seconds}
      </span>
      <span className="mt-1 text-xs font-bold text-muted-foreground">ثانية</span>
    </div>
  );
}
