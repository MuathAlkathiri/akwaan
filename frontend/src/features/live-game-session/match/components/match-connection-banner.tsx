"use client";

import { useEffect, useRef, useState } from "react";
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
/** How long a drop must last before the room is told. Most are shorter. */
const DISCONNECT_NOTICE_DELAY_MS = 1500;

/**
 * True once a connection that was live has stayed down long enough to mention.
 *
 * The first connect is not a drop, and a blip the socket recovers from on its
 * own is not worth a line on a television: only a connection that was working
 * and has now been gone for a moment counts.
 */
function useLostConnection(connection: string): boolean {
  const wasConnected = useRef(false);
  const [lost, setLost] = useState(false);
  useEffect(() => {
    if (connection === "connected") {
      wasConnected.current = true;
      setLost(false);
      return;
    }
    if (!wasConnected.current) return;
    const timer = window.setTimeout(
      () => setLost(true),
      DISCONNECT_NOTICE_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [connection]);
  return lost;
}

export function MatchConnectionBanner({ phone = false }: { phone?: boolean }) {
  const { error, resync, connection } = useLiveSession();
  const lost = useLostConnection(connection);
  // A strip pinned over the top, not a row in the page: the last screen stays
  // exactly where it was, and what is safe is said before anything else.
  if (lost)
    return (
      <aside
        role="status"
        aria-live="polite"
        data-testid="match-disconnect-strip"
        className="fixed inset-x-3 top-3 z-50 mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-3 gap-y-0.5 rounded-[18px] border-2 border-white bg-[hsl(var(--brand-navy))] px-5 py-3 text-center text-white shadow-[4px_5px_0_hsl(var(--brand-gold))]"
      >
        <span className="text-base font-extrabold">
          {phone
            ? "انقطع اتصالك، نحاول نرجّعك…"
            : "انقطع اتصال الشاشة، نحاول نرجّعه…"}
        </span>
        <span className="text-sm font-semibold text-[hsl(var(--brand-gold))]">
          {phone
            ? "مكانك في الفريق محفوظ."
            : "المباراة محفوظة، وما راح شي. لا تحدّثون الصفحة."}
        </span>
      </aside>
    );
  // Initial hydration and a successful resync say nothing. Below is reserved
  // for errors the room can act on.
  if (!error) return null;
  // A race the client already recovered from is not something the room needs
  // to read about; see `matchErrorIsRecoverable`.
  if (matchErrorIsRecoverable(error.code)) return null;
  const message =
    matchErrorMessage(error.code) ??
    "ما قدرنا ننفّذ آخر حركة. المباراة محفوظة.";
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
        حدّث الحين
      </Button>
    </aside>
  );
}
