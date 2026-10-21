import { Injectable } from '@nestjs/common';
import { ContentItemCompatibilityPolicy } from '../../world-content/domain/content-item-compatibility.policy';
import {
  ChallengeAnswerMode,
  ChallengeFamily,
  ChallengeItemStructure,
  ContentItemStatus,
  WorldContentStatus,
} from '../../world-content/domain/world-content.constants';
import {
  ChallengeTypeView,
  ContentAnswerPayload,
  ContentItemView,
  ReadinessReport,
  ScopeView,
} from '../../world-content/domain/world-content.types';

export interface CanonicalCompatibilityReferences {
  scope: ScopeView;
  worldStatus: WorldContentStatus;
  challengeType: ChallengeTypeView;
}

export interface CompatibilityEvaluation {
  status: 'PASS' | 'BLOCKED' | 'DEFERRED';
  preDraft: ReadinessReport;
  usedCanonicalReferences: boolean;
  deferredChecks: Array<{
    code: string;
    phase: 'draft_creation' | 'ready_validation';
    reason: string;
  }>;
}

/**
 * Runs the canonical policy against an in-memory ContentItemView. No
 * ContentItem is created, and the result explicitly says what remains unknown.
 */
@Injectable()
export class CandidateCompatibilityService {
  constructor(private readonly policy: ContentItemCompatibilityPolicy) {}

  evaluate(input: {
    mechanicKey: string;
    draft: Record<string, unknown>;
    references?: CanonicalCompatibilityReferences;
  }): CompatibilityEvaluation {
    const references =
      input.references ?? this.syntheticReferences(input.mechanicKey);
    if (!references) {
      return {
        status: 'DEFERRED',
        preDraft: { readiness: 'limited', blockers: [], warnings: [] },
        usedCanonicalReferences: false,
        deferredChecks: [
          {
            code: 'CANONICAL_CHALLENGE_TYPE_REQUIRED',
            phase: 'draft_creation',
            reason: `No pre-draft compatibility profile exists for ${input.mechanicKey}`,
          },
          this.readyDeferred(),
        ],
      };
    }
    const draft = input.draft;
    const item: ContentItemView = {
      id: 'engine-candidate',
      scopeId: references.scope.id,
      worldId: references.scope.worldId,
      prompt: (draft.prompt ?? { ar: '' }) as ContentItemView['prompt'],
      compatibleChallengeTypeIds: [references.challengeType.id],
      ...(draft.media
        ? { media: draft.media as ContentItemView['media'] }
        : {}),
      ...(draft.revealMedia
        ? { revealMedia: draft.revealMedia as ContentItemView['revealMedia'] }
        : {}),
      answerPayload: draft.answerPayload as ContentAnswerPayload,
      ...(draft.mechanicPayload
        ? {
            mechanicPayload:
              draft.mechanicPayload as ContentItemView['mechanicPayload'],
          }
        : {}),
      isReusableAcrossSessions: Boolean(draft.isReusableAcrossSessions),
      // READY-only checks must remain deferred until the real READY transition.
      status: ContentItemStatus.DRAFT,
      ...(draft.metadata
        ? { metadata: draft.metadata as ContentItemView['metadata'] }
        : {}),
    };
    const preDraft = this.policy.evaluate({
      item,
      scope: references.scope,
      worldStatus: references.worldStatus,
      challengeTypes: new Map([
        [references.challengeType.id, references.challengeType],
      ]),
      authoring: { isNewItem: true },
    });
    const deferredChecks: CompatibilityEvaluation['deferredChecks'] = [
      this.readyDeferred(),
    ];
    if (!input.references) {
      deferredChecks.unshift(
        {
          code: 'CANONICAL_SCOPE_ID_REQUIRED',
          phase: 'draft_creation',
          reason:
            'The Scope slug is resolved, but its runtime Mongo ID is not attached yet.',
        },
        {
          code: 'CANONICAL_CHALLENGE_TYPE_ID_REQUIRED',
          phase: 'draft_creation',
          reason:
            'The mechanic Skill is resolved, but its runtime ChallengeType ID is not attached yet.',
        },
      );
    }
    if (draft.media || draft.revealMedia) {
      deferredChecks.push({
        code: 'MEDIA_ASSET_READINESS_PENDING',
        phase: 'ready_validation',
        reason:
          'Policy shape checks ran, but asset existence and renderability require the attached canonical media.',
      });
    }
    return {
      status: preDraft.blockers.length
        ? 'BLOCKED'
        : deferredChecks.length
          ? 'DEFERRED'
          : 'PASS',
      preDraft,
      usedCanonicalReferences: Boolean(input.references),
      deferredChecks,
    };
  }

  private syntheticReferences(
    mechanicKey: string,
  ): CanonicalCompatibilityReferences | undefined {
    if (mechanicKey !== 'read-your-opponent') return undefined;
    const challengeType: ChallengeTypeView = {
      id: 'engine-challenge-type',
      name: 'Read Your Opponent',
      slug: mechanicKey,
      family: ChallengeFamily.RYO,
      itemStructure: ChallengeItemStructure.DISCRETE_TRIPLE,
      answerMode: ChallengeAnswerMode.RYO,
      defaultPresentation: {
        inputType: 'multiple_choice',
        timerSeconds: null,
      },
      scoringRuleId: 'engine-pre-draft',
      status: WorldContentStatus.DRAFT,
    };
    return {
      scope: {
        id: 'engine-scope',
        worldId: 'engine-world',
        name: 'Engine pre-draft Scope',
        slug: 'engine-pre-draft',
        status: WorldContentStatus.DRAFT,
        excludedChallengeTypeIds: [],
      },
      worldStatus: WorldContentStatus.DRAFT,
      challengeType,
    };
  }

  private readyDeferred() {
    return {
      code: 'READY_VALIDATION_PENDING',
      phase: 'ready_validation' as const,
      reason:
        'Full READY compatibility is evaluated only on the canonical draft after IDs and media are attached.',
    };
  }
}
