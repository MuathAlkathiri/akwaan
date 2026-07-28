"use client";

import { Clock3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLiveSession } from "../hooks/live-session-context";
import { useTeamClockDisplay } from "../hooks/use-team-clock-display";

function TeamClockDisplay({
  teamId,
  name,
  active,
}: {
  teamId: string;
  name: string;
  active: boolean;
}) {
  const clock = useTeamClockDisplay(teamId);
  return (
    <Card
      className={active ? "border-primary ring-2 ring-primary/20" : undefined}
      aria-current={active ? "true" : undefined}
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          {name}
          {active && (
            <Clock3 className="text-primary" aria-label="Active turn" />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <output
          className="font-mono text-3xl font-bold tabular-nums"
          aria-label={`${name} remaining time`}
        >
          {clock.formatted}
        </output>
      </CardContent>
    </Card>
  );
}

export function TeamClockList() {
  const { snapshot } = useLiveSession();
  if (!snapshot) return null;
  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {snapshot.teams.map((team) => (
        <TeamClockDisplay
          key={team.id}
          teamId={team.id}
          name={team.name}
          active={team.id === snapshot.activeTeamId}
        />
      ))}
    </section>
  );
}
