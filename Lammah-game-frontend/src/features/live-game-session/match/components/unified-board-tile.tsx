"use client";

import { CheckCircle2, Loader2, Lock, Play, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { slotLabels, slotStatusLabels, unavailableReasons } from "../presentation";
import type { MatchTeamStanding, UnifiedBoardPosition } from "../types";

/**
 * One of the twelve challenge positions.
 *
 * A tile is chosen because it is *available*, never because of where it sits: the
 * three occurrences are peers, and a position in the third is exactly as clickable
 * as one in the first. A completed tile stays in place with its result, so the board
 * always shows the whole Match rather than what is left of it.
 */
export function UnifiedBoardTile({
  position,
  canSelect,
  pending,
  standings,
  onSelect,
  onResume,
}: {
  position: UnifiedBoardPosition;
  /** The host may click it: it is available and no launch is in flight. */
  canSelect: boolean;
  pending: boolean;
  standings: MatchTeamStanding[];
  onSelect: (position: UnifiedBoardPosition) => void;
  onResume: () => void;
}) {
  const completed = position.status === "completed";
  const inProgress = position.status === "in_progress";
  const unavailable =
    position.status === "unavailable" ||
    position.launchability !== "launchable";

  return (
    <article
      data-testid={`unified-position-${position.positionKey}`}
      data-status={position.status}
      className={cn(
        "flex h-full flex-col gap-3 rounded-2xl border p-4 transition",
        completed
          ? "border-emerald-300 bg-emerald-50"
          : inProgress
            ? "border-amber-400 bg-amber-50 ring-2 ring-amber-200"
            : unavailable
              ? "border-slate-200 bg-slate-50"
              : "border-slate-200 bg-white",
        canSelect && "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-500">
            {slotLabels[position.slotKey]}
          </p>
          <h4 className="truncate text-base font-black text-slate-900">
            {position.challengeName || slotLabels[position.slotKey]}
          </h4>
        </div>
        {completed ? (
          <CheckCircle2
            className="size-5 shrink-0 text-emerald-600"
            aria-label="مكتمل"
          />
        ) : inProgress ? (
          <Loader2
            className="size-5 shrink-0 animate-spin text-amber-600"
            aria-label="قيد اللعب"
          />
        ) : unavailable ? (
          <Lock className="size-4 shrink-0 text-slate-400" aria-hidden />
        ) : null}
      </header>

      {position.description && !completed && (
        <p className="line-clamp-2 text-xs leading-5 text-slate-500">
          {position.description}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5">
        <Badge variant="outline">{slotStatusLabels[position.status]}</Badge>
        {position.requiresPhones && !completed && (
          <Badge variant="secondary" className="gap-1">
            <Smartphone className="size-3" aria-hidden />
            يحتاج جوالات
          </Badge>
        )}
      </div>

      {unavailable && !completed && (
        <p className="text-xs font-bold text-slate-500">
          {unavailableReasons[
            position.unavailableReason ?? "launcher_not_implemented"
          ]}
        </p>
      )}

      {completed && position.scoreSummary && (
        <p className="text-xs font-bold text-emerald-800">
          {position.scoreSummary
            .map(
              (score) =>
                `${standings.find((team) => team.teamId === score.teamId)?.name ?? "فريق"}: ${score.displayTotal}`,
            )
            .join(" · ")}
        </p>
      )}

      <div className="mt-auto pt-1">
        {inProgress ? (
          <Button
            type="button"
            variant="outline"
            className="w-full rounded-xl font-black"
            onClick={onResume}
          >
            العودة إلى التحدي
          </Button>
        ) : canSelect ? (
          <Button
            type="button"
            disabled={pending}
            onClick={() => onSelect(position)}
            className="w-full rounded-xl font-black"
          >
            <Play className="ml-1.5 size-4 fill-current" aria-hidden />
            {pending ? "جارٍ التشغيل…" : "اختيار هذا التحدي"}
          </Button>
        ) : null}
      </div>
    </article>
  );
}
