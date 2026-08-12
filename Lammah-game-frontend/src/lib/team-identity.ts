/**
 * Which team is which, decided once.
 *
 * A team is identified by its **name**. Colour is a secondary attribute attached to
 * it — the first team of a Match is slot 1 and the second is slot 2, everywhere: the
 * board header, the active-team band, Top 5 ownership, the reveal, the RYO recap, a
 * phone's own screen, and the winner. A screen that picked its own `emerald`/
 * `violet` classes is how the same team ended up two different colours on two
 * different screens.
 *
 * The slot comes from the Match's own team list, which is server-ordered and stable
 * for the life of the Match — so a refresh cannot swap the colours either, and both
 * clients agree without exchanging anything.
 *
 * Nothing here names a hue. Which hue a slot resolves to is the host's pick, held in
 * `src/lib/team-palette.ts` and applied to the `--team-{n}-*` tokens; renaming a
 * team or recolouring it changes no code in this file and no class in any component.
 *
 * Colour is never the only signal (roadmap 25): every consumer pairs it with the
 * team's name, and stateful surfaces add an icon or a label as well.
 */

/** A team's position in the Match, which is what its colour is derived from. */
export type TeamSlot = "1" | "2";

export interface TeamIdentity {
  slot: TeamSlot;
  /** Tinted fill for chips, ownership fields and score tiles. */
  surface: string;
  /** Outline for a card that belongs to, or is owned by, this team. */
  border: string;
  /** Text on a tinted or plain surface, resolved for the active theme. */
  text: string;
  /** Solid fill plus its contrasting text, for the strongest emphasis. */
  solid: string;
  /** A small dot, for legends and inline markers. */
  dot: string;
  /** Ring used when this team is the one currently acting. */
  ring: string;
}

const IDENTITIES: Record<TeamSlot, TeamIdentity> = {
  "1": {
    slot: "1",
    surface: "bg-team-1-tint",
    border: "border-team-1-base",
    text: "text-team-1-text",
    solid: "bg-team-1-fill text-team-1-fill-foreground",
    dot: "bg-team-1-base",
    ring: "ring-team-1-base",
  },
  "2": {
    slot: "2",
    surface: "bg-team-2-tint",
    border: "border-team-2-base",
    text: "text-team-2-text",
    solid: "bg-team-2-fill text-team-2-fill-foreground",
    dot: "bg-team-2-base",
    ring: "ring-team-2-base",
  },
};

export const TEAM_SLOT_ORDER: readonly TeamSlot[] = ["1", "2"];

/** The identity for a slot. */
export function teamIdentity(slot: TeamSlot): TeamIdentity {
  return IDENTITIES[slot];
}

/**
 * The identity of one team, by its position in the Match's own team list.
 *
 * A team the list does not contain gets slot 1 rather than throwing: a stale
 * snapshot naming a departed team should render plainly, not blank the screen.
 */
export function teamIdentityOf(
  teamId: string | undefined,
  teams: ReadonlyArray<{ id: string }>,
): TeamIdentity {
  const index = teams.findIndex((team) => team.id === teamId);
  return IDENTITIES[TEAM_SLOT_ORDER[Math.max(0, index) % TEAM_SLOT_ORDER.length]];
}

/** Every team paired with its identity, in the Match's own order. */
export function teamIdentities<T extends { id: string }>(
  teams: ReadonlyArray<T>,
): Array<T & { identity: TeamIdentity }> {
  return teams.map((team, index) => ({
    ...team,
    identity: IDENTITIES[TEAM_SLOT_ORDER[index % TEAM_SLOT_ORDER.length]],
  }));
}
