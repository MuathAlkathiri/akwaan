/**
 * How many phones, on which teams, a mechanic needs before it can start.
 *
 * A domain type because the Match *persists* it: a prepared position records the
 * requirement it was prepared against, so a reload — or a backend restart — reports
 * the same conditions rather than re-deriving them and possibly disagreeing.
 *
 * The values themselves are declared by each mechanic's launcher, which stays the
 * source of truth; this is only the shape they are stated in.
 */
export interface MatchChallengeReadinessRequirement {
  /** Connected, team-assigned players each team needs. */
  minParticipantsPerTeam: number;
  /** Absent when the mechanic imposes no upper bound. */
  maxParticipantsPerTeam?: number;
  /** True when *both* teams must satisfy the range, not just one. */
  requiresBothTeams: boolean;
  /** True when a participant without a team cannot take part. */
  requiresTeamAssignment: boolean;
  /** True when a joined-but-disconnected phone does not count. */
  requiresConnectedPresence: boolean;
}
