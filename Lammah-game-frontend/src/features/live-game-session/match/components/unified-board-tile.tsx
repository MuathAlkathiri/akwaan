"use client";

import {
  CheckCircle2,
  ChevronLeft,
  Eye,
  Gamepad2,
  ListOrdered,
  Loader2,
  Lock,
  Puzzle,
  Smartphone,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { teamIdentityOf } from "@/lib/team-identity";
import { slotLabels, unavailableReasons } from "../presentation";
import type { MatchTeamStanding, UnifiedBoardPosition } from "../types";

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
  canSelect: boolean;
  blockedReason?: string;
  pending: boolean;
  standings: MatchTeamStanding[];
  onSelect: (position: UnifiedBoardPosition) => void;
  onResume: () => void;
}) {
  const completed = position.status === "completed";
  const inProgress = position.status === "in_progress";
  const unplayable =
    position.status === "unavailable" ||
    position.launchability !== "launchable";
  const reason = unplayable
    ? unavailableReasons[position.unavailableReason ?? "launcher_not_implemented"]
    : undefined;
  const Icon = challengeIcon(position.challengeKey);
  const interactive = canSelect || inProgress;

  const content = (
    <>
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-xl border",
          completed
            ? "border-completed/25 bg-completed-subtle text-completed"
            : inProgress
              ? "border-selected/30 bg-selected/10 text-selected"
              : unplayable
                ? "border-border/60 bg-muted text-disabled-foreground"
                : "border-border bg-background text-primary",
        )}
      >
        {pending || inProgress ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : completed ? (
          <CheckCircle2 className="size-4" aria-label="مكتمل" />
        ) : unplayable ? (
          <Lock className="size-4" aria-hidden />
        ) : (
          <Icon className="size-4" aria-hidden />
        )}
      </span>

      <span className="min-w-0 flex-1 text-start">
        <span className="flex items-center gap-2">
          <span
            className={cn(
              "truncate font-display text-sm font-bold sm:text-base",
              unplayable ? "text-disabled-foreground" : "text-foreground",
            )}
          >
            {position.challengeName}
          </span>
          <span className="akwaan-numeral shrink-0 text-[0.65rem] font-black text-muted-foreground">
            {slotLabels[position.slotKey].replace("الخانة ", "")}
          </span>
        </span>

        <span className="mt-1.5 flex min-w-0 items-center gap-2 text-xs font-bold leading-4 text-muted-foreground">
          {completed ? (
            <span className="text-completed">مكتمل</span>
          ) : inProgress ? (
            <span className="text-selected">قيد اللعب</span>
          ) : reason ? (
            <span
              data-testid={`unavailable-${position.positionKey}`}
              title={reason.detail}
              className="truncate"
            >
              {reason.detail}
            </span>
          ) : pending ? (
            <span>جارٍ التجهيز…</span>
          ) : position.requiresPhones ? (
            <span className="inline-flex items-center gap-1">
              <Smartphone className="size-3" aria-hidden />
              يحتاج جوالات
            </span>
          ) : (
            <span>من الشاشة المشتركة</span>
          )}
          {blockedReason && !completed && !unplayable && !pending && (
            <span className="truncate">{blockedReason}</span>
          )}
        </span>
      </span>

      {completed && position.scoreSummary ? (
        <span className="flex shrink-0 items-center gap-1">
          {position.scoreSummary.map((score) => {
            const identity = teamIdentityOf(
              score.teamId,
              standings.map((team) => ({ id: team.teamId })),
            );
            return (
              <span
                key={score.teamId}
                aria-label={`${standings.find((team) => team.teamId === score.teamId)?.name ?? "فريق"}: ${score.displayTotal}`}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[0.65rem] font-black",
                  identity.surface,
                  identity.border,
                  identity.text,
                )}
              >
                <span className="max-w-16 truncate">
                  {standings.find((team) => team.teamId === score.teamId)?.name ?? "فريق"}
                </span>
                <span className="akwaan-numeral">{score.displayTotal}</span>
              </span>
            );
          })}
        </span>
      ) : interactive ? (
        <ChevronLeft className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-0.5" aria-hidden />
      ) : null}
    </>
  );

  const shared = cn(
    "group flex min-h-20 w-full items-center gap-3.5 rounded-[var(--radius)] border px-3.5 py-3 text-start transition-[background-color,border-color,box-shadow,transform] duration-base ease-akwaan",
    completed
      ? "border-completed/25 bg-completed-subtle"
      : inProgress
        ? "border-selected/45 bg-card ring-2 ring-selected/20"
        : unplayable
          ? "border-border/60 bg-muted/45"
          : "border-border bg-card shadow-[0_4px_16px_-14px_hsl(var(--foreground)/0.35)]",
    interactive &&
      "cursor-pointer hover:-translate-y-0.5 hover:border-selected/45 hover:shadow-[0_10px_24px_-18px_hsl(var(--foreground)/0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  );
  const data = {
    "data-testid": `unified-position-${position.positionKey}`,
    "data-status": position.status,
    "data-challenge-key": position.challengeKey,
    "data-position-status": position.status,
    "data-launchability": position.launchability,
  } as const;

  if (interactive) {
    return (
      <button
        type="button"
        {...data}
        className={shared}
        disabled={pending}
        onClick={() => (inProgress ? onResume() : onSelect(position))}
      >
        {content}
      </button>
    );
  }

  return (
    <article {...data} className={shared}>
      {content}
    </article>
  );
}

function challengeIcon(challengeKey: string) {
  if (challengeKey === "top-5") return ListOrdered;
  if (challengeKey === "read-your-opponent") return Eye;
  if (challengeKey === "closest") return Target;
  if (challengeKey === "distributed-information") return Puzzle;
  return Gamepad2;
}
