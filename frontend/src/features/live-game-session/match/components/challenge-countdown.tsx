"use client";

import { AlarmClock, Timer, TimerOff, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  countdownSeconds,
  countdownUrgency,
  DEFAULT_COUNTDOWN_THRESHOLDS,
  type CountdownThresholds,
  type CountdownUrgency,
} from "./countdown-urgency";
import {
  useCountdownCues,
  useCountdownSurface,
} from "./countdown-presentation";
import { useCountdownSoundPreference } from "./countdown-sound";

/**
 * The seconds left, drawn once for every mechanic that has a deadline.
 *
 * Presentation only. Every mechanic derives `remainingMs` from its own
 * server-owned deadline; this component reads it and never counts on its own.
 *
 * What it owns, none of which a caller can get wrong:
 *
 *  - **Tabular numerals in a fixed-width box.** Digits that change width make the
 *    most-watched element on the screen twitch every second; a box that resizes
 *    makes the header jump. `.akwaan-numeral` carries tabular digits and LTR
 *    isolation; the box has a minimum width that fits two digits.
 *  - **Arabic word order.** "ثانية ٢٢" is backwards: the number comes first.
 *  - **Four states, never colour alone.** Calm, warning, critical, expired — each
 *    with its own icon as well as its colour, and critical with a restrained beat
 *    that `prefers-reduced-motion` turns off. `--sem-error` appears here because
 *    this is a transient state on a transient element.
 *  - **Where it is.** On the room's stage — the controller or shared screen, read
 *    from a sofa — the header timer is large and may sound. On a phone it stays a
 *    compact chip that never animates and never sounds.
 */
export function ChallengeCountdown({
  remainingMs,
  variant = "chip",
  thresholds = DEFAULT_COUNTDOWN_THRESHOLDS,
  sound = true,
  className,
}: {
  remainingMs: number;
  /** `prominent` for a blind-decision window; `chip` inside a frame header. */
  variant?: "chip" | "prominent";
  /**
   * Presentation thresholds. The defaults suit windows of about twenty seconds
   * and up; a shorter window passes `countdownThresholdsForWindow(seconds)`.
   */
  thresholds?: CountdownThresholds;
  /** False while the question itself is audio, so cues never talk over it. */
  sound?: boolean;
  className?: string;
}) {
  const seconds = countdownSeconds(remainingMs);
  const urgency = countdownUrgency(seconds, thresholds);
  const surface = useCountdownSurface();
  const stage = surface === "stage";
  useCountdownCues(seconds, thresholds, stage && sound);

  const label =
    urgency === "expired" ? "انتهى الوقت" : `الوقت المتبقي ${seconds} ثانية`;

  if (variant === "chip" && stage) {
    return (
      <div
        className={cn("inline-flex items-center gap-2", className)}
        data-testid="challenge-countdown-stage"
      >
        <div
          data-testid="challenge-countdown"
          data-urgency={urgency}
          data-surface="stage"
          role="timer"
          aria-label={label}
          className={cn(
            // One fixed footprint for all four states, so the header never
            // jumps — not even when "انتهى الوقت" replaces the number.
            // Height and digit size live in `.akwaan-stage-countdown` so a short
            // (720p) screen gets a lower box; see globals.css.
            "akwaan-stage-countdown inline-flex min-w-[12rem] items-center justify-center gap-2.5 rounded-[var(--radius)] border-2 px-4 shadow-sm transition-colors duration-fast ease-akwaan lg:min-w-[13.5rem]",
            STAGE_TONE[urgency],
          )}
        >
          <UrgencyIcon
            urgency={urgency}
            className="size-7 shrink-0 lg:size-8"
          />
          {urgency === "expired" ? (
            <span className="min-w-[4.5ch] text-xl font-black lg:text-2xl">
              انتهى الوقت
            </span>
          ) : (
            <span className="flex items-baseline gap-1.5">
              <span
                className={cn(
                  "akwaan-numeral akwaan-stage-countdown-digits inline-block min-w-[2ch] text-center font-black leading-none",
                  urgency === "critical" && "akwaan-countdown-beat",
                )}
              >
                {seconds}
              </span>
              <span className="text-sm font-bold lg:text-base">ثانية</span>
            </span>
          )}
        </div>
        <CountdownSoundToggle />
      </div>
    );
  }

  if (variant === "chip") {
    return (
      <span
        data-testid="challenge-countdown"
        data-urgency={urgency}
        data-surface="compact"
        role="timer"
        aria-label={label}
        className={cn(
          "inline-flex items-baseline gap-1 rounded-full border border-border px-2.5 py-1 text-sm font-black transition-colors duration-fast ease-akwaan",
          CHIP_TONE[urgency],
          className,
        )}
      >
        {urgency !== "calm" && (
          <UrgencyIcon
            urgency={urgency}
            className="size-3.5 shrink-0 self-center"
            data-testid="challenge-countdown-urgent-cue"
          />
        )}
        {urgency === "expired" ? (
          <span>انتهى الوقت</span>
        ) : (
          <>
            <span className="akwaan-numeral inline-block min-w-[2ch] text-center">
              {seconds}
            </span>
            <span className="text-[0.7rem] font-bold">ثانية</span>
          </>
        )}
      </span>
    );
  }

  return (
    <div
      data-testid="challenge-countdown"
      data-urgency={urgency}
      data-surface={surface}
      role="timer"
      aria-label={label}
      className={cn(
        "flex flex-col items-center leading-none transition-colors duration-fast ease-akwaan",
        PROMINENT_TONE[urgency],
        className,
      )}
    >
      {/* Second-largest on the screen, and second by a real margin: at `text-6xl` the
          clock rendered at 72px against a 40px question, which inverted the hierarchy
          — the room read the timer first and the question second. */}
      <span className="relative akwaan-numeral text-3xl font-black sm:text-4xl">
        {urgency === "expired" ? (
          <span className="text-2xl sm:text-3xl">انتهى الوقت</span>
        ) : (
          <span
            className={cn(
              "inline-block min-w-[2ch] text-center",
              stage && urgency === "critical" && "akwaan-countdown-beat",
            )}
          >
            {seconds}
          </span>
        )}
        {/* Out of flow, so the numeral neither moves nor re-centres when it appears. */}
        {urgency !== "calm" && (
          <UrgencyIcon
            urgency={urgency}
            data-testid="challenge-countdown-urgent-cue"
            className="absolute end-full top-1/2 me-1.5 size-5 -translate-y-1/2 sm:size-6"
          />
        )}
      </span>
      {urgency !== "expired" && (
        <span className="mt-1 text-xs font-bold text-muted-foreground">ثانية</span>
      )}
    </div>
  );
}

/**
 * Stage tones. Critical is a filled panel, the one state that has to be seen
 * from the far end of a room; white on `--sem-error` clears 4.5:1.
 */
const STAGE_TONE: Record<CountdownUrgency, string> = {
  calm: "border-border bg-card text-foreground",
  warning: "border-warning bg-warning-subtle text-foreground",
  critical: "border-sem-error bg-sem-error text-white",
  expired: "border-sem-error/50 bg-muted text-sem-error",
};

const CHIP_TONE: Record<CountdownUrgency, string> = {
  calm: "text-foreground",
  warning: "border-warning bg-warning-subtle text-foreground",
  critical: "text-sem-error",
  expired: "border-sem-error/50 text-sem-error",
};

const PROMINENT_TONE: Record<CountdownUrgency, string> = {
  calm: "text-foreground",
  warning: "text-warning",
  critical: "text-sem-error",
  expired: "text-sem-error",
};

function UrgencyIcon({
  urgency,
  className,
  ...rest
}: {
  urgency: CountdownUrgency;
  className?: string;
  "data-testid"?: string;
}) {
  const Icon =
    urgency === "expired" ? TimerOff : urgency === "calm" ? Timer : AlarmClock;
  return <Icon className={className} aria-hidden {...rest} />;
}

/**
 * The room's sound switch, beside the timer it belongs to. Off until someone in
 * the room turns it on — which is also the gesture the browser needs. Exported
 * so a mechanic with its own room clock (Bomb) offers the same switch.
 */
export function CountdownSoundToggle() {
  const [enabled, setEnabled] = useCountdownSoundPreference();
  return (
    <button
      type="button"
      data-testid="countdown-sound-toggle"
      aria-pressed={enabled}
      aria-label={enabled ? "إيقاف أصوات المؤقت" : "تشغيل أصوات المؤقت"}
      title={enabled ? "إيقاف أصوات المؤقت" : "تشغيل أصوات المؤقت"}
      onClick={() => setEnabled(!enabled)}
      className="grid size-10 shrink-0 place-items-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {enabled ? (
        <Volume2 className="size-5" aria-hidden />
      ) : (
        <VolumeX className="size-5" aria-hidden />
      )}
    </button>
  );
}
