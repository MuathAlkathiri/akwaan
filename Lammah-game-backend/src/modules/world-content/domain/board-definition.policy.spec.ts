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

  it('accepts one Signature, two RYO, and one Flex slot', () => {
    const board = policy.build(validBoard());
    expect(board.blockers).toEqual([]);
    expect(board.slots).toHaveLength(4);
    expect(policy.isBoardReady(board)).toBe(true);
    expect(policy.hasRelationalFlexSlot(board)).toBe(true);
  });

  it('rejects a board that does not hold exactly four enabled configurations', () => {
    const input = validBoard();
    input.configurations = input.configurations.slice(0, 3);
    expect(codesFor(input)).toContain('BOARD_SLOT_COUNT_MISMATCH');
  });

  it('lets the one canonical mechanic fill both RYO positions', () => {
    // ryo_1 and ryo_2 are distinct board positions, so the single canonical RYO
    // mechanic legitimately fills both without a duplicate definition.
    const input = validBoard();
    const shared = input.challengeTypes.get('challenge-ryo')!;
    input.configurations[2] = {
      ...input.configurations[2],
      challengeTypeId: shared.id,
    };
    const board = policy.build(input);
    expect(board.blockers).toEqual([]);
    expect(
      board.slots.filter((slot) => slot.challengeTypeId === shared.id),
    ).toHaveLength(2);
    expect(board.slots.map((slot) => slot.slotKey).sort()).toEqual([
      'flex',
      'ryo_1',
      'ryo_2',
      'signature',
    ]);
  });

  it('rejects two configurations occupying the same board position', () => {
    const input = validBoard();
    input.configurations[2] = {
      ...input.configurations[2],
      slotKey: WorldChallengeSlotKey.RYO_1,
    };
    // The RYO slot-type count is still two, so only the position clash fires.
    expect(codesFor(input)).toEqual(['DUPLICATE_BOARD_SLOT']);
  });

  it('rejects two Signature positions', () => {
    const input = validBoard();
    input.configurations[1] = {
      ...input.configurations[1],
      slotKey: WorldChallengeSlotKey.SIGNATURE,
    };
    expect(codesFor(input)).toContain('BOARD_SLOT_TYPE_COUNT_MISMATCH');
  });

  it('rejects a single RYO position', () => {
    const input = validBoard();
    input.configurations[2] = {
      ...input.configurations[2],
      slotKey: WorldChallengeSlotKey.FLEX,
    };
    expect(codesFor(input)).toContain('BOARD_SLOT_TYPE_COUNT_MISMATCH');
  });

  it('accepts a Co-op mechanic in the Flex slot', () => {
    const input = validBoard();
    const coop = challengeType({
      id: 'challenge-coop',
      family: ChallengeFamily.COOP,
      slug: 'split-clue',
    });
    input.challengeTypes.set(coop.id, coop);
    input.configurations[3] = {
      ...input.configurations[3],
      challengeTypeId: coop.id,
    };
    const board = policy.build(input);
    expect(board.blockers).toEqual([]);
    expect(policy.hasRelationalFlexSlot(board)).toBe(false);
  });

  it('rejects an RYO mechanic in the Flex position', () => {
    const input = validBoard();
    input.configurations[3] = {
      ...input.configurations[3],
      challengeTypeId: 'challenge-ryo-2',
    };
    expect(codesFor(input)).toContain('SLOT_FAMILY_MISMATCH');
  });

  it('rejects a Signature-family mechanic outside the Signature slot', () => {
    const input = validBoard();
    const secondSignature = challengeType({
      id: 'challenge-signature-2',
      family: ChallengeFamily.SIGNATURE,
      slug: 'other-signature',
    });
    input.challengeTypes.set(secondSignature.id, secondSignature);
    input.configurations[1] = {
      ...input.configurations[1],
      challengeTypeId: secondSignature.id,
    };
    expect(codesFor(input)).toContain('SLOT_FAMILY_MISMATCH');
  });

  it('rejects a World with no Signature mechanic named', () => {
    const input = validBoard();
    input.world = { ...input.world, signatureMechanicId: undefined };
    expect(codesFor(input)).toContain('SIGNATURE_MECHANIC_NOT_SET');
  });

  it('requires the Signature reference to match the configured Signature slot', () => {
    const input = validBoard();
    input.world = { ...input.world, signatureMechanicId: 'challenge-ryo' };
    expect(codesFor(input)).toContain('SIGNATURE_MECHANIC_MISMATCH');
  });

  it('rejects an exclusive mechanic that another World already configures', () => {
    const input = validBoard();
    input.foreignAssignments = [
      {
        challengeTypeId: 'challenge-signature',
        worldId: 'world-anime',
        worldName: 'Anime',
      },
    ];
    expect(codesFor(input)).toContain('EXCLUSIVE_CHALLENGE_TYPE_SHARED');
  });

  it('allows one shared mechanic to be configured in several Worlds', () => {
    const input = validBoard();
    input.foreignAssignments = [
      {
        challengeTypeId: 'challenge-ryo',
        worldId: 'world-anime',
        worldName: 'Anime',
      },
    ];
    expect(codesFor(input)).not.toContain('EXCLUSIVE_CHALLENGE_TYPE_SHARED');
  });

  it('reports a configuration whose mechanic was deleted', () => {
    const input = validBoard();
    input.configurations.push(
      configuration({
        id: 'configuration-ghost',
        challengeTypeId: 'challenge-removed',
        slotKey: WorldChallengeSlotKey.FLEX,
      }),
    );
    expect(codesFor(input)).toContain('CONFIGURED_CHALLENGE_TYPE_MISSING');
  });

  it('refuses a draft mechanic in a board slot', () => {
    const input = validBoard();
    const draft = input.challengeTypes.get('challenge-ryo')!;
    input.challengeTypes.set('challenge-ryo', {
      ...draft,
      status: 'draft' as typeof draft.status,
    });
    expect(codesFor(input)).toContain('CHALLENGE_TYPE_NOT_ACTIVE');
  });
});
