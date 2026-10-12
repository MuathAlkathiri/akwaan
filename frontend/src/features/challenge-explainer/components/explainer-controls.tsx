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
export function ExplainerControls({
  step,
  total,
  caption,
  phase,
  timeline,
  compact = false,
}: {
  step: number;
  total: number;
  caption: string;
  phase: string;
  timeline: ExplainerTimeline;
  compact?: boolean;
}) {
  const { reducedMotion, replay, skip, goTo, toggle, finished, playing, userPaused, suspended } =
    timeline;
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
      <div className={cn("flex items-center justify-between", compact ? "gap-2" : "gap-3")}>
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            data-testid="explainer-phase"
            className="rounded-full border-2 border-border px-2.5 py-0.5 text-[0.7rem] font-black text-muted-foreground"
          >
            {phase === "resolved" ? "الكشف" : "الاختيار"}
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
            className="akwaan-numeral text-xs font-black text-muted-foreground"
          >
            {step + 1} / {total}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {reducedMotion ? (
            <>
              <Button
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
          compact ? "text-[0.72rem] min-h-[2rem]" : "text-sm min-h-[2.5rem]",
        )}
      >
        {caption}
      </p>
    </div>
  );
}
