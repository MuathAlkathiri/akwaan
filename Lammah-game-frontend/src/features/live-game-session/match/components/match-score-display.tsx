"use client";

import { useLiveSession } from "../../hooks/live-session-context";

export function MatchScoreDisplay({ compact = false }: { compact?: boolean }) {
  const { snapshot } = useLiveSession();
  if (!snapshot?.match) return null;
  const scores = snapshot.match.scoring.matchTotals;
  return (
    <section
      aria-label="نتيجة المباراة"
      className="grid grid-cols-2 gap-3 rounded-[var(--radius)] border border-warning/25 bg-card/80 p-3 shadow-sm"
    >
      {snapshot.teams.map((team) => {
        const score = scores.find((item) => item.teamId === team.id);
        return (
          <div key={team.id} className="text-center">
            <p className="truncate text-sm text-muted-foreground">{team.name}</p>
            <p
              className={
                compact
                  ? "text-2xl font-black tabular-nums text-slate-950"
                  : "text-4xl font-black tabular-nums text-slate-950"
              }
            >
              {score?.displayTotal ?? 0}
            </p>
          </div>
        );
      })}
    </section>
  );
}

