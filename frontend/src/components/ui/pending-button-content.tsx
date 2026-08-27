"use client";

import { Loader2 } from "lucide-react";

/**
 * The inside of a primary action button while its request is in flight.
 *
 * A small spinner (auto-sized by the Button's own `[&_svg]` rule) plus concise
 * pending copy, swapped for the idle label. It does not disable or guard anything
 * itself — the caller owns `disabled` and `aria-busy` on the Button — it only
 * makes the in-flight state visible and readable. Reuse it wherever an existing
 * label-swap pending state lives, so every primary CTA reads the same.
 */
export function PendingButtonContent({
  pending,
  pendingLabel,
  children,
}: {
  pending: boolean;
  pendingLabel: string;
  children: React.ReactNode;
}) {
  if (pending) {
    return (
      <>
        <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden />
        {pendingLabel}
      </>
    );
  }
  return <>{children}</>;
}
