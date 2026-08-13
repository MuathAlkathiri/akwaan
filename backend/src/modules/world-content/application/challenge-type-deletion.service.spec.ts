import { ScoringRuleRegistry } from '../../scoring/application/scoring-rule.registry';
import { ChallengePresentationPolicy } from '../domain/challenge-presentation.policy';
import { ChallengeTypePolicy } from '../domain/challenge-type.policy';
import {
  ChallengeAnswerMode,
  ChallengeFamily,
  ChallengeItemStructure,
  WorldContentStatus,
} from '../domain/world-content.constants';
import { ChallengeTypeService } from './challenge-type.service';

describe('ChallengeType deletion lifecycle', () => {
  const id = '507f1f77bcf86cd799439011';
  const existing = {
    _id: id,
    name: 'Disposable',
    slug: 'disposable',
    family: ChallengeFamily.COOP,
    itemStructure: ChallengeItemStructure.DISCRETE_TRIPLE,
    answerMode: ChallengeAnswerMode.CLOSEST,
    defaultPresentation: {
      inputType: 'phone-number',
      timerSeconds: 45,
      soundPack: null,
      revealStyle: null,
    },
    scoringRuleId: 'challenge.win',
    status: WorldContentStatus.DRAFT,
    sortOrder: 0,
  };

  function setup(
    usage: { active?: number; historical?: number; unsafe?: number } = {},
  ) {
    const challengeTypes = {
      findById: jest.fn().mockResolvedValue(existing),
      deleteById: jest.fn().mockResolvedValue(existing),
      updateById: jest.fn().mockResolvedValue({
        ...existing,
        status: WorldContentStatus.ARCHIVED,
      }),
    };
    const configurations = {
      countByChallengeType: jest.fn().mockResolvedValue(2),
      deleteByChallengeType: jest.fn().mockResolvedValue(2),
    };
    const contentItems = {
      countByChallengeType: jest.fn().mockResolvedValue(36),
      deleteByChallengeType: jest.fn().mockResolvedValue(36),
    };
    const scopes = {
      countExcludingChallengeType: jest.fn().mockResolvedValue(1),
      removeChallengeTypeFromExclusions: jest.fn().mockResolvedValue(1),
    };
    const references = {
      countReferencesFrom: jest.fn((source: string) =>
        Promise.resolve(
          source === 'persisted-matches-active'
            ? (usage.active ?? 0)
            : source === 'persisted-matches-historical'
              ? (usage.historical ?? 0)
              : (usage.unsafe ?? 0),
        ),
      ),
    };
    const lifecycle = { markDeleted: jest.fn() };
    const assets = { discard: jest.fn() };
    const service = new ChallengeTypeService(
      challengeTypes as never,
      configurations as never,
      contentItems as never,
      scopes as never,
      new ChallengeTypePolicy(
        new ChallengePresentationPolicy(),
        new ScoringRuleRegistry(),
      ),
      new ScoringRuleRegistry(),
      assets as never,
      references as never,
      lifecycle as never,
    );
    return {
      service,
      challengeTypes,
      configurations,
      contentItems,
      scopes,
      references,
      assets,
    };
  }

  it('returns backend-authoritative dependency counts', async () => {
    const { service } = setup();
    await expect(service.deletionPreview(id)).resolves.toMatchObject({
      challengeTypeId: id,
      historicalMatchUsageCount: 0,
      activeMatchUsageCount: 0,
      contentItemCount: 36,
      worldAssignmentCount: 2,
      scopeExclusionCount: 1,
      canHardDelete: true,
      historicalSnapshotSafe: true,
    });
  });

  it('cascades authoring dependencies before deleting the root', async () => {
    const { service, configurations, contentItems, scopes, challengeTypes } =
      setup();
    await expect(service.remove(id)).resolves.toEqual({ id });
    expect(configurations.deleteByChallengeType).toHaveBeenCalledWith(id);
    expect(contentItems.deleteByChallengeType).toHaveBeenCalledWith(id);
    expect(scopes.removeChallengeTypeFromExclusions).toHaveBeenCalledWith(id);
    expect(challengeTypes.deleteById).toHaveBeenCalledWith(id);
  });

  it('allows completed history and preserves it outside the authoring cascade', async () => {
    const { service, challengeTypes } = setup({ historical: 3 });
    await expect(service.remove(id)).resolves.toEqual({ id });
    expect(challengeTypes.deleteById).toHaveBeenCalledWith(id);
  });

  it('re-checks active Match usage and rejects hard delete without cascading', async () => {
    const { service, configurations, contentItems, challengeTypes } = setup({
      active: 1,
    });
    await expect(service.remove(id)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CHALLENGE_TYPE_IN_ACTIVE_MATCH',
      }),
    });
    expect(configurations.deleteByChallengeType).not.toHaveBeenCalled();
    expect(contentItems.deleteByChallengeType).not.toHaveBeenCalled();
    expect(challengeTypes.deleteById).not.toHaveBeenCalled();
  });

  it('blocks deletion when completed history lacks its identity snapshot', async () => {
    const { service, challengeTypes } = setup({ historical: 1, unsafe: 1 });
    await expect(service.remove(id)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CHALLENGE_TYPE_HISTORY_SNAPSHOT_UNSAFE',
      }),
    });
    expect(challengeTypes.deleteById).not.toHaveBeenCalled();
  });
});
