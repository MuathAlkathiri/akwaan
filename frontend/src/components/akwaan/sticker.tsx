import { cn } from "@/lib/utils";

/**
 * The shapes the whole identity is made of.
 *
 * Akwaan's look is one idea repeated: a navy outline with a hard, unblurred
 * shadow offset down and to the left, as if a sticker were lying on the page.
 * Every card, tag, pill and button on every screen is that idea at a different
 * size.
 *
 * They live here rather than in the home page because the next five screens
 * are the same shapes. A second implementation of "the sticker look" is how a
 * border lands at 2px on one page and 3px on another, and nobody can say which
 * is right.
 *
 * The shadow is deliberately not a Tailwind `shadow-*`: those blur, and the
 * blur is exactly what this identity does not have.
 */

/** The outline and hard shadow, at the three sizes the design uses. */
export const STICKER = {
  /** Cards and section tags. */
  base: "border-[3px] border-[hsl(var(--brand-navy))] shadow-[6px_7px_0_hsl(var(--brand-navy))]",
  /** How-to-play cards, which sit slightly prouder of the page. */
  raised:
    "border-[3px] border-[hsl(var(--brand-navy))] shadow-[8px_9px_0_hsl(var(--brand-navy))]",
  /** Small stickers: the question count, the join button, vote buttons. */
  small:
    "border-[3px] border-[hsl(var(--brand-navy))] shadow-[3px_4px_0_hsl(var(--brand-navy))]",
} as const;

/**
 * A section heading, tilted a degree or two.
 *
 * The tilt alternates in the design — purple leans one way, gold the other —
 * so it reads as placed by hand rather than as a template. The angle is part
 * of the identity, not decoration to drop on a narrow screen.
 */
export function SectionTag({
  tone,
  tilt = -2,
  children,
  className,
}: {
  tone: "purple" | "gold" | "white";
  /** Degrees. Negative leans right in RTL. */
  tilt?: number;
  children: React.ReactNode;
  className?: string;
}) {
  const tones = {
    purple: "bg-[hsl(var(--brand-purple))] text-white",
    gold: "bg-[hsl(var(--brand-gold))] text-[hsl(var(--brand-navy))]",
    white: "bg-white text-[hsl(var(--brand-navy))]",
  };

  return (
    <span
      style={{ transform: `rotate(${tilt}deg)` }}
      className={cn(
        "inline-flex min-h-16 items-center rounded-[14px] px-7",
        "font-display text-[28px] font-extrabold sm:text-[34px]",
        STICKER.base,
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * The primary action: a gold pill.
 *
 * One per screen. The identity has exactly one "press this" colour, and a
 * second gold pill in view is a second answer to what the player should do
 * next.
 */
export function GoldPill({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex min-h-[3.5rem] items-center justify-center rounded-full px-10",
        "font-display text-[19px] font-extrabold sm:min-h-[4.25rem] sm:text-[22px]",
        "bg-[hsl(var(--brand-gold))] text-[hsl(var(--brand-navy))]",
        STICKER.base,
        "transition-transform duration-150 hover:-translate-y-0.5",
        // A disabled primary keeps the outline and loses the gold: the shape
        // still reads as the main action, so the player looks for what unlocks
        // it rather than for a different button.
        "disabled:translate-y-0 disabled:bg-[#E9E6F2] disabled:text-[#4B4380] disabled:shadow-none",
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * A small gold pill that says something rather than does something — the
 * challenge name under a world. Not a button, and never styled like one.
 */
export function ChallengePill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex min-h-[1.625rem] items-center gap-1.5 whitespace-nowrap rounded-full bg-[hsl(var(--brand-gold))] px-3 text-[13px] font-bold text-[hsl(var(--brand-navy))]">
      <Spark className="size-2.5 shrink-0" />
      {children}
    </span>
  );
}

/**
 * The four-pointed spark from the logo.
 *
 * It is the one ornament the identity repeats, so it is drawn once from the
 * same path the design uses and scaled by its container.
 */
export function Spark({
  className,
  fill = "hsl(var(--brand-navy))",
}: {
  className?: string;
  fill?: string;
}) {
  return (
    <svg viewBox="-10 -10 20 20" aria-hidden="true" className={className}>
      <path
        d="M0 -10 Q1.8 -1.8 10 0 Q1.8 1.8 0 10 Q-1.8 1.8 -10 0 Q-1.8 -1.8 0 -10Z"
        fill={fill}
      />
    </svg>
  );
}
