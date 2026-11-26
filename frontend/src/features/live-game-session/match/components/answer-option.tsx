"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * One answer, as something a thumb can obviously hit.
 *
 * The options used to be flat on the card: no border, no resting surface, no press
 * state. On a phone that is the difference between "these are the four answers" and
 * "these are four buttons I can tap", and the second is what a player needs in a
 * ten-second window.
 *
 * What this owns, so no mechanic has to re-decide it:
 *   - a visible border and a resting surface distinct from the card behind it
 *   - hover, active and selected states
 *   - a ≥44px target, and text that wraps rather than truncating an answer
 *
 * Selected is gold, never a semantic colour: choosing an answer is not
 * being right about it, and the reveal has not happened yet.
 */
export function AnswerOption({
  selected = false,
  disabled = false,
  onClick,
  children,
  className,
}: {
  selected?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      data-selected={selected ? "true" : "false"}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-auto min-h-[3.25rem] whitespace-normal rounded-[14px] border-[3px] border-[hsl(var(--brand-navy))] bg-white py-3 text-base font-bold text-[hsl(var(--brand-navy))] shadow-[3px_4px_0_hsl(var(--brand-navy))] transition-transform duration-fast ease-akwaan hover:bg-brand-lavender active:translate-y-0.5",
        // Gold: this is the one you picked. Still not a verdict — the
        // correctness colours stay out of here until the reveal.
        selected &&
          "bg-[hsl(var(--brand-gold))] hover:bg-[hsl(var(--brand-gold))]",
        className,
      )}
    >
      {children}
    </Button>
  );
}
