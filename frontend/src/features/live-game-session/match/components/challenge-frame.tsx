"use client";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

/**
 * The frame a challenge is played inside.
 *
 * Shared where it helps and no further: every mechanic gets the same context strip
 * — where in the Match this is, what it is called, and how far through it the room
 * is — and then owns everything below it. Forcing two mechanics with different
 * gameplay into one identical body is how a shared system starts fighting the
 * game it is meant to serve.
 *
 * A phone renders the same frame at a smaller scale, so a player glancing down
 * sees the same words the shared screen is showing.
 */
export function ChallengeFrame({
  eyebrow,
  title,
  /** e.g. "البطاقة 3 من 10" — the mechanic's own idea of progress. */
  progressLabel,
  progressValue,
  /** Right-hand slot: a timer, a phase chip, whatever the mechanic needs. */
  aside,
  compact = false,
  children,
  className,
}: {
  eyebrow?: string;
  title: string;
  progressLabel?: string;
  progressValue?: number;
  aside?: React.ReactNode;
  compact?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      dir="rtl"
      data-testid="challenge-frame"
      className={cn("surface-card overflow-hidden", className)}
    >
      <header
        className={cn(
          "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border bg-muted/50",
          compact ? "px-4 py-2.5" : "px-5 py-3.5",
        )}
      >
        <div className="min-w-0">
          {eyebrow && (
            <p className="truncate text-[0.7rem] font-black text-muted-foreground">
              {eyebrow}
            </p>
          )}
          <h1
            className={cn(
              // The full topic must stay readable: wrap naturally (RTL Arabic
              // wraps by word) up to a three-line safety cap for extreme content,
              // rather than ellipsizing a normal long Top-5 topic on one line.
              "font-black leading-tight text-foreground [text-wrap:pretty] line-clamp-3",
              compact ? "text-base sm:text-lg" : "text-lg sm:text-xl md:text-2xl",
            )}
          >
            {title}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          {progressLabel && (
            <Badge variant="outline" className="font-bold">
              {progressLabel}
            </Badge>
          )}
          {aside}
        </div>
      </header>

      {progressValue !== undefined && (
        <Progress
          value={progressValue}
          aria-label={progressLabel}
          className="h-1 rounded-none"
        />
      )}

      <div className={cn(compact ? "p-4" : "p-5 sm:p-6")}>{children}</div>
    </section>
  );
}
