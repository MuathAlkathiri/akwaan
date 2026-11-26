"use client";

import { useInteractionDeadline } from "./use-interaction-deadline";

/**
 * Whether this phone may take its team's decision right now.
 *
 * A team's decision belongs to one phone: the captain if the team chose one,
 * otherwise whoever the rotation landed on. The server decides and refuses
 * anyone else; this only keeps the other phones from offering a control that
 * would be refused. A teammate is let in once the server's stand-in moment has
 * passed, so a holder whose phone has gone quiet cannot stall the team.
 */
export function useTeamActionHold(held: boolean, standInAt?: string): boolean {
  const untilStandIn = useInteractionDeadline(standInAt, held);
  return held || untilStandIn === 0;
}
