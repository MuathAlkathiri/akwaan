import type { LiveSessionSnapshot } from "../../model";
import type { MatchChallengeResult } from "../types";
import { teamName } from "../presentation";
export function FirstNoteResultRecap({
  result,
  snapshot,
}: {
  result: MatchChallengeResult;
  snapshot: LiveSessionSnapshot;
}) {
  const details = result.details as {
    mechanicTotals?: Record<string, number>;
    items?: Array<{
      title: string;
      finalBidSeconds: number;
      winnerTeamId: string | null;
      stolen: boolean;
    }>;
  };
  return (
    <div className="space-y-5" data-testid="first-note-challenge-result">
      <h2 className="text-center text-2xl font-black">
        {result.tie
          ? "تعادل في نقاط الأغاني"
          : `فوز ${teamName(snapshot, result.winnerTeamId!)}`}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {snapshot.teams.map((team) => (
          <div
            key={team.id}
            className="rounded-[var(--radius)] border p-4 text-center"
          >
            <p className="font-black">{team.name}</p>
            <p className="text-3xl font-black">
              {details.mechanicTotals?.[team.id] ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">نقاط داخلية</p>
          </div>
        ))}
      </div>
      <ol className="space-y-2">
        {details.items?.map((item, index) => (
          <li
            key={`${index}:${item.title}`}
            className="flex justify-between rounded-[var(--radius)] border p-3"
          >
            <strong>{item.title}</strong>
            <span>
              {item.finalBidSeconds} ثانية ·{" "}
              {item.winnerTeamId
                ? teamName(snapshot, item.winnerTeamId)
                : "بدون فائز"}
              {item.stolen ? " · سرقة" : ""}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
