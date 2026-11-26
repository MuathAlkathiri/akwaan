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
 *    compact chip and never sounds: five phones beeping at five seconds would
 *    drown the shared screen's own cue and tell the room nothing it cannot
 *    already see. It does grow and beat at `critical`, because a chip the size
 *    of a label is a chip a player loses the round to — the complaint was that
 *    nobody notices it, and size and motion answer that without the noise.
 */
export function ChallengeCountdown({
  remainingMs,
  variant = "chip",
  thresholds = DEFAULT_COUNTDOWN_THRESHOLDS,
  sound = true,
  size = "lg",
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
  /**
   * How big the shared screen's face is. `lg` when the clock has the card to
   * itself; `md` when it shares a row with something else (a board, a panel).
   */
  size?: "lg" | "md";
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
        className={cn("relative inline-flex items-center gap-2", className)}
        data-testid="challenge-countdown-stage"
      >
        {/* The only purple on a question screen: two small stars by the clock. */}
        {size === "lg" && (
          <>
            <CountdownStar className="absolute -top-3 end-10 size-9 rotate-12 lg:size-12" />
            <CountdownStar className="absolute -bottom-1 -start-4 size-5 -rotate-12 lg:size-7" />
          </>
        )}
        <div
          data-testid="challenge-countdown"
          data-urgency={urgency}
          data-surface="stage"
          role="timer"
          aria-label={label}
          className={cn(
            // One round face for every challenge and all four states, so the
            // card never jumps — not even when «انتهى الوقت» replaces the
            // number. Its size lives in `.akwaan-stage-countdown` so a short
            // (720p) screen gets a smaller face; see globals.css.
            size === "md" && "akwaan-stage-countdown-md",
            "akwaan-stage-countdown relative flex shrink-0 flex-col items-center justify-center rounded-full outline outline-4 outline-[hsl(var(--brand-navy))] transition-colors duration-fast ease-akwaan",
            STAGE_TONE[urgency],
          )}
        >
          {urgency !== "calm" && (
            <UrgencyIcon
              urgency={urgency}
              className="absolute top-[12%] size-5 lg:size-6"
            />
          )}
          {urgency === "expired" ? (
            <span className="px-2 text-center font-display text-lg font-extrabold leading-tight lg:text-xl">
              انتهى الوقت
            </span>
          ) : (
            <>
              <span
                className={cn(
                  "akwaan-numeral akwaan-stage-countdown-digits inline-block min-w-[2ch] text-center font-bold leading-none",
                  urgency === "critical" && "akwaan-countdown-beat",
                )}
              >
                {seconds}
              </span>
              <span className="text-sm font-semibold opacity-80 lg:text-lg">
                ثانية
              </span>
            </>
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
          // The same round face as the shared screen, at thumb scale. Calm it
          // stays out of the way; critical it grows and beats, so the last
          // seconds are seen from the corner of an eye that is on the answer
          // buttons.
          "relative inline-flex size-[72px] shrink-0 flex-col items-center justify-center rounded-full outline outline-[3px] outline-[hsl(var(--brand-navy))] transition-all duration-base ease-akwaan",
          CHIP_TONE[urgency],
          urgency === "critical" && "scale-110",
          className,
        )}
      >
        {urgency !== "calm" && (
          <UrgencyIcon
            urgency={urgency}
            className="absolute top-1.5 size-3.5"
            data-testid="challenge-countdown-urgent-cue"
          />
        )}
        {urgency === "expired" ? (
          <span className="px-1 text-center text-[11px] font-extrabold leading-tight">
            انتهى الوقت
          </span>
        ) : (
          <>
            <span
              className={cn(
                "akwaan-numeral inline-block min-w-[2ch] text-center text-[26px] font-bold leading-none",
                urgency === "critical" && "akwaan-countdown-beat",
              )}
            >
              {seconds}
            </span>
            <span className="text-[10px] font-semibold opacity-80">ثانية</span>
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
        <span className="mt-1 text-xs font-bold text-muted-foreground">
          ثانية
        </span>
      )}
    </div>
  );
}

/**
 * The face in each state. Calm is the gold ring every challenge shares;
 * critical is a filled face, the one state that has to be seen from the far
 * end of a room; white on `--sem-error` clears 4.5:1.
 */
const STAGE_TONE: Record<CountdownUrgency, string> = {
  calm: "border-[hsl(var(--brand-gold))] bg-card text-foreground",
  warning: "border-warning bg-warning-subtle text-foreground",
  critical:
    "border-[hsl(var(--brand-navy))] bg-sem-error text-sem-reveal-foreground",
  expired: "border-brand-dash bg-brand-wash text-foreground",
};

const CHIP_TONE: Record<CountdownUrgency, string> = {
  calm: "border-[6px] border-[hsl(var(--brand-gold))] bg-card text-foreground",
  warning: "border-[6px] border-warning bg-warning-subtle text-foreground",
  critical:
    "border-[6px] border-[hsl(var(--brand-navy))] bg-sem-error text-sem-reveal-foreground",
  expired: "border-[6px] border-brand-dash bg-brand-wash text-foreground",
};

const PROMINENT_TONE: Record<CountdownUrgency, string> = {
  calm: "text-foreground",
  warning: "text-warning",
  critical: "text-foreground",
  expired: "text-foreground",
};

function CountdownStar({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="-12 -12 24 24" className={className}>
      <path
        d="M0 -10 Q1.8 -1.8 10 0 Q1.8 1.8 0 10 Q-1.8 1.8 -10 0 Q-1.8 -1.8 0 -10Z"
        fill="hsl(var(--brand-purple))"
        stroke="hsl(var(--brand-navy))"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
      className="grid size-10 shrink-0 place-items-center self-end rounded-full border-2 border-[hsl(var(--brand-navy))] bg-white text-[hsl(var(--brand-navy))] transition-colors hover:bg-brand-lavender focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {enabled ? (
        <Volume2 className="size-5" aria-hidden />
      ) : (
        <VolumeX className="size-5" aria-hidden />
      )}
    </button>
  );
}
