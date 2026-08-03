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
    hasRelationalFlexSlot: false,
    ...overrides,
  });

  const three = () => [
    candidate({
      worldId: 'a',
      worldName: 'Football',
      hasRelationalFlexSlot: true,
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

  it('rejects the same World selected twice', () => {
    expect(codes(['a', 'a', 'b'])).toContain('MATCH_WORLD_DUPLICATED');
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

  it('rejects a three-World selection with zero Relational challenges', () => {
    const candidates = three().map((entry) => ({
      ...entry,
      hasRelationalFlexSlot: false,
    }));
    const report = policy.validateSelectedWorldsForMatch(
      ['a', 'b', 'c'],
      candidates,
    );
    expect(report.blockers.map((problem) => problem.code)).toContain(
      'MATCH_WITHOUT_RELATIONAL_CHALLENGE',
    );
    expect(report.relationalChallengeCount).toBe(0);
  });
});
