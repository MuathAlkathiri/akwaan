import { ScoringRuleRegistry } from '../../scoring/application/scoring-rule.registry';
import { BoardDefinitionPolicy } from './board-definition.policy';
import { ChallengePresentationPolicy } from './challenge-presentation.policy';
import { ChallengeTypePolicy } from './challenge-type.policy';
import { ScopeCompatibilityPolicy } from './scope-compatibility.policy';
import {
  ChallengeAnswerMode,
  ChallengeFamily,
  WorldContentStatus,
} from './world-content.constants';
import { challengeType, scope, validBoard } from './world-content.fixtures';

describe('ScopeCompatibilityPolicy (roadmap 5.2)', () => {
  const boards = new BoardDefinitionPolicy(
    new ChallengeTypePolicy(
      new ChallengePresentationPolicy(),
      new ScoringRuleRegistry(),
    ),
  );
  const policy = new ScopeCompatibilityPolicy();

  const boardSlots = () => boards.build(validBoard()).slots;
  const knownIds = () => new Set([...validBoard().challengeTypes.keys()]);

  it('leaves every board challenge usable when nothing is excluded', () => {
    const result = policy.evaluate({
      scope: scope(),
      boardSlots: boardSlots(),
      knownChallengeTypeIds: knownIds(),
    });
    expect(result.usableSlots).toHaveLength(4);
    expect(result.blockers).toEqual([]);
  });

  it('removes excluded mechanics from the readiness calculation', () => {
    const result = policy.evaluate({
      scope: scope({ excludedChallengeTypeIds: ['challenge-relational'] }),
      boardSlots: boardSlots(),
      knownChallengeTypeIds: knownIds(),
    });
    expect(
      result.usableSlots.map((slot) => slot.challengeTypeId),
    ).not.toContain('challenge-relational');
    expect(result.excludedSlots).toHaveLength(1);
  });

  it('fails readiness when fewer than four challenges remain usable', () => {
    const result = policy.evaluate({
      scope: scope({ excludedChallengeTypeIds: ['challenge-relational'] }),
      boardSlots: boardSlots(),
      knownChallengeTypeIds: knownIds(),
    });
    const blocker = result.blockers.find(
      (problem) => problem.code === 'SCOPE_EXCLUSIONS_BELOW_BOARD_MINIMUM',
    );
    expect(blocker).toBeDefined();
    expect(blocker?.details).toMatchObject({
      usableCount: 3,
      requiredCount: 4,
    });
  });

  it('rejects an exclusion pointing at a mechanic that no longer exists', () => {
    const result = policy.evaluate({
      scope: scope({ excludedChallengeTypeIds: ['challenge-deleted'] }),
      boardSlots: boardSlots(),
      knownChallengeTypeIds: knownIds(),
    });
    expect(result.blockers.map((problem) => problem.code)).toContain(
      'SCOPE_EXCLUDES_UNKNOWN_CHALLENGE_TYPE',
    );
  });

  it('warns about a duplicated exclusion instead of counting it twice', () => {
    const result = policy.evaluate({
      scope: scope({
        excludedChallengeTypeIds: [
          'challenge-relational',
          'challenge-relational',
        ],
      }),
      boardSlots: boardSlots(),
      knownChallengeTypeIds: knownIds(),
    });
    expect(result.warnings.map((problem) => problem.code)).toContain(
      'DUPLICATE_SCOPE_EXCLUSION',
    );
    expect(result.excludedSlots).toHaveLength(1);
  });

  it('lets a sensitive Scope exclude Relational and split mechanics by configuration, not by name', () => {
    // The rule is driven by family and answer mode, so no Scope name is ever
    // special-cased (roadmap 5.2).
    const input = validBoard();
    const coop = challengeType({
      id: 'challenge-coop',
      family: ChallengeFamily.COOP,
      slug: 'split-clue',
      answerMode: ChallengeAnswerMode.SPLIT,
    });
    input.challengeTypes.set(coop.id, coop);
    input.configurations = [
      ...input.configurations.slice(0, 3),
      { ...input.configurations[3], challengeTypeId: coop.id },
    ];
    const board = boards.build(input);

    const excluded = [...input.challengeTypes.values()]
      .filter(
        (candidate) =>
          candidate.family === ChallengeFamily.RELATIONAL ||
          candidate.answerMode === ChallengeAnswerMode.SPLIT,
      )
      .map((candidate) => candidate.id);
    expect(excluded).toContain(coop.id);

    const result = policy.evaluate({
      scope: scope({
        id: 'scope-sensitive',
        name: 'Religious Knowledge',
        excludedChallengeTypeIds: excluded,
      }),
      boardSlots: board.slots,
      knownChallengeTypeIds: new Set([...input.challengeTypes.keys()]),
    });

    // The Scope itself is unusable, but the World's board stays valid.
    expect(result.blockers.map((problem) => problem.code)).toEqual([
      'SCOPE_EXCLUSIONS_BELOW_BOARD_MINIMUM',
    ]);
    expect(board.blockers).toEqual([]);
  });

  it('exposes whether a single mechanic is allowed for a Scope', () => {
    const sensitive = scope({
      excludedChallengeTypeIds: ['challenge-relational'],
    });
    expect(
      ScopeCompatibilityPolicy.isChallengeTypeAllowed(
        sensitive,
        'challenge-relational',
      ),
    ).toBe(false);
    expect(
      ScopeCompatibilityPolicy.isChallengeTypeAllowed(
        sensitive,
        'challenge-ryo',
      ),
    ).toBe(true);
  });

  it('warns when an archived Scope is evaluated', () => {
    const result = policy.evaluate({
      scope: scope({ status: WorldContentStatus.ARCHIVED }),
      boardSlots: boardSlots(),
      knownChallengeTypeIds: knownIds(),
    });
    expect(result.warnings.map((problem) => problem.code)).toContain(
      'SCOPE_ARCHIVED',
    );
  });
});
