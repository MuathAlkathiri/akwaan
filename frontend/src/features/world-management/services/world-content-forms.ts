import type {
  ChallengePresentation,
  ChallengeType,
  World,
  WorldChallengeConfiguration,
} from "../types";

/**
 * Payload builders. Forms collect values; these turn them into the exact request
 * bodies the API expects, so no component assembles a payload inline.
 */

export const EMPTY_PRESENTATION: ChallengePresentation = {
  inputType: "phone-multiple-choice",
  timerSeconds: null,
  soundPack: null,
  revealStyle: null,
};

function optionalText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export interface WorldFormValues {
  name: string;
  slug: string;
  description?: string;
  status: World["status"];
  soundPack?: string;
  timerProfile?: string;
  toneProfile?: string;
}

export function buildWorldPayload(values: WorldFormValues) {
  return {
    name: values.name.trim(),
    slug: values.slug,
    description: optionalText(values.description),
    status: values.status,
    soundPack: optionalText(values.soundPack),
    timerProfile: optionalText(values.timerProfile),
    toneProfile: optionalText(values.toneProfile),
  };
}

export interface ScopeFormValues {
  name: string;
  slug: string;
  description?: string;
  status: World["status"];
  excludedChallengeTypeIds: string[];
}

export function buildScopePayload(values: ScopeFormValues) {
  return {
    name: values.name.trim(),
    slug: values.slug,
    description: optionalText(values.description),
    status: values.status,
    excludedChallengeTypeIds: values.excludedChallengeTypeIds,
  };
}

export interface ChallengeTypeFormValues {
  name: string;
  slug: string;
  description?: string;
  family: ChallengeType["family"];
  itemStructure: ChallengeType["itemStructure"];
  answerMode: ChallengeType["answerMode"];
  scoringRuleId: string;
  status: ChallengeType["status"];
  defaultPresentation: ChallengePresentation;
}

export function buildChallengeTypePayload(values: ChallengeTypeFormValues) {
  return {
    name: values.name.trim(),
    slug: values.slug,
    description: optionalText(values.description),
    family: values.family,
    itemStructure: values.itemStructure,
    answerMode: values.answerMode,
    scoringRuleId: values.scoringRuleId,
    status: values.status,
    defaultPresentation: values.defaultPresentation,
  };
}

export interface WorldChallengeConfigurationFormValues {
  challengeTypeId: string;
  slotKey: WorldChallengeConfiguration["slotKey"];
  sortOrder: number;
  isEnabled: boolean;
  displayName?: string;
  description?: string;
  instructions?: string;
}

/**
 * Runtime fields remain global. Only player-facing copy may vary by World.
 */
export function buildConfigurationPayload(
  values: WorldChallengeConfigurationFormValues,
  _isUpdate = false,
) {
  return {
    challengeTypeId: values.challengeTypeId,
    slotKey: values.slotKey,
    displayName: optionalText(values.displayName),
    description: optionalText(values.description),
    instructions: optionalText(values.instructions),
    sortOrder: values.sortOrder,
    isEnabled: values.isEnabled,
  };
}
