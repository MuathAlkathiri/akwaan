"use client";

import { CheckCircle2, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLiveSession } from "../../hooks/live-session-context";
import { matchErrorMessage } from "../errors/match-errors";
import type { MatchActor } from "../types";

export function MatchConnectionBanner({ actor }: { actor: MatchActor }) {
  const { connection, syncState, error, resync } = useLiveSession();
  if (
    connection === "connected" &&
    (!syncState || syncState === "idle") &&
    !error
  ) {
    return null;
  }
  const syncing = syncState === "resynchronizing";
  const restored = syncState === "restored";
  const disconnected = connection !== "connected";
  const message = restored
    ? "تمت استعادة أحدث حالة للمباراة."
    : syncing
      ? "جارٍ مزامنة المباراة مع الخادم…"
      : disconnected
        ? "الاتصال متوقف مؤقتًا. ستبقى الحالة ظاهرة وسنحاول الاستعادة تلقائيًا."
        : matchErrorMessage(error?.code) ?? "تعذر تنفيذ آخر إجراء.";
  return (
    <aside
      role="status"
      aria-live="polite"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-slate-900"
    >
      <span className="flex items-center gap-2">
        {restored ? (
          <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />
        ) : disconnected ? (
          <WifiOff className="size-4 text-amber-700" aria-hidden />
        ) : (
          <RefreshCw className="size-4 animate-spin" aria-hidden />
        )}
        {message}
      </span>
      {!restored && (
        <Button size="sm" variant="outline" onClick={() => resync?.()}>
          مزامنة الآن
        </Button>
      )}
      {actor === "controller" && error?.message && (
        <details className="w-full text-xs text-slate-500">
          <summary>تفاصيل للمطوّر</summary>
          {error.code}: {error.message}
        </details>
      )}
    </aside>
  );
}

