"use client";

import Link from "next/link";
import { ExternalLink, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLiveSession } from "../../hooks/live-session-context";
import { MatchStageRouter } from "../match-stage-router";

/**
 * The host's Match screen.
 *
 * One surface for the whole Match: the board, a preflight, a challenge, and the
 * result all render through the same router underneath this header. The header
 * itself holds only what belongs to the room rather than to the Match — the link
 * to the shared screen, and whether this device is still talking to the server.
 *
 * Deliberately not the internal live-session panel: session controls, runtime
 * debugging, and the join panel are admin tooling, and a Match host has no use
 * for any of it while running a game.
 */
export function MatchHostScreen() {
  const { snapshot, connection, error, resync } = useLiveSession();

  if (!snapshot && error) {
    return (
      <section
        role="alert"
        dir="rtl"
        data-testid="match-host-error"
        className="mx-auto max-w-xl space-y-4 rounded-2xl border border-destructive/30 bg-white p-10 text-center"
      >
        <h1 className="text-xl font-black text-slate-900">
          تعذر تحميل المباراة
        </h1>
        <p className="text-sm leading-6 text-slate-600">{error.message}</p>
        <Button
          type="button"
          onClick={() => resync?.()}
          className="rounded-xl font-black"
        >
          <RefreshCw className="ml-1.5 size-4" aria-hidden />
          إعادة المحاولة
        </Button>
      </section>
    );
  }

  return (
    <div dir="rtl" className="space-y-4">
      <header className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-500">
          {connection === "connected" ? (
            <span data-testid="host-connection">متصل بالخادم</span>
          ) : (
            <span
              data-testid="host-connection"
              className="flex items-center gap-1.5 text-amber-700"
            >
              <WifiOff className="size-4" aria-hidden />
              {connection === "connecting"
                ? "جارٍ الاتصال…"
                : "الاتصال متوقف مؤقتًا"}
            </span>
          )}
        </div>
        {snapshot && (
          <Button asChild variant="outline" size="sm" className="font-black">
            <Link
              href={`/live-sessions/${snapshot.sessionId}/screen`}
              target="_blank"
            >
              <ExternalLink className="ml-1.5 size-4" aria-hidden />
              فتح الشاشة المشتركة
            </Link>
          </Button>
        )}
      </header>

      {snapshot ? (
        <MatchStageRouter actor="controller" />
      ) : (
        <div
          className="mx-auto w-full max-w-6xl space-y-4"
          aria-label="جارٍ تحميل المباراة"
        >
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-72 w-full rounded-2xl" />
        </div>
      )}
    </div>
  );
}
