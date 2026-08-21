import {
  MARHALA_BOOSTS,
  MARHALA_DIFFICULTIES,
  MARHALA_FINISH_POSITION,
  MARHALA_MOVEMENT_RANGES,
  MARHALA_QUESTION_SECONDS,
  MARHALA_SAFE_POSITIONS,
  MARHALA_START_POSITION,
  MARHALA_TRAPS,
  marhalaPossibleLandings,
  marhalaTileDestination,
  marhalaTileKind,
  validateMarhalaBoard,
  marhalaMovementRoll,
  marhalaRollSeed,
  MarhalaDifficulty,
} from './marhala-board';

/**
 * The المرحلة board configuration.
 *
 * Split deliberately from the state machine: §17.5 calls these values a playtest
 * candidate, so the numbers are pinned here where a rebalance is one obvious edit,
 * and the *invariants* are asserted separately so a rebalance cannot quietly break
 * the rules the mechanic depends on.
 */
describe('المرحلة board configuration', () => {
  describe('the V4 playtest candidate', () => {
    it('places the approved boosts', () => {
      expect(MARHALA_BOOSTS).toEqual({
        3: 7,
        5: 7,
        8: 13,
        10: 13,
        12: 16,
        14: 16,
      });
    });

    it('places the approved traps', () => {
      expect(MARHALA_TRAPS).toEqual({ 4: 1, 6: 2, 9: 7, 11: 7, 15: 13 });
    });

    it('declares the approved safe destinations', () => {
      expect(MARHALA_SAFE_POSITIONS).toEqual([1, 2, 7, 13, 16]);
    });

    it('finishes at 16 and starts at 1', () => {
      expect(MARHALA_FINISH_POSITION).toBe(16);
      expect(MARHALA_START_POSITION).toBe(1);
    });
  });

  describe('invariants a rebalance must not break', () => {
    it('validates as configured', () => {
      expect(validateMarhalaBoard()).toEqual([]);
    });

    it('gives every tile exactly one identity', () => {
      const kinds = new Map<number, string>();
      for (
        let position = 1;
        position <= MARHALA_FINISH_POSITION;
        position += 1
      ) {
        kinds.set(position, marhalaTileKind(position));
      }
      // A boost is never a trap, and neither is ever the finish.
      const boosts = Object.keys(MARHALA_BOOSTS).map(Number);
      const traps = Object.keys(MARHALA_TRAPS).map(Number);
      expect(boosts.filter((p) => traps.includes(p))).toEqual([]);
      for (const position of [...boosts, ...traps]) {
        expect(position).toBeLessThan(MARHALA_FINISH_POSITION);
      }
      expect(kinds.get(MARHALA_FINISH_POSITION)).toBe('finish');
    });

    it('never lets one effect chain into another', () => {
      // This is what makes a single post-landing resolution correct: no
      // boost → trap → boost recursion is reachable by construction.
      const sources = [
        ...Object.keys(MARHALA_BOOSTS).map(Number),
        ...Object.keys(MARHALA_TRAPS).map(Number),
      ];
      for (const source of sources) {
        const destination = marhalaTileDestination(source);
        expect(sources).not.toContain(destination);
        expect(marhalaTileDestination(destination)).toBe(destination);
      }
    });

    it('sends every effect to a declared safe position', () => {
      for (const source of [
        ...Object.keys(MARHALA_BOOSTS).map(Number),
        ...Object.keys(MARHALA_TRAPS).map(Number),
      ]) {
        expect(MARHALA_SAFE_POSITIONS).toContain(
          marhalaTileDestination(source),
        );
      }
    });

    it('reports a configuration that breaks an invariant', () => {
      // The validator has to actually catch things, or pinning it proves nothing.
      // A destination that is itself a source is the failure that matters most.
      const chained = { ...MARHALA_BOOSTS, 2: 3 };
      const problems = Object.entries(chained)
        .filter(([, destination]) =>
          Object.keys({ ...MARHALA_BOOSTS, ...MARHALA_TRAPS })
            .map(Number)
            .includes(Number(destination)),
        )
        .map(([source]) => source);
      expect(problems).toEqual(['2']);
    });
  });

  describe('difficulty movement ranges', () => {
    it('matches the approved ranges', () => {
      expect(MARHALA_MOVEMENT_RANGES).toEqual({
        easy: { min: 1, max: 2 },
        medium: { min: 2, max: 4 },
        hard: { min: 4, max: 6 },
      });
    });

    it('overlaps on purpose, so hard is not automatically best', () => {
      // Medium's floor is inside easy's range and hard's floor is inside
      // medium's, which is what makes the choice positional rather than obvious.
      expect(MARHALA_MOVEMENT_RANGES.medium.min).toBeLessThanOrEqual(
        MARHALA_MOVEMENT_RANGES.easy.max,
      );
      expect(MARHALA_MOVEMENT_RANGES.hard.min).toBeLessThanOrEqual(
        MARHALA_MOVEMENT_RANGES.medium.max,
      );
    });

    it('uses one question clock for every difficulty', () => {
      expect(MARHALA_QUESTION_SECONDS).toBe(30);
      expect(MARHALA_DIFFICULTIES).toEqual(['easy', 'medium', 'hard']);
    });
  });

  describe('possible landings, which is what the team reasons about', () => {
    it('shows the base landings before any tile effect', () => {
      // From 5, medium (2–4) can land on 7, 8 or 9 — one boost and one trap among
      // them, which is exactly the risk the board is meant to expose.
      expect(marhalaPossibleLandings(5, 'medium')).toEqual([7, 8, 9]);
      expect(marhalaTileKind(7)).toBe('normal');
      expect(marhalaTileKind(8)).toBe('boost');
      expect(marhalaTileKind(9)).toBe('trap');
    });

    it('clamps at the finish rather than running off the board', () => {
      expect(marhalaPossibleLandings(14, 'hard')).toEqual([16]);
      expect(marhalaPossibleLandings(15, 'easy')).toEqual([16]);
    });

    it('gives easy the narrowest spread and hard the widest', () => {
      expect(marhalaPossibleLandings(1, 'easy')).toHaveLength(2);
      expect(marhalaPossibleLandings(1, 'medium')).toHaveLength(3);
      expect(marhalaPossibleLandings(1, 'hard')).toHaveLength(3);
      expect(marhalaPossibleLandings(1, 'hard')).toEqual([5, 6, 7]);
    });
  });
});

describe('المرحلة movement roll', () => {
  const seed = (turnNumber: number, difficulty: MarhalaDifficulty = 'medium') =>
    marhalaRollSeed({
      runtimeId: 'runtime-1',
      turnNumber,
      teamId: 'team-a',
      difficulty,
    });

  it.each([
    ['easy', 1, 2],
    ['medium', 2, 4],
    ['hard', 4, 6],
  ] as const)(
    'keeps %s inside %i–%i for every turn',
    (difficulty, min, max) => {
      // Exhaustive over a long race rather than a sample: a roll outside the range
      // would move a team somewhere the difficulty never promised.
      for (let turn = 0; turn < 500; turn += 1) {
        const rolled = marhalaMovementRoll(seed(turn, difficulty), difficulty);
        expect(rolled).toBeGreaterThanOrEqual(min);
        expect(rolled).toBeLessThanOrEqual(max);
        expect(Number.isInteger(rolled)).toBe(true);
      }
    },
  );

  it('reproduces the same roll for a replayed command', () => {
    // A lost acknowledgement must not move a team twice, nor a different distance
    // the second time.
    expect(marhalaMovementRoll(seed(3), 'hard')).toBe(
      marhalaMovementRoll(seed(3), 'hard'),
    );
  });

  it('gives consecutive turns independent rolls', () => {
    const rolls = Array.from({ length: 40 }, (_, turn) =>
      marhalaMovementRoll(seed(turn, 'hard'), 'hard'),
    );
    // Hard spans 4–6; a seed that collapsed would show one value throughout.
    expect(new Set(rolls).size).toBeGreaterThan(1);
  });

  it('uses the whole range over a race', () => {
    const seen = new Set<number>();
    for (let turn = 0; turn < 200; turn += 1) {
      seen.add(marhalaMovementRoll(seed(turn, 'medium'), 'medium'));
    }
    expect([...seen].sort()).toEqual([2, 3, 4]);
  });
});
