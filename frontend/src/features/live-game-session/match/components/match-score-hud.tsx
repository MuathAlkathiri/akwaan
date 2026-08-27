"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { teamIdentityOf } from "@/lib/team-identity";

export interface HudTeam {
  id: string;
  name: string;
  score: number;
}

export type DoubleStatus = "available" | "armed" | "consumed";

/**
 * The compact Match HUD that spans the header around the centred `VS`.
 *
 * It is the *only* scoreboard on the Match screen: two team blocks with the live
 * score between subtle ±1 controls, a `VS` divider, and the current team's Double
 * folded into its own name area. Identity colour marks whose block is whose; the
 * selecting team is distinguished by a restrained ring rather than a second
 * banner. Everything here is presentational — the authoritative commands are the
 * caller's `onScore`/`onArmDouble`, gated by `canScore`/`canArmDouble`.
 */
export function MatchScoreHud({
  teams,
  activeTeamId,
  doubles,
  canScore,
  canArmDouble,
  pending,
  onScore,
  onArmDouble,
}: {
  teams: HudTeam[];
  activeTeamId?: string;
  doubles?: ReadonlyArray<{ teamId: string; status: DoubleStatus }>;
  canScore: boolean;
  canArmDouble: boolean;
  pending?: string;
  onScore: (teamId: string, delta: 1 | -1) => void;
  onArmDouble: (teamId: string) => void;
}) {
  const isPending = Boolean(pending);
  return (
    <div
      data-testid="match-score-hud"
      className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 sm:gap-3"
    >
      {teams.map((team, index) => {
        const identity = teamIdentityOf(
          team.id,
          teams.map((t) => ({ id: t.id })),
        );
        const isActive = team.id === activeTeamId;
        const token = doubles?.find((d) => d.teamId === team.id);
        return (
          <div
            key={team.id}
            data-testid={`hud-team-slot-${index === 0 ? "right" : "left"}`}
            className={cn(
              "row-start-1 flex min-w-0 items-center",
              index === 0
                 ? "col-start-3 justify-end"
                : "col-start-1 justify-start",
            )}
          >
            <div
              data-testid={`hud-team-${index === 0 ? "1" : "2"}`}
              data-team-id={team.id}
              data-active={isActive || undefined}
              className={cn(
                "flex min-w-0 items-center gap-1.5 rounded-full px-2 py-1 sm:gap-2 sm:px-2.5",
                isActive && cn("ring-1", identity.ring),
              )}
            >
              <span
                aria-hidden
                className={cn("size-2 shrink-0 rounded-full", identity.dot)}
              />
              <span
                className={cn(
                  "max-w-[4.5rem] truncate font-display text-xs font-bold sm:max-w-[8rem] sm:text-sm",
                  isActive ? identity.text : "text-foreground",
                )}
                title={team.name}
              >
                {team.name}
              </span>

              <DoubleAffordance
                teamName={team.name}
                status={token?.status}
                show={isActive}
                canArm={canArmDouble && isActive}
                pending={isPending}
                onArm={() => onArmDouble(team.id)}
              />

              <span className="flex shrink-0 items-center gap-0.5">
                {canScore && (
                  <button
                    type="button"
                    aria-label={`إنقاص نقطة من ${team.name}`}
                    disabled={isPending}
                    className="grid size-7 place-items-center rounded-full text-muted-foreground opacity-70 transition hover:bg-black/5 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
                    onClick={() => onScore(team.id, -1)}
                  >
                    <Minus className="size-3.5" aria-hidden />
                  </button>
                )}
                <strong className="akwaan-numeral min-w-5 text-center text-lg font-black tabular-nums sm:text-2xl">
                  {team.score}
                </strong>
                {canScore && (
                  <button
                    type="button"
                    aria-label={`إضافة نقطة إلى ${team.name}`}
                    disabled={isPending}
                    className="grid size-7 place-items-center rounded-full text-muted-foreground opacity-70 transition hover:bg-black/5 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
                    onClick={() => onScore(team.id, 1)}
                  >
                    <Plus className="size-3.5" aria-hidden />
                  </button>
                )}
              </span>
            </div>
          </div>
        );
      })}
      <span
        data-testid="hud-vs"
        aria-hidden
        dir="ltr"
        className="col-start-2 row-start-1 shrink-0 px-0.5 font-display text-xs font-black text-[hsl(var(--brand-gold))] sm:text-sm"
      >
        VS
      </span>
    </div>
  );
}

/**
 * The `2×` folded into a team's name area.
 *
 * Only the selecting team's token is ever shown, and only its `available` token
 * is actionable — the opposing team's is hidden to keep the bar quiet. An armed
 * token is a restrained, non-actionable status marker; a consumed/absent one
 * shows nothing.
 */
function DoubleAffordance({
  teamName,
  status,
  show,
  canArm,
  pending,
  onArm,
}: {
  teamName: string;
  status?: DoubleStatus;
  show: boolean;
  canArm: boolean;
  pending: boolean;
  onArm: () => void;
}) {
  if (!show || !status || status === "consumed") return null;

  if (status === "armed") {
    return (
      <span
        data-testid="hud-double-armed"
        aria-label={`الدبل مفعّل لفريق ${teamName}`}
        className="shrink-0 rounded-full bg-[hsl(var(--brand-navy))] px-1.5 py-0.5 text-[0.7rem] font-black leading-none text-white"
        dir="ltr"
      >
        2×
      </span>
    );
  }

  // status === "available"
  if (!canArm) {
    return (
      <span
        data-testid="hud-double-idle"
        aria-hidden
        className="shrink-0 rounded-full border border-border px-1.5 py-0.5 text-[0.7rem] font-black leading-none text-muted-foreground/70"
        dir="ltr"
      >
        2×
      </span>
    );
  }

  return (
    <span className="group relative shrink-0">
      <button
        type="button"
        aria-label="استخدام الدبل"
        title="استخدام الدبل"
        disabled={pending}
        onClick={onArm}
        className="rounded-full border border-[hsl(var(--brand-gold)/.6)] px-1.5 py-0.5 text-[0.7rem] font-black leading-none text-[hsl(var(--brand-navy))] transition hover:bg-[hsl(var(--brand-gold)/.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
        dir="ltr"
      >
        2×
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 top-full z-30 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-[hsl(var(--brand-navy))] px-2 py-1 text-[0.65rem] font-bold text-white opacity-0 shadow transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        استخدام الدبل
      </span>
    </span>
  );
}
