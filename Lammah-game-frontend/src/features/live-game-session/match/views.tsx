"use client";

import { ThemeToggle } from "@/components/akwaan/theme-toggle";
import { MatchHostScreen } from "./components/match-host-screen";
import { MatchStageRouter } from "./match-stage-router";

/** The host's surface. One screen for every stage of the Match. */
export function ControllerMatchView() {
  return <MatchHostScreen />;
}

export function SharedScreenMatchView() {
  return <MatchStageRouter actor="shared-screen" />;
}

/**
 * A player's phone.
 *
 * It owns its own surface, because a phone has no page shell around it, and it
 * stays on this one page for the whole Match: waiting, preflight, gameplay, then
 * waiting again. The id is only used to name the team on the waiting screen —
 * the server scopes everything else to whoever is asking.
 */
export function ParticipantMatchView({
  participantId,
}: {
  participantId?: string;
}) {
  return (
    <div className="min-h-screen bg-background px-3 py-4">
      {/* A phone keeps its own theme for the whole Match, not just the join screen. */}
      <div className="mb-2 flex justify-end">
        <ThemeToggle />
      </div>
      <MatchStageRouter
        actor="participant"
        {...(participantId ? { participantId } : {})}
      />
    </div>
  );
}
