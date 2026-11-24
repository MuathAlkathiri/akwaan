"use client";

import { occurrenceLabel } from "@/features/match-setup";
import { cn } from "@/lib/utils";
import { useLiveSession } from "../../hooks/live-session-context";

/**
 * Where in the Match this challenge sits: «العالم الثاني · عالم الألغاز» and
 * the challenge's own name, read off the board position the server published.
 */
export function useChallengeContext(): { eyebrow?: string; title?: string } {
  const { snapshot } = useLiveSession();
  const match = snapshot?.match;
  const current = match?.currentChallenge;
  if (!match || !current) return {};
  const position = match.unified.board.positions.find(
    (candidate) =>
      candidate.occurrenceIndex === current.occurrenceIndex &&
      candidate.slotKey === current.slotKey,
  );
  return {
    eyebrow: [occurrenceLabel(current.occurrenceIndex), position?.worldName]
      .filter(Boolean)
      .join(" · "),
    ...(position?.challengeName ? { title: position.challengeName } : {}),
  };
}

/**
 * The navy context strip every challenge opens with on the shared screen: the
 * world in gold, the challenge's name under it, and one slot on the other side
 * for whatever this challenge needs the room to know first.
 */
export function ChallengeContextStrip({
  eyebrow,
  title,
  aside,
  className,
}: {
  eyebrow?: string;
  title: string;
  aside?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      data-testid="challenge-context-strip"
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-[20px] bg-[hsl(var(--brand-navy))] px-6 py-3 text-white",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        {eyebrow && (
          <p className="truncate text-[15px] font-semibold text-[hsl(var(--brand-gold))]">
            {eyebrow}
          </p>
        )}
        <h1 className="truncate font-display text-2xl font-extrabold leading-tight lg:text-[28px]">
          {title}
        </h1>
      </div>
      {aside}
    </header>
  );
}

/** The team colour as the project allows it: a dot, never a surface. */
export function TeamDot({
  className,
  size = 16,
}: {
  /** The team's `dot` class from `teamIdentityOf`. */
  className?: string;
  size?: number;
}) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={cn(
        "inline-block flex-none rounded-full border-2 border-[hsl(var(--brand-navy))]",
        className,
      )}
    />
  );
}
