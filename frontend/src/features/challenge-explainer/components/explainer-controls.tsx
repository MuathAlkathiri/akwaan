"use client";

import { Pause, Play, RotateCcw, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ExplainerTimeline } from "../use-explainer-timeline";

/**
 * Replay / skip / step controls and the one-line caption.
 *
 * Under reduced motion the auto-advance never runs, so this becomes the primary
 * navigation: previous/next replace the play state, and the caption still
 * carries the beat. That is the whole accessibility contract — the explainer is
 * fully readable with no motion at all.
 */
/**
 * The narration line on its own, for the player-facing mode.
 *
 * Deliberately the same copy the control strip shows, rendered without the
 * strip: removing the transport must not remove the sentence that explains what
 * the beat on screen means.
 */
export function ExplainerCaption({
  caption,
  compact = false,
}: {
  caption: string;
  compact?: boolean;
}) {
  return (
    <p
      dir="rtl"
      data-testid="explainer-caption"
      aria-live="polite"
      className={
        compact
          ? // The step instruction on the shared screen (production player mode).
            // Body size from sm; each min-height is a floor reserving the longest
            // sample caption's measured lines (3 < sm, 2 < lg, 1 from lg), so the
            // tutorial does not jump between steps. It never clips longer copy.
            "text-center text-sm font-bold leading-6 text-muted-foreground min-h-[4.5rem] sm:text-base sm:leading-7 sm:min-h-[3.5rem] lg:min-h-[1.75rem]"
          : "text-center text-base font-bold leading-7 text-muted-foreground"
      }
    >
      {caption}
    </p>
  );
}

/**
 * Whether an explainer shows its transport: phase, step counter and buttons.
 *
 * Preview always does. The shared-screen player hides it while the demo plays
 * itself, because a host only needs the demonstration and the narration. Under
 * reduced motion the timeline never plays on its own, so the player must show
 * the same controls too — they switch to Previous / Next in that mode. Without
 * them a reduced-motion viewer would be left on the first step.
 */
export function showsExplainerControls(
  mode: "player" | "preview",
  timeline: Pick<ExplainerTimeline, "reducedMotion">,
): boolean {
  return mode === "preview" || timeline.reducedMotion;
}

export function ExplainerControls({
  step,
  total,
  caption,
  phase,
  timeline,
  compact = false,
  stackOnNarrow = false,
}: {
  step: number;
  total: number;
  caption: string;
  phase: string;
  timeline: ExplainerTimeline;
  compact?: boolean;
  /** Opt-in for mechanics whose reduced-motion controls need a second mobile row. */
  stackOnNarrow?: boolean;
}) {
  const {
    reducedMotion,
    replay,
    skip,
    goTo,
    toggle,
    finished,
    playing,
    userPaused,
    suspended,
  } = timeline;
  return (
    <div
      dir="rtl"
      data-testid="explainer-controls"
      data-reduced-motion={reducedMotion ? "true" : "false"}
      data-suspended={suspended ? "true" : "false"}
      className={cn(
        "surface-card",
        compact ? "space-y-1.5 p-2.5" : "space-y-3 p-4",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between",
          compact ? "gap-2" : "gap-3",
          stackOnNarrow &&
            "flex-col items-stretch sm:flex-row sm:items-center sm:justify-between",
        )}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            data-testid="explainer-phase"
            className="rounded-full border-2 border-border px-2.5 py-0.5 text-[0.7rem] font-black text-muted-foreground"
          >
            {phase === "resolved"
              ? "الكشف"
              : phase === "ownership"
                ? "الملكية"
                : phase === "simulation"
                  ? "تسريع"
                  : "الاختيار"}
          </span>
          {suspended && !userPaused && !reducedMotion && (
            <span
              data-testid="explainer-suspended"
              className="hidden text-[0.7rem] font-black text-muted-foreground sm:inline"
            >
              موقوف مؤقتاً
            </span>
          )}
          <span
            data-testid="explainer-progress"
            className="akwaan-numeral shrink-0 whitespace-nowrap text-xs font-black text-muted-foreground"
          >
            {step + 1} / {total}
          </span>
        </div>

        <div
          className={cn(
            "flex shrink-0 items-center gap-1.5",
            stackOnNarrow && "justify-between sm:justify-start",
          )}
        >
          {reducedMotion ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-testid="explainer-prev"
                disabled={step === 0}
                onClick={() => goTo(step - 1)}
                className="h-9 px-2.5 font-black sm:px-3"
              >
                السابق
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                data-testid="explainer-next"
                disabled={finished}
                onClick={() => goTo(step + 1)}
                className="h-9 px-2.5 font-black sm:px-3"
              >
                التالي
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid="explainer-play-toggle"
              data-playing={playing ? "true" : "false"}
              data-user-paused={userPaused ? "true" : "false"}
              aria-label={userPaused ? "متابعة" : "إيقاف مؤقت"}
              onClick={toggle}
              className="h-9 gap-1.5 px-2.5 font-black sm:px-3"
            >
              {userPaused ? (
                <Play className="size-3.5" aria-hidden />
              ) : (
                <Pause className="size-3.5" aria-hidden />
              )}
              <span className="hidden sm:inline">
                {userPaused ? "متابعة" : "إيقاف"}
              </span>
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-testid="explainer-skip"
            disabled={finished && userPaused}
            onClick={skip}
            className="h-9 gap-1.5 px-2.5 font-black sm:px-3"
          >
            <SkipForward className="size-3.5" aria-hidden />
            <span className="hidden sm:inline">تخطّي</span>
          </Button>
          <Button
            type="button"
            size="sm"
            data-testid="explainer-replay"
            onClick={replay}
            className="h-9 gap-1.5 px-2.5 font-black sm:px-3"
          >
            <RotateCcw className="size-3.5" aria-hidden />
            <span className="hidden sm:inline">إعادة</span>
          </Button>
        </div>
      </div>

      <p
        data-testid="explainer-caption"
        aria-live="polite"
        className={cn(
          "font-bold leading-relaxed text-foreground",
          // The caption is the instruction a room reads off the shared screen, so
          // compact mode no longer shrinks it below body size. Each min-height
          // reserves the longest caption's measured line count at that width
          // (3 lines < sm, 2 lines < lg, 1 line from lg) so steps never jump.
          compact
            ? "text-sm sm:text-base min-h-[3.75rem] sm:min-h-[3rem] lg:min-h-[2rem]"
            : "text-sm min-h-[2.5rem]",
        )}
      >
        {caption}
      </p>
    </div>
  );
}
