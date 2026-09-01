import type { LiveSessionSnapshot } from "../../model";
import type { MatchChallengeResult } from "../types";

export function OddPieceResultRecap({
  result,
  snapshot,
}: {
  result: MatchChallengeResult;
  snapshot: LiveSessionSnapshot;
}) {
  const details = result.details as {
    points?: Record<string, number>;
    puzzles?: Array<{ puzzleIndex: number; winnerTeamId: string | null }>;
  };
  const teamName = (teamId: string) =>
    snapshot.teams.find((team) => team.id === teamId)?.name ?? "الفريق";
  return (
    <div className="space-y-4" data-testid="odd-piece-challenge-result">
      <div className="grid gap-3 sm:grid-cols-2">
        {Object.entries(details.points ?? {}).map(([teamId, points]) => (
          <div
            key={teamId}
            className="rounded-[var(--radius)] border p-5 text-center"
          >
            <p className="font-bold">{teamName(teamId)}</p>
            <p className="text-3xl font-black">{points} / 3</p>
          </div>
        ))}
      </div>
      <p className="text-center text-xl font-black">
        {result.winnerTeamId
          ? `فوز ${teamName(result.winnerTeamId)} بالتحدي`
          : "انتهى التحدي بالتعادل"}
      </p>
      <p className="text-center text-sm font-bold text-muted-foreground">
        نقاط الألغاز أعلاه هي نتيجة الآلية؛ نقطة المباراة تُمنح لفائز التحدي مرة
        واحدة.
      </p>
    </div>
  );
}
