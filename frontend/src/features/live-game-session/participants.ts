import type { LiveSessionSnapshot } from "./model";

type Participant = LiveSessionSnapshot["participants"][number];

/**
 * The people actually in the room.
 *
 * A kicked player stays in the snapshot — the server keeps them with
 * `presence: "removed"` so a recap can still name them and so a stale
 * credential can still be refused. Every screen that lists the room rather
 * than looking one person up has to drop them, and the one that forgot left a
 * removed player sitting on the host's screen with a kick button that could
 * only ever answer `PARTICIPANT_REMOVED`.
 *
 * Looking a single participant up by id is different and should not use this:
 * the name of somebody who has since left is still the right answer there.
 */
export function playersInRoom(
  snapshot: Pick<LiveSessionSnapshot, "participants"> | undefined,
): Participant[] {
  return (snapshot?.participants ?? []).filter(
    (person) => person.role !== "controller" && person.presence !== "removed",
  );
}
