"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * The movement a correct answer bought, presented as a short reel.
 *
 * Drawn as a die face, which is what the room calls it («النرد»), but it never
 * behaves like a d6: each band can only produce the values inside its own range
 * (سهل is 1–2, never 1–6), so the faces that reel past are that band's real
 * value set and nothing else.
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
    const timer = setTimeout(
      () => setTick((current) => (current ?? 0) + 1),
      CYCLE_MS,
    );
    return () => clearTimeout(timer);
  }, [tick]);

  const reeling = tick !== undefined && tick < CYCLE_TICKS && values.length > 1;
  return {
    // Reeling shows a possible value; everything else shows the server's.
    value: reeling ? values[tick % values.length] : result,
    settled: !reeling,
  };
}

/** Where the pips sit on a 3×3 grid, per face. */
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [2, 6],
  3: [2, 4, 6],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

/**
 * One face of the die, in the sticker style: white, navy outline, hard shadow,
 * tilted a little so it reads as thrown rather than printed.
 */
export function MarhalaDie({
  value,
  size = 120,
  dimmed = false,
  className,
}: {
  value: number;
  size?: number;
  /** A face that is only passing by, before the server's value lands. */
  dimmed?: boolean;
  className?: string;
}) {
  const pips = PIPS[value];
  return (
    <span
      role="img"
      aria-label={`النرد: ${value}`}
      data-die-value={value}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.22,
        padding: size * 0.17,
        borderWidth: Math.max(3, Math.round(size / 30)),
        boxShadow: `${Math.round(size / 20)}px ${Math.round(size / 17)}px 0 hsl(var(--brand-navy))`,
      }}
      className={cn(
        "grid -rotate-[8deg] grid-cols-3 grid-rows-3 place-items-center border-[hsl(var(--brand-navy))] bg-white transition-opacity duration-fast",
        dimmed && "opacity-60",
        className,
      )}
    >
      {pips ? (
        Array.from({ length: 9 }, (_unused, cell) => (
          <span
            key={cell}
            aria-hidden
            style={{ width: size / 6, height: size / 6 }}
            className={cn(
              "rounded-full",
              pips.includes(cell) && "bg-[hsl(var(--brand-navy))]",
            )}
          />
        ))
      ) : (
        // A value no die has a face for is still the server's value: show it.
        <span className="akwaan-numeral col-span-3 row-span-3 text-4xl font-bold text-[hsl(var(--brand-navy))]">
          {value}
        </span>
      )}
    </span>
  );
}

export function MarhalaMovementRoll({
  values,
  result,
  rolling,
  reducedMotion,
  teamName,
  dieSize = 96,
  className,
}: {
  values: number[];
  result: number | undefined;
  rolling: boolean;
  reducedMotion: boolean;
  teamName: string;
  dieSize?: number;
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
      className={cn("flex flex-col items-center gap-3", className)}
      role="status"
      aria-live="polite"
      aria-label={settled ? `${teamName} — طلع لهم ${result}` : undefined}
    >
      <MarhalaDie value={value} size={dieSize} dimmed={!settled} />
      <p className="font-display text-xl font-black text-[hsl(var(--brand-navy))] sm:text-2xl">
        {settled ? (
          <>
            طلع لهم <span className="akwaan-numeral">{value}</span>
          </>
        ) : (
          "النرد يدور…"
        )}
      </p>
      <p className="text-xs font-bold text-brand-slate sm:text-sm">
        {teamName}
      </p>
    </div>
  );
}
