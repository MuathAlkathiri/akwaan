/**
 * Who moves when the host says «قسّمهم لي».
 *
 * Pure on purpose: the balancing is the part that can be wrong, and it is far
 * easier to be sure of it here than through a mounted room and a queue of
 * requests.
 *
 * It aims for sides that differ by at most one and moves as few people as it
 * can to get there: players who already chose a side keep it unless the split
 * actually needs them, and whoever joined last is moved before whoever joined
 * first, so the people who have been sitting there longest are left alone.
 */
export interface SplitInput {
  /** Player ids on the first team, in join order. */
  firstSide: readonly string[];
  /** Player ids on the second team, in join order. */
  secondSide: readonly string[];
  /** Player ids with no team yet, in join order. */
  unplaced: readonly string[];
  firstTeamId: string;
  secondTeamId: string;
}

export interface SplitMove {
  participantId: string;
  teamId: string;
}

export function planSplit(input: SplitInput): SplitMove[] {
  const { firstSide, secondSide, unplaced, firstTeamId, secondTeamId } = input;
  const total = firstSide.length + secondSide.length + unplaced.length;
  // The larger half goes to the first team, so an odd number of players is
  // resolved the same way every time rather than by whoever happened to join.
  const targets = [Math.ceil(total / 2), Math.floor(total / 2)];
  const sides: string[][] = [[...firstSide], [...secondSide]];
  const pool = [...unplaced];

  // Overfull sides give people up first, newest first: they are the ones the
  // other side or the pool's leftovers will need.
  for (const index of [0, 1]) {
    while (sides[index].length > targets[index]) pool.push(sides[index].pop()!);
  }
  // Then the pool fills whatever is short.
  for (const index of [0, 1]) {
    while (sides[index].length < targets[index] && pool.length > 0) {
      sides[index].push(pool.shift()!);
    }
  }

  const teamIds = [firstTeamId, secondTeamId];
  const before = new Map<string, string | undefined>();
  firstSide.forEach((id) => before.set(id, firstTeamId));
  secondSide.forEach((id) => before.set(id, secondTeamId));
  unplaced.forEach((id) => before.set(id, undefined));

  const moves: SplitMove[] = [];
  sides.forEach((side, index) => {
    for (const participantId of side) {
      if (before.get(participantId) === teamIds[index]) continue;
      moves.push({ participantId, teamId: teamIds[index] });
    }
  });
  return moves;
}
