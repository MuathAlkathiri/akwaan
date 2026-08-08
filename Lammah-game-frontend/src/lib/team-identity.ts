/**
 * Which team is which colour, decided once.
 *
 * Team identity is semantic, not decorative. The first team of a Match is green
 * and the second is coral, everywhere: the board header, the active-team marker,
 * Top 5 ownership, the reveal, the RYO recap, a phone's own screen, and the
 * winner. A screen that picked its own `emerald`/`violet` classes is how the same
 * team ended up two different colours on two different screens.
 *
 * The order comes from the Match's own team list, which is server-ordered and
 * stable for the life of the Match — so a refresh cannot swap the colours either.
 *
 * Colour is never the only signal (roadmap 25): every consumer pairs it with the
 * team's name, and stateful surfaces add an icon or a label as well.
 */

export type TeamTone = "green" | "coral";

export interface TeamIdentity {
  tone: TeamTone;
  /** Filled surface for chips, ownership fields and score tiles. */
  surface: string;
  /** Outline for a card that belongs to, or is owned by, this team. */
  border: string;
  /** Text on a light surface. */
  text: string;
  /** Solid fill plus its contrasting text, for the strongest emphasis. */
  solid: string;
  /** A small dot, for legends and inline markers. */
  dot: string;
  /** Ring used when this team is the one currently acting. */
  ring: string;
}

const IDENTITIES: Record<TeamTone, TeamIdentity> = {
  green: {
    tone: "green",
    surface: "bg-team-green-surface",
    border: "border-team-green-border",
    text: "text-team-green-text",
    solid: "bg-team-green text-team-green-strong",
    dot: "bg-team-green",
    ring: "ring-team-green",
  },
  coral: {
    tone: "coral",
    surface: "bg-team-coral-surface",
    border: "border-team-coral-border",
    text: "text-team-coral-text",
    solid: "bg-team-coral text-team-coral-strong",
    dot: "bg-team-coral",
    ring: "ring-team-coral",
  },
};

export const TEAM_TONE_ORDER: readonly TeamTone[] = ["green", "coral"];

/** The identity for a tone. */
export function teamIdentity(tone: TeamTone): TeamIdentity {
  return IDENTITIES[tone];
}

/**
 * The identity of one team, by its position in the Match's own team list.
 *
 * A team the list does not contain gets green rather than throwing: a stale
 * snapshot naming a departed team should render plainly, not blank the screen.
 */
export function teamIdentityOf(
  teamId: string | undefined,
  teams: ReadonlyArray<{ id: string }>,
): TeamIdentity {
  const index = teams.findIndex((team) => team.id === teamId);
  return IDENTITIES[TEAM_TONE_ORDER[Math.max(0, index) % TEAM_TONE_ORDER.length]];
}

/** Every team paired with its identity, in the Match's own order. */
export function teamIdentities<T extends { id: string }>(
  teams: ReadonlyArray<T>,
): Array<T & { identity: TeamIdentity }> {
  return teams.map((team, index) => ({
    ...team,
    identity: IDENTITIES[TEAM_TONE_ORDER[index % TEAM_TONE_ORDER.length]],
  }));
}
