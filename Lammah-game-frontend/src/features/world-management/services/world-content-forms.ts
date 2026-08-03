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
  signatureMechanicId?: string;
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
    ...(values.signatureMechanicId
      ? { signatureMechanicId: values.signatureMechanicId }
      : {}),
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
}

/**
 * Assignment carries no presentation and no name: the mechanic owns its timing,
 * input, reveal, and name, and the ContentItem owns media.
 */
export function buildConfigurationPayload(
  values: WorldChallengeConfigurationFormValues,
  isUpdate = false,
) {
  return {
    // The mechanic itself is immutable after assignment: swap it by removing the
    // configuration and creating a new one.
    ...(isUpdate ? {} : { challengeTypeId: values.challengeTypeId }),
    slotKey: values.slotKey,
    sortOrder: values.sortOrder,
    isEnabled: values.isEnabled,
  };
}
