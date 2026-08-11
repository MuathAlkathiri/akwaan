import {
  ChallengeAnswerMode,
  ChallengeFamily,
  ChallengeItemStructure,
  ContentItemStatus,
  WorldChallengeSlotKey,
  WorldContentStatus,
} from './world-content.constants';
import { BoardDefinitionInput } from './board-definition.policy';
import {
  ChallengePresentation,
  ChallengeTypeView,
  ContentAnswerPayload,
  ContentItemView,
  ScopeView,
  WorldChallengeConfigurationView,
  WorldView,
} from './world-content.types';
import { SCORING_RULE_IDS } from '../../scoring/domain/scoring-rule';

/** Shared builders so each spec states only what it is actually testing. */

export function presentation(
  overrides: Partial<ChallengePresentation> = {},
): ChallengePresentation {
  return {
    inputType: 'phone-multiple-choice',
    timerSeconds: 25,
    soundPack: null,
    revealStyle: null,
    ...overrides,
  };
}

export function world(overrides: Partial<WorldView> = {}): WorldView {
  return {
    id: 'world-football',
    name: 'Football',
    slug: 'football',
    status: WorldContentStatus.DRAFT,
    ...overrides,
  };
}

export function scope(overrides: Partial<ScopeView> = {}): ScopeView {
  return {
    id: 'scope-world-cup',
    worldId: 'world-football',
    name: 'World Cup',
    slug: 'world-cup',
    status: WorldContentStatus.ACTIVE,
    excludedChallengeTypeIds: [],
    ...overrides,
  };
}

export function challengeType(
  overrides: Partial<ChallengeTypeView> = {},
): ChallengeTypeView {
  const family = overrides.family ?? ChallengeFamily.RYO;
  return {
    id: `challenge-${family}`,
    name: `Mechanic ${family}`,
    slug: `mechanic-${family}`,
    family,
    itemStructure: ChallengeItemStructure.DISCRETE_TRIPLE,
    answerMode: defaultAnswerMode(family),
    defaultPresentation: presentation(),
    scoringRuleId: defaultScoringRuleId(family),
    status: WorldContentStatus.ACTIVE,
    ...overrides,
  };
}

export function configuration(
  overrides: Partial<WorldChallengeConfigurationView> = {},
): WorldChallengeConfigurationView {
  const slotKey = overrides.slotKey ?? WorldChallengeSlotKey.SLOT_2;
  return {
    id: 'configuration-1',
    worldId: 'world-football',
    challengeTypeId: 'challenge-ryo',
    slotKey,
    sortOrder: 0,
    isEnabled: true,
    ...overrides,
  };
}

export function contentItem(
  overrides: Partial<ContentItemView> = {},
): ContentItemView {
  return {
    id: 'content-1',
    scopeId: 'scope-world-cup',
    worldId: 'world-football',
    prompt: { ar: 'من فاز بكأس العالم 2018؟' },
    compatibleChallengeTypeIds: ['challenge-ryo'],
    answerPayload: multipleChoicePayload(),
    isReusableAcrossSessions: false,
    status: ContentItemStatus.DRAFT,
    ...overrides,
  };
}

export function multipleChoicePayload(
  overrides: Partial<
    Extract<ContentAnswerPayload, { mode: ChallengeAnswerMode.MULTIPLE_CHOICE }>
  > = {},
): ContentAnswerPayload {
  return {
    mode: ChallengeAnswerMode.MULTIPLE_CHOICE,
    options: [
      { id: 'france', label: { ar: 'فرنسا' } },
      { id: 'croatia', label: { ar: 'كرواتيا' } },
    ],
    correctOptionId: 'france',
    ...overrides,
  };
}

/**
 * A complete board with four generic positions and four distinct mechanics.
 */
export function validBoard(): BoardDefinitionInput {
  const signature = challengeType({
    id: 'challenge-signature',
    family: ChallengeFamily.SIGNATURE,
    slug: 'football-signature',
  });
  const ryoOne = challengeType({
    id: 'challenge-ryo',
    slug: 'read-your-opponent',
    scoringRuleId: SCORING_RULE_IDS.CHALLENGE_WIN,
  });
  const ryoTwo = challengeType({
    id: 'challenge-ryo-2',
    slug: 'read-your-opponent-numbers',
  });
  const flex = challengeType({
    id: 'challenge-relational',
    family: ChallengeFamily.RELATIONAL,
    slug: 'same-wavelength',
  });
  return {
    world: world({ status: WorldContentStatus.ACTIVE }),
    challengeTypes: new Map(
      [signature, ryoOne, ryoTwo, flex].map((entry) => [entry.id, entry]),
    ),
    configurations: [
      configuration({
        id: 'configuration-signature',
        challengeTypeId: signature.id,
        slotKey: WorldChallengeSlotKey.SLOT_1,
      }),
      configuration({
        id: 'configuration-ryo-1',
        challengeTypeId: ryoOne.id,
        slotKey: WorldChallengeSlotKey.SLOT_2,
        sortOrder: 1,
      }),
      configuration({
        id: 'configuration-ryo-2',
        challengeTypeId: ryoTwo.id,
        slotKey: WorldChallengeSlotKey.SLOT_3,
        sortOrder: 2,
      }),
      configuration({
        id: 'configuration-flex',
        challengeTypeId: flex.id,
        slotKey: WorldChallengeSlotKey.SLOT_4,
        sortOrder: 3,
      }),
    ],
  };
}

function defaultAnswerMode(family: ChallengeFamily): ChallengeAnswerMode {
  if (family === ChallengeFamily.RYO) return ChallengeAnswerMode.RYO;
  if (family === ChallengeFamily.COOP) return ChallengeAnswerMode.SPLIT;
  if (family === ChallengeFamily.RELATIONAL) return ChallengeAnswerMode.VOTE;
  return ChallengeAnswerMode.MULTIPLE_CHOICE;
}

function defaultScoringRuleId(family: ChallengeFamily): string {
  if (family === ChallengeFamily.RYO) {
    return SCORING_RULE_IDS.RYO_PAYOFF_MATRIX;
  }
  if (family === ChallengeFamily.COOP) {
    return SCORING_RULE_IDS.COOP_ITEM_SUCCESS;
  }
  if (family === ChallengeFamily.RELATIONAL) {
    return SCORING_RULE_IDS.RELATIONAL_ITEM_SUCCESS;
  }
  return SCORING_RULE_IDS.SIGNATURE_DECLARED_BY_MECHANIC;
}
