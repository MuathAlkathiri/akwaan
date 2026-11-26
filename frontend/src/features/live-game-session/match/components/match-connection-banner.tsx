"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLiveSession } from "../../hooks/live-session-context";
import {
  matchErrorIsRecoverable,
  matchErrorMessage,
} from "../errors/match-errors";

/**
 * What the room is told while the connection is not simply fine.
 *
 * Every state here is one Arabic sentence and, where it helps, one button. The
 * server's own error text never appears: it is written for a log reader, and a
 * host reading it aloud to a room learns nothing they can act on. The code rides
 * along as a data attribute for support instead.
 */
export function MatchConnectionBanner() {
  const { error, resync } = useLiveSession();
  // Initial hydration, live reconnecting, and successful resync are represented
  // by the fixed MatchShell connection pill. They must not insert a transient
  // row above the active stage. This surface is reserved for actionable errors.
  if (!error) return null;
  // A race the client already recovered from is not something the room needs
  // to read about; see `matchErrorIsRecoverable`.
  if (matchErrorIsRecoverable(error.code)) return null;
  const message = matchErrorMessage(error.code) ?? "تعذر تنفيذ آخر إجراء.";
  return (
    <aside
      role="status"
      aria-live="polite"
      data-testid="match-connection-banner"
      {...(error?.code ? { "data-error-code": error.code } : {})}
      // A strip, not a screen: the last screen stays where it was, and what is
      // safe is said before what to do.
      className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] bg-[hsl(var(--brand-navy))] px-5 py-3 text-base font-bold text-white"
    >
      <span className="flex items-center gap-2">
        <AlertTriangle className="size-5 text-warning" aria-hidden />
        {message}
      </span>
      <Button
        size="sm"
        onClick={() => resync?.()}
        className="rounded-full border-2 border-white bg-[hsl(var(--brand-gold))] font-extrabold text-[hsl(var(--brand-navy))] hover:bg-[hsl(var(--brand-gold))]"
      >
        حدِّث الآن
      </Button>
    </aside>
  );
}
