import {
  MatchWorldCandidate,
  MatchWorldSelectionPolicy,
} from './match-world-selection.policy';
import { WorldContentStatus } from './world-content.constants';

describe('MatchWorldSelectionPolicy (roadmap 3.1, 11)', () => {
  const policy = new MatchWorldSelectionPolicy();

  const candidate = (
    overrides: Partial<MatchWorldCandidate> = {},
  ): MatchWorldCandidate => ({
    worldId: 'world-football',
    worldName: 'Football',
    status: WorldContentStatus.ACTIVE,
    boardReady: true,
    hasRelationalChallenge: false,
    ...overrides,
  });

  const three = () => [
    candidate({
      worldId: 'a',
      worldName: 'Football',
      hasRelationalChallenge: true,
    }),
    candidate({ worldId: 'b', worldName: 'Anime' }),
    candidate({ worldId: 'c', worldName: 'Video Games' }),
  ];

  const codes = (worldIds: string[], candidates = three()) =>
    policy
      .validateSelectedWorldsForMatch(worldIds, candidates)
      .blockers.map((problem) => problem.code);

  it('accepts three board-ready Worlds with at least one Relational challenge', () => {
    const report = policy.validateSelectedWorldsForMatch(
      ['a', 'b', 'c'],
      three(),
    );
    expect(report.blockers).toEqual([]);
    expect(report.readiness).toBe('ready');
    expect(report.relationalChallengeCount).toBe(1);
  });

  it('requires exactly three Worlds', () => {
    expect(codes(['a', 'b'])).toContain('MATCH_WORLD_COUNT_INVALID');
    expect(codes(['a', 'b', 'c', 'a'])).toContain('MATCH_WORLD_COUNT_INVALID');
  });

  it('accepts the same World played more than once', () => {
    // Football, Anime, Football and Football three times are both legitimate:
    // each occurrence carries its own board progress in the Match aggregate.
    const mixed = policy.validateSelectedWorldsForMatch(
      ['a', 'b', 'a'],
      three(),
    );
    expect(mixed.blockers).toEqual([]);
    expect(mixed.structurallyValid).toBe(true);
    expect(mixed.worldIds).toEqual(['a', 'b', 'a']);
    expect(mixed.distinctWorldIds).toEqual(['a', 'b']);

    const repeated = policy.validateSelectedWorldsForMatch(
      ['a', 'a', 'a'],
      three(),
    );
    expect(repeated.blockers).toEqual([]);
    expect(repeated.structurallyValid).toBe(true);
    expect(repeated.distinctWorldIds).toEqual(['a']);
  });

  it('still requires three occurrences when a World repeats', () => {
    expect(codes(['a', 'a'])).toContain('MATCH_WORLD_COUNT_INVALID');
    expect(codes(['a', 'a', 'a', 'a'])).toContain('MATCH_WORLD_COUNT_INVALID');
  });

  it('validates a repeated World on its own merits, once', () => {
    const candidates = three();
    candidates[0] = candidate({
      worldId: 'a',
      worldName: 'Football',
      hasRelationalChallenge: true,
      boardReady: false,
    });
    const report = policy.validateSelectedWorldsForMatch(
      ['a', 'a', 'b'],
      candidates,
    );
    expect(
      report.blockers.filter(
        (problem) => problem.code === 'MATCH_WORLD_BOARD_NOT_READY',
      ),
    ).toHaveLength(1);
  });

  it('rejects a World that does not exist', () => {
    expect(codes(['a', 'b', 'missing'])).toContain('MATCH_WORLD_NOT_FOUND');
  });

  it('rejects a World that is not active', () => {
    const candidates = three();
    candidates[1] = candidate({
      worldId: 'b',
      worldName: 'Anime',
      status: WorldContentStatus.DRAFT,
    });
    expect(codes(['a', 'b', 'c'], candidates)).toContain(
      'MATCH_WORLD_NOT_ACTIVE',
    );
  });

  it('rejects a World whose board is not complete', () => {
    const candidates = three();
    candidates[2] = candidate({
      worldId: 'c',
      worldName: 'Video Games',
      boardReady: false,
    });
    expect(codes(['a', 'b', 'c'], candidates)).toContain(
      'MATCH_WORLD_BOARD_NOT_READY',
    );
  });

  it('reports a missing Relational challenge as production readiness, not a structural error', () => {
    const candidates = three().map((entry) => ({
      ...entry,
      hasRelationalChallenge: false,
    }));
    const report = policy.validateSelectedWorldsForMatch(
      ['a', 'b', 'c'],
      candidates,
    );

    // The rule is preserved and explicit, so it cannot be lost by accident...
    expect(report.productionBlockers.map((problem) => problem.code)).toEqual([
      'MATCH_WITHOUT_RELATIONAL_CHALLENGE',
    ]);
    expect(report.productionReady).toBe(false);
    expect(report.relationalChallengeCount).toBe(0);
    // ...while a development Match of three valid Worlds is still playable.
    expect(report.blockers).toEqual([]);
    expect(report.structurallyValid).toBe(true);
    expect(report.readiness).toBe('limited');
  });

  it('is production ready only when structure and composition both hold', () => {
    const ready = policy.validateSelectedWorldsForMatch(
      ['a', 'b', 'c'],
      three(),
    );
    expect(ready.productionReady).toBe(true);
    expect(ready.productionBlockers).toEqual([]);
    expect(ready.readiness).toBe('ready');

    const broken = policy.validateSelectedWorldsForMatch(['a', 'b'], three());
    expect(broken.structurallyValid).toBe(false);
    expect(broken.productionReady).toBe(false);
  });
});
