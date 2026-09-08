"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * The movement a correct answer bought, presented as a short reel.
 *
 * Deliberately **not** a die. المرحلة's movement is not a d6: each band can only
 * produce the values inside its own range (سهل is 1–2, never 1–6), so a six-faced
 * object would misrepresent the exact thing the team elected. What reels past here
 * is the band's real value set and nothing else.
 *
 * Three lines keep it honest:
 *
 *  - the values come from the caller, which reads them off the server's own
 *    `movementRanges` — this component invents none and knows no band;
 *  - the reel is a fixed cycle through those values in order, never a draw. There
 *    is no randomness here, because a random-looking roll that could disagree with
 *    the server is worse than no roll at all;
 *  - the settled value is always `result`, the number the runtime committed. The
 *    cycling is decoration over a decision that was already made.
 *
 * Under reduced motion nothing reels: the authoritative value is presented at once
 * with the same emphasis, because the number is the information and the travel is
 * not.
 */

/** One value every ~90ms reads as a reel rather than a flicker on a TV. */
const CYCLE_MS = 90;
/** Ticks before settling — 7 × 90ms leaves the rest of the beat for the glow. */
const CYCLE_TICKS = 7;

export function useMarhalaMovementRoll({
  values,
  result,
  rolling,
  reducedMotion,
}: {
  /** The band's possible movement values, in order. Never invented here. */
  values: number[];
  /** The authoritative movement the server committed. */
  result: number | undefined;
  /** True only while the replay is on its reveal beat. */
  rolling: boolean;
  reducedMotion: boolean;
}): { value: number | undefined; settled: boolean } {
  const [tick, setTick] = useState<number | undefined>(undefined);
  const startedFor = useRef<number | undefined>(undefined);

  useEffect(() => {
    const reel = rolling && !reducedMotion && values.length > 1;
    if (!reel || result === undefined) {
      setTick(undefined);
      startedFor.current = undefined;
      return;
    }
    // One reel per revealed result; a rerender mid-beat must not restart it.
    if (startedFor.current === result) return;
    startedFor.current = result;
    setTick(0);
  }, [rolling, reducedMotion, values.length, result]);

  useEffect(() => {
    if (tick === undefined || tick >= CYCLE_TICKS) return;
    const timer = setTimeout(() => setTick((current) => (current ?? 0) + 1), CYCLE_MS);
    return () => clearTimeout(timer);
  }, [tick]);

  const reeling = tick !== undefined && tick < CYCLE_TICKS && values.length > 1;
  return {
    // Reeling shows a possible value; everything else shows the server's.
    value: reeling ? values[tick % values.length] : result,
    settled: !reeling,
  };
}

export function MarhalaMovementRoll({
  values,
  result,
  rolling,
  reducedMotion,
  teamName,
  className,
}: {
  values: number[];
  result: number | undefined;
  rolling: boolean;
  reducedMotion: boolean;
  teamName: string;
  className?: string;
}) {
  const { value, settled } = useMarhalaMovementRoll({
    values,
    result,
    rolling,
    reducedMotion,
  });
  if (value === undefined) return null;
  return (
    <div
      data-testid="marhala-movement-roll"
      data-roll-settled={settled ? "true" : "false"}
      data-roll-value={value}
      className={cn("space-y-1", className)}
      role="status"
      aria-live="polite"
      aria-label={
        settled ? `${teamName} — تقدّم ${result} مربّعات` : undefined
      }
    >
      <p
        dir="ltr"
        className={cn(
          "akwaan-numeral text-5xl font-black leading-none transition-all duration-fast ease-akwaan sm:text-7xl",
          settled
            ? // The settle: the server's number, held in navy with a restrained
              // gold halo. No flashing, nothing that reads as a jackpot.
              "scale-105 text-foreground [text-shadow:0_0_18px_hsl(var(--brand-gold)/0.55)]"
            : "scale-95 text-muted-foreground",
        )}
      >
        +{value}
      </p>
      <p className="text-xs font-black text-muted-foreground sm:text-sm">
        {teamName}
      </p>
    </div>
  );
}
