import { Flag, PackageOpen, Trophy } from "lucide-react";

import { cn } from "@/lib/utils";
import { teamIdentityOf } from "@/lib/team-identity";
import { MarhalaBoard } from "./marhala-board";
import {
  MARHALA_FINISH_POSITION,
  MARHALA_START_POSITION,
} from "../marhala.presentation";
import type { LiveSessionSnapshot } from "../../model";
import type { MatchChallengeResult } from "../types";
import { teamName } from "../presentation";

/**
 * How the "المرحلة" race ended, read from the completion summary the launcher
 * recorded.
 *
 * Two endings, and they are genuinely different stories rather than a win and a
 * near-win. A finish is a race someone won on the board. Running out of unseen
 * questions is not a draw and not an error — the account has simply seen every
 * question this position could offer, nobody reached the end, and no reward was
 * given. Presenting that as a tie would be a lie about what happened.
 *
 * The internal race progress stays separate from the Match score: the board says
 * where the tokens finished, and the Match points beside it are the Match's own.
 */
interface MarhalaDetails {
  endedBy?: "finish" | "content-exhausted";
  positions?: Record<string, number>;
  turnsPlayed?: number;
}

export function MarhalaResultRecap({
  result,
  snapshot,
}: {
  result: MatchChallengeResult;
  snapshot: LiveSessionSnapshot;
}) {
  const details = (result.details ?? {}) as MarhalaDetails;
  const exhausted = details.endedBy === "content-exhausted";
  const teams = snapshot.teams.map((team) => ({
    id: team.id,
    name: team.name,
  }));
  const positions = Object.fromEntries(
    teams.map((team) => [
      team.id,
      details.positions?.[team.id] ?? MARHALA_START_POSITION,
    ]),
  );

  return (
    <div className="space-y-4" data-testid="marhala-result-recap">
      <header className="space-y-1.5 text-center">
        {exhausted ? (
          <>
            <PackageOpen
              className="mx-auto size-7 text-muted-foreground"
              aria-hidden
            />
            <p
              className="text-xl font-black text-foreground sm:text-2xl"
              data-testid="marhala-result-exhausted"
            >
              خلصت الأسئلة الجديدة المتاحة لهذا التحدي
            </p>
            <p className="text-sm font-bold text-muted-foreground">
              لم يصل أي فريق إلى النهاية، ولم تُمنح نقاط لهذا التحدي.
            </p>
          </>
        ) : (
          <>
            <Trophy className="mx-auto size-7 text-brand-gold" aria-hidden />
            <p
              className="text-2xl font-black text-foreground sm:text-3xl"
              data-testid="marhala-result-winner"
            >
              {result.winnerTeamId
                ? `${teamName(snapshot, result.winnerTeamId)} وصلوا النهاية`
                : "انتهى السباق"}
            </p>
            {details.turnsPlayed !== undefined && (
              <p className="text-sm font-bold text-muted-foreground">
                بعد{" "}
                <span className="akwaan-numeral">{details.turnsPlayed}</span>{" "}
                دوراً على اللوحة
              </p>
            )}
          </>
        )}
      </header>

      {/* The board as it finished: where each token stopped is the record of the
          race, and it reads at a glance the way the game did. */}
      <div className="mx-auto max-w-xl">
        <MarhalaBoard
          teams={teams}
          positions={positions}
          activeTeamId={result.winnerTeamId ?? ""}
        />
      </div>

      <ul
        className="grid grid-cols-2 gap-2 text-center"
        data-testid="marhala-final-positions"
      >
        {teams.map((team) => {
          const identity = teamIdentityOf(team.id, teams);
          const position = positions[team.id];
          const won = result.winnerTeamId === team.id;
          return (
            <li
              key={team.id}
              data-testid={`marhala-final-${team.id}`}
              className={cn(
                "rounded-[var(--radius)] border px-3 py-2",
                identity.surface,
                identity.border,
              )}
            >
              <p className={cn("truncate text-sm font-black", identity.text)}>
                {team.name}
              </p>
              <p className="inline-flex items-center gap-1 text-xs font-bold text-muted-foreground">
                {position >= MARHALA_FINISH_POSITION ? (
                  <>
                    <Flag className="size-3.5 text-brand-gold" aria-hidden />
                    النهاية
                  </>
                ) : (
                  <>
                    المربّع <span className="akwaan-numeral">{position}</span>
                  </>
                )}
                {won && " · فوز"}
              </p>
            </li>
          );
        })}
      </ul>

      {/* The Match's own reward, kept visibly separate from board progress. */}
      {result.matchPoints.some((entry) => entry.points !== 0) && (
        <div className="flex flex-wrap justify-center gap-2">
          {result.matchPoints
            .filter((entry) => entry.points !== 0)
            .map((entry) => {
              const identity = teamIdentityOf(entry.teamId, teams);
              return (
                <p
                  key={entry.teamId}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-black",
                    identity.surface,
                    identity.border,
                    identity.text,
                  )}
                >
                  {teamName(snapshot, entry.teamId)}
                  <span className="akwaan-numeral">
                    {entry.points > 0 ? `+${entry.points}` : entry.points}
                  </span>
                  نقطة للمباراة
                </p>
              );
            })}
        </div>
      )}
    </div>
  );
}
