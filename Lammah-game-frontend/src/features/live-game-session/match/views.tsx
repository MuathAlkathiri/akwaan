"use client";

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
 * A player's phone. It carries no participant id: the server already scopes the
 * snapshot and the runtime projection to whoever is asking.
 *
 * It owns its own surface, because a phone has no page shell around it.
 */
export function ParticipantMatchView() {
  return (
    <div className="min-h-screen bg-[#fffaf0] px-3 py-4">
      <MatchStageRouter actor="participant" />
    </div>
  );
}
