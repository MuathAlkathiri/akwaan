"use client";

import { CheckCircle2, Loader2, Lock, Play, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  slotLabels,
  slotStatusLabels,
  unavailableReasons,
} from "../presentation";
import type { MatchTeamStanding, UnifiedBoardPosition } from "../types";

/**
 * One of the twelve challenge positions.
 *
 * Every word on this tile comes from the board projection: the mechanic's name and
 * description, whether it needs phones, whether it can be launched, and why not.
 * Nothing is inferred from a slug, a renderer's existence, or a content count
 * fetched on the side — the server already answered all of it.
 *
 * A tile is chosen because it is *available*, never because of where it sits: the
 * three occurrences are peers, and a position in the third is exactly as clickable
 * as one in the first. A completed tile stays in place with its result, so the
 * board always shows the whole Match rather than what is left of it.
 */
export function UnifiedBoardTile({
  position,
  canSelect,
  blockedReason,
  pending,
  standings,
  onSelect,
  onResume,
}: {
  position: UnifiedBoardPosition;
  /** The host may click it: it is available and no preparation is in flight. */
  canSelect: boolean;
  /**
   * Why an otherwise-playable position is not offered right now — the turn, or a
   * challenge already running. Server-derived; absent when there is no such block.
   */
  blockedReason?: string;
  pending: boolean;
  standings: MatchTeamStanding[];
  onSelect: (position: UnifiedBoardPosition) => void;
  onResume: () => void;
}) {
  const completed = position.status === "completed";
  const inProgress = position.status === "in_progress";
  // Two different facts, and the tile must not confuse them: the position's own
  // status, and whether the configured mechanic can be launched at all.
  const unplayable =
    position.status === "unavailable" ||
    position.launchability !== "launchable";
  const reason = unplayable
    ? unavailableReasons[position.unavailableReason ?? "launcher_not_implemented"]
    : undefined;

  return (
    <article
      data-testid={`unified-position-${position.positionKey}`}
      data-status={position.status}
      data-launchability={position.launchability}
      className={cn(
        "flex h-full flex-col gap-3 rounded-2xl border p-4 transition",
        completed
          ? "border-emerald-300 bg-emerald-50"
          : inProgress
            ? "border-amber-400 bg-amber-50 ring-2 ring-amber-200"
            : unplayable
              ? "border-slate-200 bg-slate-50"
              : "border-slate-200 bg-white",
        canSelect &&
          "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md",
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-500">
            {slotLabels[position.slotKey]}
          </p>
          <h4 className="text-base font-black leading-6 text-slate-900">
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
        ) : unplayable ? (
          <Lock className="size-4 shrink-0 text-slate-400" aria-hidden />
        ) : null}
      </header>

      {position.description && !completed && (
        <p className="line-clamp-2 text-xs leading-5 text-slate-500">
          {position.description}
        </p>
      )}
      {position.instructions && !completed && !unplayable && (
        <p className="line-clamp-2 rounded-lg bg-slate-50 px-2 py-1.5 text-xs leading-5 text-slate-600">
          {position.instructions}
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

      {reason && !completed && (
        <div data-testid={`unavailable-${position.positionKey}`}>
          <p className="text-xs font-black text-slate-600">{reason.label}</p>
          <p className="mt-0.5 text-xs leading-5 text-slate-500">
            {reason.detail}
          </p>
        </div>
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
            {pending ? "جارٍ التجهيز…" : "اختيار هذا التحدي"}
          </Button>
        ) : blockedReason && !completed && !unplayable ? (
          <p className="text-xs font-bold text-slate-500">{blockedReason}</p>
        ) : null}
      </div>
    </article>
  );
}
