"use client";

import { cn } from "@/lib/utils";
import { teamIdentityOf, type TeamIdentity } from "@/lib/team-identity";

/**
 * A team, its colour, and its number.
 *
 * The one way a team's score is drawn. Every surface that shows a scoreboard —
 * the Match shell, a challenge header, the result, Match complete — composes this
 * rather than laying out its own name-and-number pair, which is what let three
 * screens disagree about which team was green.
 *
 * Colour is never the only signal: the team's name is always present, and the
 * active team additionally carries a ring and a label.
 */
export function TeamScore({
  name,
  score,
  identity,
  active = false,
  size = "default",
  label,
  className,
}: {
  name: string;
  score: number;
  identity: TeamIdentity;
  /** This team is acting right now. */
  active?: boolean;
  size?: "sm" | "default" | "lg";
  /** Extra context under the score, e.g. "دورهم الآن". */
  label?: string;
  className?: string;
}) {
  return (
    <div
      data-testid={`team-score-${identity.slot}`}
      data-active={active ? "true" : "false"}
      className={cn(
        "flex items-center gap-3 rounded-[var(--radius)] border px-3 py-2 transition-colors duration-base ease-akwaan",
        identity.surface,
        identity.border,
        active && cn("ring-2 ring-offset-2 ring-offset-background", identity.ring),
        className,
      )}
    >
      <span
        aria-hidden
        className={cn("size-2.5 shrink-0 rounded-full", identity.dot)}
      />
      <div className="min-w-0">
        <p
          className={cn(
            "truncate font-black leading-tight",
            identity.text,
            size === "sm" ? "text-xs" : "text-sm",
          )}
        >
          {name}
        </p>
        {label && (
          <p className={cn("text-[0.7rem] font-bold leading-tight", identity.text)}>
            {label}
          </p>
        )}
      </div>
      <span
        className={cn(
          "akwaan-numeral ms-auto font-black leading-none text-foreground",
          size === "lg"
            ? "text-4xl"
            : size === "sm"
              ? "text-lg"
              : "text-2xl",
        )}
      >
        {score}
      </span>
    </div>
  );
}

/**
 * Both teams, side by side, in the Match's own order.
 *
 * Takes the team list rather than two props so the order — and therefore the
 * colours — can only come from the server.
 */
export function TeamScoreboard({
  teams,
  activeTeamId,
  size = "default",
  className,
}: {
  teams: ReadonlyArray<{ id: string; name: string; score: number }>;
  activeTeamId?: string;
  size?: "sm" | "default" | "lg";
  className?: string;
}) {
  return (
    <ul
      data-testid="team-scoreboard"
      // Named for what the numbers are: challenges won, not mechanic points.
      aria-label="التحديات المكسوبة"
      className={cn("flex list-none flex-wrap items-stretch gap-2", className)}
    >
      {teams.map((team) => (
        <li key={team.id} className="min-w-[9rem] flex-1">
          <TeamScore
            name={team.name}
            score={team.score}
            identity={teamIdentityOf(team.id, teams)}
            active={team.id === activeTeamId}
            size={size}
            {...(team.id === activeTeamId ? { label: "دورهم الآن" } : {})}
          />
        </li>
      ))}
    </ul>
  );
}
