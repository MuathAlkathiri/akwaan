import { ScoringRuleRegistry } from '../../scoring/application/scoring-rule.registry';
import { BoardDefinitionPolicy } from './board-definition.policy';
import { ChallengePresentationPolicy } from './challenge-presentation.policy';
import { ChallengeTypePolicy } from './challenge-type.policy';
import {
  ChallengeFamily,
  WorldChallengeSlotKey,
} from './world-content.constants';
import {
  challengeType,
  configuration,
  validBoard,
} from './world-content.fixtures';

describe('BoardDefinitionPolicy', () => {
  const policy = new BoardDefinitionPolicy(
    new ChallengeTypePolicy(
      new ChallengePresentationPolicy(),
      new ScoringRuleRegistry(),
    ),
  );

  const codesFor = (input: Parameters<typeof policy.build>[0]) =>
    policy.build(input).blockers.map((problem) => problem.code);

  it('accepts four generic positions containing four distinct mechanics', () => {
    const board = policy.build(validBoard());
    expect(board.blockers).toEqual([]);
    expect(board.slots).toHaveLength(4);
    expect(policy.isBoardReady(board)).toBe(true);
    expect(policy.hasRelationalChallenge(board)).toBe(true);
  });

  it('requires exactly four enabled configurations', () => {
    const input = validBoard();
    input.configurations = input.configurations.slice(0, 3);
    expect(codesFor(input)).toEqual(
      expect.arrayContaining(['BOARD_SLOT_COUNT_MISMATCH', 'BOARD_SLOT_EMPTY']),
    );
  });

  it('rejects the same mechanic in two positions', () => {
    const input = validBoard();
    input.configurations[2] = {
      ...input.configurations[2],
      challengeTypeId: input.configurations[1].challengeTypeId,
    };
    expect(codesFor(input)).toContain('DUPLICATE_BOARD_CHALLENGE_TYPE');
  });

  it('rejects a duplicated position and reports the resulting empty position', () => {
    const input = validBoard();
    input.configurations[2] = {
      ...input.configurations[2],
      slotKey: WorldChallengeSlotKey.SLOT_2,
    };
    expect(codesFor(input)).toEqual(
      expect.arrayContaining(['DUPLICATE_BOARD_SLOT', 'BOARD_SLOT_EMPTY']),
    );
  });

  it('allows every mechanic family in every generic position', () => {
    const input = validBoard();
    const coop = challengeType({
      id: 'challenge-coop',
      family: ChallengeFamily.COOP,
      slug: 'split-clue',
    });
    input.challengeTypes.set(coop.id, coop);
    input.configurations[0] = {
      ...input.configurations[0],
      challengeTypeId: coop.id,
    };
    expect(policy.build(input).blockers).toEqual([]);
  });

  it('allows a global mechanic to be reused by another World', () => {
    const input = validBoard();
    expect(codesFor(input)).not.toContain('EXCLUSIVE_CHALLENGE_TYPE_SHARED');
  });

  it('reports a configuration whose mechanic was deleted', () => {
    const input = validBoard();
    input.configurations[3] = configuration({
      id: 'configuration-ghost',
      challengeTypeId: 'challenge-removed',
      slotKey: WorldChallengeSlotKey.SLOT_4,
      sortOrder: 3,
    });
    expect(codesFor(input)).toContain('CONFIGURED_CHALLENGE_TYPE_MISSING');
  });

  it('refuses a draft mechanic in a board position', () => {
    const input = validBoard();
    const draft = input.challengeTypes.get('challenge-ryo')!;
    input.challengeTypes.set('challenge-ryo', {
      ...draft,
      status: 'draft' as typeof draft.status,
    });
    expect(codesFor(input)).toContain('CHALLENGE_TYPE_NOT_ACTIVE');
  });
});
