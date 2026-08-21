import { MarhalaDifficulty } from '../../world-content/domain/marhala-content.policy';

/**
 * "المرحلة" — the board, its tiles, and what a difficulty is worth.
 *
 * Kept as one declarative configuration rather than scattered through the state
 * machine, because none of it is settled: §17.5 marks the special tiles a
 * **playtest candidate**, and the movement ranges and the timer are balance, not
 * architecture. Rebalancing after playtests should mean editing this file and
 * nothing else.
 */

export const MARHALA_MODE_KEY = 'marhala';

/** 16 positions in a 4×4 serpentine; 16 is the Finish. */
export const MARHALA_BOARD_SIZE = 16;
export const MARHALA_FINISH_POSITION = MARHALA_BOARD_SIZE;

/**
 * Where both teams begin.
 *
 * Position 1 rather than an off-board 0: it is one of the safe destinations, and
 * the traps that send a team to 1 or 2 then read as "back to the start" instead of
 * to a tile nobody has occupied. §17 does not state this, so it is a documented
 * default, configurable like the rest of this file.
 */
export const MARHALA_START_POSITION = 1;

/**
 * One question clock, the same for every difficulty.
 *
 * §17 defines no timer, and the external prototype it referenced no longer
 * exists, so this is a **playtest default**. Deliberately uniform: the timer must
 * not become a second difficulty lever, because the risk the player is choosing
 * is the movement range, not the clock.
 */
export const MARHALA_QUESTION_SECONDS = Number(
  process.env.MARHALA_QUESTION_SECONDS ?? 30,
);

// Difficulty is content metadata and is owned by World Content; the board only
// says what each one is worth in movement.
export { MARHALA_DIFFICULTIES } from '../../world-content/domain/marhala-content.policy';
export type { MarhalaDifficulty } from '../../world-content/domain/marhala-content.policy';

/**
 * What each difficulty can move, inclusive (§17.3).
 *
 * The ranges overlap on purpose. Hard is not simply better: a wide range near a
 * trap cluster is a liability, which is the whole strategic decision.
 */
export const MARHALA_MOVEMENT_RANGES: Readonly<
  Record<MarhalaDifficulty, { min: number; max: number }>
> = {
  easy: { min: 1, max: 2 },
  medium: { min: 2, max: 4 },
  hard: { min: 4, max: 6 },
};

export type MarhalaTileKind = 'normal' | 'boost' | 'trap' | 'finish';

/**
 * The V4 playtest candidate (§17.5). **Not locked balance.**
 *
 * A boost or trap is a *source* whose destination is always a safe tile, so an
 * effect can never chain into another effect. `validateMarhalaBoard` proves that
 * rather than trusting it.
 */
export const MARHALA_BOOSTS: Readonly<Record<number, number>> = {
  3: 7,
  5: 7,
  8: 13,
  10: 13,
  12: 16,
  14: 16,
};

export const MARHALA_TRAPS: Readonly<Record<number, number>> = {
  4: 1,
  6: 2,
  9: 7,
  11: 7,
  15: 13,
};

/** Tiles nothing sends a team away from: safe landings and the finish. */
export const MARHALA_SAFE_POSITIONS: readonly number[] = [1, 2, 7, 13, 16];

/** Every tile has exactly one identity. */
export function marhalaTileKind(position: number): MarhalaTileKind {
  if (position >= MARHALA_FINISH_POSITION) return 'finish';
  if (position in MARHALA_BOOSTS) return 'boost';
  if (position in MARHALA_TRAPS) return 'trap';
  return 'normal';
}

/** Where a tile sends a team, or the same position when it sends them nowhere. */
export function marhalaTileDestination(position: number): number {
  if (position >= MARHALA_FINISH_POSITION) return MARHALA_FINISH_POSITION;
  return MARHALA_BOOSTS[position] ?? MARHALA_TRAPS[position] ?? position;
}

/** The base landings a difficulty could produce from here, before tile effects. */
export function marhalaPossibleLandings(
  from: number,
  difficulty: MarhalaDifficulty,
): number[] {
  const { min, max } = MARHALA_MOVEMENT_RANGES[difficulty];
  const landings: number[] = [];
  for (let step = min; step <= max; step += 1) {
    landings.push(Math.min(from + step, MARHALA_FINISH_POSITION));
  }
  return [...new Set(landings)];
}

export interface MarhalaBoardProblem {
  code: string;
  message: string;
}

/**
 * Prove the configuration obeys its own invariants.
 *
 * Run as a test rather than at boot: this is a design-time contract, and a
 * playtest edit that breaks it should fail the build, not a live match.
 */
export function validateMarhalaBoard(): MarhalaBoardProblem[] {
  const problems: MarhalaBoardProblem[] = [];
  const boosts = Object.keys(MARHALA_BOOSTS).map(Number);
  const traps = Object.keys(MARHALA_TRAPS).map(Number);

  for (const source of [...boosts, ...traps]) {
    if (source < 1 || source >= MARHALA_FINISH_POSITION) {
      problems.push({
        code: 'MARHALA_TILE_OUT_OF_RANGE',
        message: `Tile ${source} is outside 1..${MARHALA_FINISH_POSITION - 1}`,
      });
    }
  }

  // One identity per tile: nothing may be both a boost and a trap.
  for (const shared of boosts.filter((source) => traps.includes(source))) {
    problems.push({
      code: 'MARHALA_TILE_AMBIGUOUS',
      message: `Tile ${shared} is both a boost and a trap`,
    });
  }

  // A destination must be safe, or an effect could chain into another effect.
  for (const [source, destination] of [
    ...Object.entries(MARHALA_BOOSTS),
    ...Object.entries(MARHALA_TRAPS),
  ]) {
    const target = Number(destination);
    if (boosts.includes(target) || traps.includes(target)) {
      problems.push({
        code: 'MARHALA_TILE_CHAINS',
        message: `Tile ${source} sends a team to ${target}, which is itself a special tile`,
      });
    }
    if (!MARHALA_SAFE_POSITIONS.includes(target)) {
      problems.push({
        code: 'MARHALA_DESTINATION_NOT_SAFE',
        message: `Tile ${source} sends a team to ${target}, which is not declared safe`,
      });
    }
    if (target < 1 || target > MARHALA_FINISH_POSITION) {
      problems.push({
        code: 'MARHALA_DESTINATION_OUT_OF_RANGE',
        message: `Tile ${source} sends a team outside the board`,
      });
    }
  }

  for (const safe of MARHALA_SAFE_POSITIONS) {
    if (boosts.includes(safe) || traps.includes(safe)) {
      problems.push({
        code: 'MARHALA_SAFE_TILE_IS_SPECIAL',
        message: `Position ${safe} is declared safe but is also a special source`,
      });
    }
  }

  if (marhalaTileKind(MARHALA_FINISH_POSITION) !== 'finish') {
    problems.push({
      code: 'MARHALA_FINISH_MISCONFIGURED',
      message: `Position ${MARHALA_FINISH_POSITION} must be the finish`,
    });
  }

  return problems;
}

/**
 * The movement a correct answer buys, decided by the server.
 *
 * Deliberately **deterministic from a seed** rather than `Math.random()`, which is
 * the same choice `MatchContentSelector` already makes and for the same reason: a
 * duplicated or replayed command must produce the *same* roll, so a lost
 * acknowledgement cannot move a team twice or move it a different distance the
 * second time. Seeded by the runtime, the turn and the difficulty, so consecutive
 * turns are independent while any one turn is reproducible.
 *
 * A small FNV-1a hash restated here rather than imported: the mechanic domain keeps
 * no import edge into the Match module, exactly as Bomb's content bounds are
 * restated rather than reaching into the legacy question module.
 */
export function marhalaMovementRoll(
  seed: string,
  difficulty: MarhalaDifficulty,
): number {
  const { min, max } = MARHALA_MOVEMENT_RANGES[difficulty];
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  let state = hash >>> 0;
  // One xorshift step, so short seeds that differ by a character do not produce
  // neighbouring rolls.
  state ^= state << 13;
  state >>>= 0;
  state ^= state >>> 17;
  state ^= state << 5;
  state >>>= 0;
  return min + (state % (max - min + 1));
}

/** The seed for one team's roll on one turn, stable across retries. */
export function marhalaRollSeed(input: {
  runtimeId: string;
  turnNumber: number;
  teamId: string;
  difficulty: MarhalaDifficulty;
}): string {
  return `${input.runtimeId}:${input.turnNumber}:${input.teamId}:${input.difficulty}`;
}
