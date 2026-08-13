"use client";

import { Button } from "@/components/ui/button";
import {
  useLiveSession,
  useLiveSessionCommands,
} from "../hooks/live-session-context";

const actionLabels: Record<string, string> = {
  ready: "Mark ready",
  start: "Start session",
  pause: "Pause session",
  resume: "Resume session",
  finish: "Finish session",
};

export function SessionControls() {
  const { snapshot, connection } = useLiveSession();
  const command = useLiveSessionCommands();
  if (!snapshot) return null;
  const actions = snapshot.availableActions.filter((action) =>
    Object.prototype.hasOwnProperty.call(actionLabels, action),
  );
  return (
    <div className="flex flex-wrap gap-2" aria-label="Session controls">
      {actions.map((action) => (
        <Button
          key={action}
          variant={action === "finish" ? "outline" : "default"}
          disabled={connection !== "connected"}
          onClick={() =>
            command(action, action === "finish" ? { reason: "completed" } : {})
          }
        >
          {actionLabels[action]}
        </Button>
      ))}
      {snapshot.status === "active" &&
        !snapshot.activeTeamId &&
        snapshot.teams.map((team) => (
          <Button
            key={team.id}
            variant="secondary"
            disabled={connection !== "connected" || team.clock.expired}
            onClick={() =>
              command("start-turn", {
                teamId: team.id,
                reason: "manual",
              })
            }
          >
            Start {team.name}
          </Button>
        ))}
      {snapshot.status === "active" &&
        snapshot.activeTeamId &&
        snapshot.teams
          .filter((team) => team.id !== snapshot.activeTeamId)
          .map((team) => (
            <Button
              key={team.id}
              variant="secondary"
              disabled={connection !== "connected" || team.clock.expired}
              onClick={() =>
                command("switch-turn", {
                  teamId: team.id,
                  reason: "manual",
                })
              }
            >
              Switch to {team.name}
            </Button>
          ))}
    </div>
  );
}
