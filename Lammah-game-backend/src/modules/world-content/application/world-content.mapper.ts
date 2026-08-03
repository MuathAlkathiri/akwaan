import { Types } from 'mongoose';
import { SLOT_KEY_TYPES } from '../domain/world-content.constants';
import {
  ChallengeTypeView,
  ContentAnswerPayload,
  ContentItemView,
  normalizePresentation,
  ScopeView,
  WorldChallengeConfigurationView,
  WorldView,
} from '../domain/world-content.types';
import { ChallengeType } from '../schemas/challenge-type.schema';
import { ContentItem } from '../schemas/content-item.schema';
import { Scope } from '../schemas/scope.schema';
import { WorldChallengeConfiguration } from '../schemas/world-challenge-configuration.schema';
import { World } from '../schemas/world.schema';

/**
 * Documents in, domain views out. Policies never see a Mongoose document, and
 * the API never sees a raw persistence shape.
 */

function id(value: Types.ObjectId | string | null | undefined): string {
  return value ? String(value) : '';
}

export function toWorldView(document: World): WorldView {
  return {
    id: id(document._id as Types.ObjectId),
    name: document.name,
    slug: document.slug,
    status: document.status,
    ...(document.signatureMechanicId
      ? { signatureMechanicId: id(document.signatureMechanicId) }
      : {}),
    soundPack: document.soundPack ?? null,
    timerProfile: document.timerProfile ?? null,
    toneProfile: document.toneProfile ?? null,
  };
}

export function toScopeView(document: Scope): ScopeView {
  return {
    id: id(document._id as Types.ObjectId),
    worldId: id(document.worldId),
    name: document.name,
    slug: document.slug,
    status: document.status,
    excludedChallengeTypeIds: (document.excludedChallengeTypeIds ?? []).map(
      (value) => id(value),
    ),
  };
}

export function toChallengeTypeView(
  document: ChallengeType,
): ChallengeTypeView {
  return {
    id: id(document._id as Types.ObjectId),
    name: document.name,
    slug: document.slug,
    family: document.family,
    isExclusive: document.isExclusive,
    itemStructure: document.itemStructure,
    answerMode: document.answerMode,
    defaultPresentation: normalizePresentation(document.defaultPresentation),
    scoringRuleId: document.scoringRuleId,
    status: document.status,
  };
}

export function toChallengeTypeViewMap(
  documents: ChallengeType[],
): Map<string, ChallengeTypeView> {
  return new Map(
    documents.map((document) => {
      const view = toChallengeTypeView(document);
      return [view.id, view];
    }),
  );
}

export function toConfigurationView(
  document: WorldChallengeConfiguration,
): WorldChallengeConfigurationView {
  return {
    id: id(document._id as Types.ObjectId),
    worldId: id(document.worldId),
    challengeTypeId: id(document.challengeTypeId),
    slotKey: document.slotKey,
    slotType: SLOT_KEY_TYPES[document.slotKey],
    ...(document.displayName ? { displayName: document.displayName } : {}),
    sortOrder: document.sortOrder ?? 0,
    isEnabled: document.isEnabled ?? false,
  };
}

export function toContentItemView(document: ContentItem): ContentItemView {
  return {
    id: id(document._id as Types.ObjectId),
    scopeId: id(document.scopeId),
    worldId: id(document.worldId),
    prompt: { ar: document.prompt?.ar, en: document.prompt?.en },
    compatibleChallengeTypeIds: (document.compatibleChallengeTypeIds ?? []).map(
      (value) => id(value),
    ),
    ...(document.media
      ? {
          media: {
            type: document.media.type,
            assets: document.media.assets ?? [],
          },
        }
      : {}),
    answerPayload: document.answerPayload as ContentAnswerPayload,
    ...(document.mechanicPayload
      ? { mechanicPayload: document.mechanicPayload }
      : {}),
    isReusableAcrossSessions: document.isReusableAcrossSessions,
    status: document.status,
    ...(document.metadata ? { metadata: document.metadata } : {}),
  };
}
