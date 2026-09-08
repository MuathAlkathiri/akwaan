"use client";

import { MatchHostScreen } from "./components/match-host-screen";
import { MobileGameplayShell } from "./components/mobile-gameplay-shell";
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
 *
 * The shell around the router is a frame, not a branch: the router sits at one
 * fixed position inside it for the whole Match, so no lifecycle change can remount
 * it and re-run fair-start readiness.
 */
export function ParticipantMatchView({
  participantId,
}: {
  participantId?: string;
}) {
  return (
    <MobileGameplayShell {...(participantId ? { participantId } : {})}>
      <MatchStageRouter
        actor="participant"
        {...(participantId ? { participantId } : {})}
      />
    </MobileGameplayShell>
  );
}
