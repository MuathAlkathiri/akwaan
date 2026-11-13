"use client";

import { Check, Loader2, Smartphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { teamIdentityOf } from "@/lib/team-identity";
import { challengeIcon } from "../challenge-identity";
import { unavailableReasons } from "../presentation";
import type { MatchTeamStanding, UnifiedBoardPosition } from "../types";

/**
 * Where each of a World's four challenges sits on its orbit.
 *
 * Right to left, top row then bottom, so the first slot is where an Arabic
 * reader starts. The percentages are the design board's own geometry, kept as
 * fractions so the orbit scales with the column instead of pinning itself to
 * 420px.
 */
export const ORBIT_CORNERS = [
  { left: "65.5%", top: "4.8%" },
  { left: "3.6%", top: "4.8%" },
  { left: "65.5%", top: "61.9%" },
  { left: "3.6%", top: "61.9%" },
] as const;

/**
 * Which team a finished challenge went to.
 *
 * The score summary is the only record of it on the board, so a draw — two
 * teams on the same total — has no owner, and the circle stays navy rather
 * than picking a side the match did not.
 */
function winnerOf(position: UnifiedBoardPosition): string | undefined {
  const scores = position.scoreSummary ?? [];
  if (scores.length === 0) return undefined;
  const best = Math.max(...scores.map((score) => score.signedTotal));
  const leaders = scores.filter((score) => score.signedTotal === best);
  return leaders.length === 1 ? leaders[0].teamId : undefined;
}

/**
 * One challenge, as a sticker in orbit around its World.
 *
 * The circle's fill is the whole state machine: the team's colour once it has
 * been won, gold while it is running, white while it waits to be chosen, and
 * flat grey when it cannot be played at all. Colour is never the only signal —
 * a finished circle also carries a tick and the name of the side that took it.
 */
export function OrbitChallenge({
  position,
  corner,
  canSelect,
  blockedReason,
  pending,
  standings,
  onSelect,
  onResume,
}: {
  position: UnifiedBoardPosition;
  corner: (typeof ORBIT_CORNERS)[number];
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
    ? unavailableReasons[
        position.unavailableReason ?? "launcher_not_implemented"
      ]
    : undefined;
  const Icon = challengeIcon(position.challengeKey);
  const interactive = canSelect || inProgress;

  const ownerTeamId = completed ? winnerOf(position) : undefined;
  const owner = ownerTeamId
    ? teamIdentityOf(
        ownerTeamId,
        standings.map((team) => ({ id: team.teamId })),
      )
    : undefined;
  const ownerName = ownerTeamId
    ? standings.find((team) => team.teamId === ownerTeamId)?.name
    : undefined;

  const circle = cn(
    "relative grid aspect-square w-[74%] place-items-center rounded-full border-[3px] border-[hsl(var(--brand-navy))]",
    completed
      ? owner
        ? owner.solid
        : "bg-[hsl(var(--brand-navy))] text-white shadow-[0_6px_0_hsl(var(--brand-navy))]"
      : inProgress
        ? "bg-[hsl(var(--brand-gold))] text-[hsl(var(--brand-navy))] shadow-[0_6px_0_hsl(var(--brand-navy))]"
        : unplayable
          ? "bg-muted text-disabled-foreground border-[hsl(var(--brand-navy)/.25)]"
          : "bg-white text-[hsl(var(--brand-navy))] shadow-[0_6px_0_hsl(var(--brand-navy))]",
    interactive &&
      "transition-transform hover:-translate-y-0.5 focus-visible:outline-none",
  );

  const state = completed
    ? ownerName
      ? `مكتمل · ${ownerName}`
      : "مكتمل · تعادل"
    : inProgress
      ? "شغّال الحين"
      : unplayable
        ? (reason?.label ?? "غير متاح")
        : "جاهز للاختيار";

  const content = (
    <>
      <span className={circle}>
        {pending || inProgress ? (
          <Loader2 className="size-9 animate-spin" aria-hidden />
        ) : (
          <Icon className="size-9" aria-hidden />
        )}
        {completed && (
          <span className="absolute -top-1 end-1 grid size-7 place-items-center rounded-full border-[2.5px] border-[hsl(var(--brand-navy))] bg-white text-[hsl(var(--brand-navy))]">
            <Check className="size-4" aria-label="مكتمل" />
          </span>
        )}
      </span>
      {/* The name sits on the page's own background so an orbit ring passing
          behind it never cuts through the words. */}
      <span className="bg-background rounded-lg px-1.5 text-center text-sm font-black break-words">
        {position.challengeName}
      </span>
      {/* What the circle's colour cannot say on its own. A finished challenge
          keeps both team names and their points, because the board is the only
          record of it once the challenge is over. */}
      {completed ? (
        <span className="flex flex-wrap justify-center gap-1">
          {(position.scoreSummary ?? []).map((score) => {
            const identity = teamIdentityOf(
              score.teamId,
              standings.map((team) => ({ id: team.teamId })),
            );
            return (
              <span
                key={score.teamId}
                className={cn(
                  "akwaan-numeral rounded-full px-1.5 text-[0.7rem] font-black",
                  identity.surface,
                  identity.text,
                )}
              >
                {standings.find((team) => team.teamId === score.teamId)?.name ??
                  "فريق"}{" "}
                {score.displayTotal}
              </span>
            );
          })}
        </span>
      ) : inProgress ? (
        <span className="text-[0.7rem] font-black text-[hsl(var(--brand-navy))]">
          قيد اللعب
        </span>
      ) : unplayable ? (
        <span className="text-muted-foreground text-[0.7rem] font-bold">
          {reason?.detail ?? reason?.label}
        </span>
      ) : position.requiresPhones ? (
        <span className="text-muted-foreground inline-flex items-center gap-1 text-[0.7rem] font-bold">
          <Smartphone className="size-3" aria-hidden />
          يحتاج جوالات
        </span>
      ) : null}
    </>
  );

  const data = {
    "data-testid": `unified-position-${position.positionKey}`,
    "data-status": position.status,
    "data-challenge-key": position.challengeKey,
    "data-position-status": position.status,
    "data-launchability": position.launchability,
  } as const;

  const shell =
    "absolute flex w-[31%] flex-col items-center gap-1.5 border-0 bg-transparent p-0";

  if (interactive) {
    return (
      <button
        type="button"
        {...data}
        style={{ left: corner.left, top: corner.top }}
        className={cn(shell, "cursor-pointer")}
        disabled={pending}
        aria-label={`${position.challengeName} — ${state}`}
        {...(blockedReason ? { title: blockedReason } : {})}
        onClick={() => (inProgress ? onResume() : onSelect(position))}
      >
        {content}
      </button>
    );
  }

  return (
    <article
      {...data}
      style={{ left: corner.left, top: corner.top }}
      className={shell}
      aria-label={`${position.challengeName} — ${state}`}
      {...(reason?.detail ? { title: reason.detail } : {})}
    >
      {content}
    </article>
  );
}
