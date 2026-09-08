"use client";

import { cn } from "@/lib/utils";

/**
 * Where a phone's primary action sits.
 *
 * One decision, made once, so every migrated mechanic inherits it: the action is
 * pushed to the bottom of whatever space the shell left (`mt-auto`) so it lands
 * under a thumb — but it stays **in normal flow** rather than being fixed to the
 * viewport. A fixed bar is the obvious version and the wrong one: the software
 * keyboard covers the bottom of the screen, so a fixed CTA is exactly the control
 * a player cannot reach at the moment they need it. In flow, the browser scrolls
 * it into view above the keyboard instead.
 *
 * Deliberately empty of behaviour. It owns no gameplay state, submits nothing,
 * and knows no mechanic — it is a place, and the mechanic puts its own control
 * in it.
 */
export function MobileActionArea({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      data-testid="mobile-action-area"
      className={cn(
        "mt-auto flex flex-col gap-2 pt-4",
        // Breathing room above the home indicator, on top of the inset the shell
        // already applies, so a CTA never sits on the very edge of the glass.
        "pb-1",
        className,
      )}
    >
      {children}
    </div>
  );
}
