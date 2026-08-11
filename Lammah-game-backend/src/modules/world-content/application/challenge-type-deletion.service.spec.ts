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

  function setup(matchUsage = 0) {
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
      countReferencesFrom: jest.fn().mockResolvedValue(matchUsage),
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
      contentItemCount: 36,
      worldAssignmentCount: 2,
      scopeExclusionCount: 1,
      canHardDelete: true,
      archiveRequired: false,
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

  it('re-checks Match usage and rejects hard delete without cascading', async () => {
    const { service, configurations, contentItems, challengeTypes } = setup(1);
    await expect(service.remove(id)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CHALLENGE_TYPE_HAS_MATCH_HISTORY',
      }),
    });
    expect(configurations.deleteByChallengeType).not.toHaveBeenCalled();
    expect(contentItems.deleteByChallengeType).not.toHaveBeenCalled();
    expect(challengeTypes.deleteById).not.toHaveBeenCalled();
  });

  it('archives a historically used mechanic without deleting dependencies', async () => {
    const { service, challengeTypes, contentItems } = setup(3);
    await service.archive(id);
    expect(challengeTypes.updateById).toHaveBeenCalledWith(id, {
      status: WorldContentStatus.ARCHIVED,
    });
    expect(contentItems.deleteByChallengeType).not.toHaveBeenCalled();
  });

  it('rejects archive when hard deletion is still safe', async () => {
    const { service, challengeTypes } = setup();
    await expect(service.archive(id)).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'CHALLENGE_TYPE_ARCHIVE_NOT_REQUIRED',
      }),
    });
    expect(challengeTypes.updateById).not.toHaveBeenCalled();
  });
});
