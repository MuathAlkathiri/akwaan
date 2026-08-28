import { Injectable } from '@nestjs/common';
import { normalizeAnswer } from '../../../common/utils/answer-normalization.util';
import { ScopeCompatibilityPolicy } from './scope-compatibility.policy';
import {
  DISTRIBUTED_INFORMATION_ANSWER_MODES,
  DISTRIBUTED_INFORMATION_SEGMENT_IDS,
  DISTRIBUTED_INFORMATION_TEAM_SIZES,
  DISTRIBUTED_INFORMATION_VARIANT,
  ContentItemStatus,
  ANSWER_MODE_COMPATIBLE_ITEM_MODES,
  ChallengeAnswerMode,
  ChallengeFamily,
  ContentMediaType,
  SESSION_REUSE_EXEMPT_FAMILIES,
  TOP5_ENTRY_COUNT,
  TOP5_RANKED_COUNT,
  TOP5_RANKS,
  TOP5_TRAP_COUNT,
  TOP5_VARIANT,
  ONE_CLUE_SLUG,
  COMBO_SLUG,
  BOMB_SLUG,
  MARHALA_SLUG,
  ONE_CLUE_VALUES,
  VoteConsensusRule,
  WorldContentStatus,
} from './world-content.constants';
import { issue } from './world-content.errors';
import { COMBO_STAGES, isComboStage } from './combo-content.policy';
import { readBombItem } from './bomb-content.policy';
import {
  isMarhalaDifficulty,
  MARHALA_DIFFICULTY_LABELS,
} from './marhala-content.policy';
import {
  ContentAnswerOption,
  ContentAnswerPayload,
  ContentItemMedia,
  ContentItemView,
  ScopeView,
  ChallengeTypeView,
  WorldContentIssue,
  buildReadinessReport,
  ReadinessReport,
  DistributedInformationPayload,
  Top5Payload,
  OneCluePayload,
} from './world-content.types';

/**
 * Fields the legacy question model carried that have no place in the new domain
 * (roadmap 0.2, 17). Rejected explicitly so a legacy import cannot smuggle the
 * old scoring vocabulary back in through a metadata bag.
 */
export const REJECTED_LEGACY_CONTENT_FIELDS = [
  'points',
  'score',
  'maxPoints',
  'difficulty',
  'correctAnswer',
  'wrongAnswers',
  'hostDecision',
  'approvedAnswer',
  'manualCorrect',
  'manualIncorrect',
  'winningTeam',
  'gameMode',
  'questionType',
] as const;

export interface ContentItemCompatibilityInput {
  item: ContentItemView;
  scope?: ScopeView;
  /** World status of the Scope's World, when known. */
  worldStatus?: WorldContentStatus;
  /** Every challenge type referenced by the item, keyed by id. */
  challengeTypes: Map<string, ChallengeTypeView>;
}

/**
 * The single source of truth for whether a Content Item can be played
 * (roadmap 12, 13, 14). Controllers, DTOs, the migration, and the admin UI all
 * defer to this; none of them re-implement it.
 */
@Injectable()
export class ContentItemCompatibilityPolicy {
  evaluate(input: ContentItemCompatibilityInput): ReadinessReport {
    const blockers: WorldContentIssue[] = [];
    const warnings: WorldContentIssue[] = [];

    blockers.push(...this.validateScope(input));
    blockers.push(...this.validatePrompt(input.item));
    blockers.push(...this.validateAnswerPayload(input.item.answerPayload));

    const referenced = this.resolveChallengeTypes(input, blockers);
    blockers.push(...this.validateChallengeCompatibility(input, referenced));
    blockers.push(...this.validateMedia(input.item));
    blockers.push(...this.validateTop5Payload(input.item));
    blockers.push(
      ...this.validateDistributedInformationPayload(input.item, referenced),
    );
    blockers.push(...this.validateOneCluePayload(input.item, referenced));
    blockers.push(...this.validateComboPayload(input.item, referenced));
    blockers.push(...this.validateBombItem(input.item, referenced));
    blockers.push(...this.validateMarhalaPayload(input.item, referenced));
    warnings.push(...this.reuseWarnings(input.item, referenced));

    return buildReadinessReport(blockers, warnings);
  }

  /**
   * "الكومبو" needs one thing no shared field carries: which question of the run
   * the item is for. A Run rises through four stages in a fixed order, so an item
   * with no stage — or a stage outside the four — has no position to be played at.
   *
   * Checked here, at authoring time, against the same predicate the plan builder
   * uses. Without this an item saves cleanly and then fails at launch, which is
   * the worst possible moment to discover it.
   */
  private validateComboPayload(
    item: ContentItemView,
    challengeTypes: ChallengeTypeView[],
  ): WorldContentIssue[] {
    if (!challengeTypes.some((type) => type.slug === COMBO_SLUG)) return [];
    const raw = (item.mechanicPayload as { comboStage?: unknown } | undefined)
      ?.comboStage;
    if (!isComboStage(raw)) {
      return [
        issue(
          'COMBO_ITEM_STAGE_INVALID',
          `الكومبو requires mechanicPayload.comboStage to be one of ${COMBO_STAGES.join(', ')}`,
          { contentItemId: item.id, comboStage: raw ?? null },
        ),
      ];
    }
    return [];
  }

  /**
   * "القنبلة" needs no payload of its own — a Bomb item is an ordinary picture
   * question — but it does need a *shape*: one image, an Arabic prompt, and
   * match-graded accepted answers.
   *
   * Checked here against the very same per-item function the launch path runs, so
   * an item this form accepts cannot fail a Bomb launch on its own shape. The
   * run-level rules (10–15 ordered distinct items) are deliberately not checked
   * here: one item can never satisfy them, and content shortage is a launch
   * concern the selector already reports.
   */
  private validateBombItem(
    item: ContentItemView,
    challengeTypes: ChallengeTypeView[],
  ): WorldContentIssue[] {
    if (!challengeTypes.some((type) => type.slug === BOMB_SLUG)) return [];
    const { problems } = readBombItem(
      {
        id: item.id,
        ...(item.prompt ? { prompt: item.prompt } : {}),
        ...(item.media ? { media: item.media as never } : {}),
        // The payload is a discriminated union; only its match variant carries
        // accepted answers, and a non-match mode is itself one of the problems
        // this function reports.
        answerPayload: item.answerPayload as {
          mode?: string;
          acceptedAnswers?: string[];
        },
        status: item.status,
      },
      1,
    );
    return problems.map((problem) =>
      issue(problem.code, problem.message, { contentItemId: item.id }),
    );
  }

  /**
   * "المرحلة" needs the risk band of a question, because the team elects a
   * difficulty *before* the question is drawn and that choice decides how far a
   * correct answer can move them. An item with no difficulty has no pool to be
   * drawn from.
   *
   * Checked here against the same predicate the runtime draw uses, so an item this
   * form accepts cannot be one the draw refuses. Difficulty is Marhala's own
   * metadata — it says nothing about the item's Scope, and no Scope implies it.
   */
  private validateMarhalaPayload(
    item: ContentItemView,
    challengeTypes: ChallengeTypeView[],
  ): WorldContentIssue[] {
    if (!challengeTypes.some((type) => type.slug === MARHALA_SLUG)) return [];
    const raw = (
      item.mechanicPayload as { marhalaDifficulty?: unknown } | undefined
    )?.marhalaDifficulty;
    if (!isMarhalaDifficulty(raw)) {
      return [
        issue(
          'MARHALA_ITEM_DIFFICULTY_INVALID',
          `المرحلة requires mechanicPayload.marhalaDifficulty to be one of ${Object.keys(
            MARHALA_DIFFICULTY_LABELS,
          ).join(', ')}`,
          { contentItemId: item.id, marhalaDifficulty: (raw as never) ?? null },
        ),
      ];
    }
    return [];
  }

  private validateOneCluePayload(
    item: ContentItemView,
    challengeTypes: ChallengeTypeView[],
  ): WorldContentIssue[] {
    if (!challengeTypes.some((type) => type.slug === ONE_CLUE_SLUG)) return [];
    const raw = item.mechanicPayload as Partial<OneCluePayload> | undefined;
    const clues = Array.isArray(raw?.clues) ? raw.clues : [];
    if (
      clues.length !== ONE_CLUE_VALUES.length ||
      clues.some(
        (clue, index) =>
          clue?.order !== index + 1 ||
          clue?.value !== ONE_CLUE_VALUES[index] ||
          !clue?.text?.ar?.trim(),
      )
    ) {
      return [
        issue(
          'ONE_CLUE_STRUCTURE_INVALID',
          'One Clue requires exactly five ordered clues valued 5, 4, 3, 2, 1',
        ),
      ];
    }
    return [];
  }

  /**
   * "ركّبها" structure. Only the parts a machine can decide are decided here:
   * three unique segments, merge options that cover every segment exactly once,
   * the two supported team sizes, and a recorded author safety confirmation.
   * Whether the split is *genuinely* unsolvable alone is the author's judgement.
   */
  private validateDistributedInformationPayload(
    item: ContentItemView,
    challengeTypes: ChallengeTypeView[],
  ): WorldContentIssue[] {
    const raw = item.mechanicPayload as
      | (Partial<DistributedInformationPayload> & { variant?: string })
      | undefined;
    const requiresDistributed = challengeTypes.some(
      (type) => type.answerMode === ChallengeAnswerMode.DISTRIBUTED,
    );
    if (
      !requiresDistributed &&
      raw?.variant !== DISTRIBUTED_INFORMATION_VARIANT
    )
      return [];
    if (raw?.variant !== DISTRIBUTED_INFORMATION_VARIANT) {
      return [
        issue(
          'DISTRIBUTED_INFORMATION_STRUCTURE_REQUIRED',
          'ركّبها requires its three-segment content pattern',
        ),
      ];
    }
    const issues: WorldContentIssue[] = [];

    if (!raw.publicPrompt?.ar?.trim()) {
      issues.push(
        issue(
          'DISTRIBUTED_PUBLIC_PROMPT_REQUIRED',
          'A public prompt every teammate can see is required',
        ),
      );
    }

    const segments = Array.isArray(raw.segments) ? raw.segments : [];
    const segmentIds = segments.map((segment) => segment?.id);
    if (segments.length !== DISTRIBUTED_INFORMATION_SEGMENT_IDS.length) {
      issues.push(
        issue(
          'DISTRIBUTED_SEGMENT_COUNT_INVALID',
          `Exactly ${DISTRIBUTED_INFORMATION_SEGMENT_IDS.length} private segments are required`,
        ),
      );
    }
    if (
      new Set(segmentIds).size !== segmentIds.length ||
      segmentIds.some(
        (id) =>
          !DISTRIBUTED_INFORMATION_SEGMENT_IDS.includes(
            id as (typeof DISTRIBUTED_INFORMATION_SEGMENT_IDS)[number],
          ),
      )
    ) {
      issues.push(
        issue(
          'DISTRIBUTED_SEGMENT_IDS_INVALID',
          `Segments must be exactly ${DISTRIBUTED_INFORMATION_SEGMENT_IDS.join(', ')}, each once`,
        ),
      );
    }
    if (segments.some((segment) => !segment?.content?.ar?.trim())) {
      issues.push(
        issue(
          'DISTRIBUTED_SEGMENT_CONTENT_REQUIRED',
          'Every segment needs its private content',
        ),
      );
    }
    // A private segment may carry its own media (a partial image, an audio cue).
    // It is validated by the same canonical rules as any content media, so an
    // invalid modality or a URL-less asset is rejected before it can reach a phone.
    for (const segment of segments) {
      issues.push(
        ...this.mediaBlockIssues(
          segment?.media,
          `distributed segment ${segment?.id ?? '?'}`,
        ),
      );
    }

    const merges = Array.isArray(raw.twoPlayerMergeOptions)
      ? raw.twoPlayerMergeOptions
      : [];
    if (!merges.length) {
      issues.push(
        issue(
          'DISTRIBUTED_MERGE_OPTION_REQUIRED',
          'At least one safe two-player split is required',
        ),
      );
    }
    for (const merge of merges) {
      const first = merge?.firstParticipantSegmentIds ?? [];
      const second = merge?.secondParticipantSegmentIds ?? [];
      const combined = [...first, ...second];
      const coversOnce =
        combined.length === DISTRIBUTED_INFORMATION_SEGMENT_IDS.length &&
        new Set(combined).size === combined.length &&
        DISTRIBUTED_INFORMATION_SEGMENT_IDS.every((id) =>
          combined.includes(id),
        );
      // One player takes two segments and the other takes one; anything else
      // either leaks the whole puzzle or leaves a segment unread.
      const splitIsTwoAndOne =
        (first.length === 2 && second.length === 1) ||
        (first.length === 1 && second.length === 2);
      if (!coversOnce || !splitIsTwoAndOne) {
        issues.push(
          issue(
            'DISTRIBUTED_MERGE_OPTION_INVALID',
            'Each two-player split must give one player two segments and the other the remaining one',
          ),
        );
      }
    }

    const teamSizes = Array.isArray(raw.supportedTeamSizes)
      ? [...raw.supportedTeamSizes].sort()
      : [];
    if (
      teamSizes.length !== DISTRIBUTED_INFORMATION_TEAM_SIZES.length ||
      teamSizes.some(
        (size, index) => size !== DISTRIBUTED_INFORMATION_TEAM_SIZES[index],
      )
    ) {
      issues.push(
        issue(
          'DISTRIBUTED_TEAM_SIZES_INVALID',
          `Supported team sizes must be exactly ${DISTRIBUTED_INFORMATION_TEAM_SIZES.join(' and ')}`,
        ),
      );
    }

    if (
      !DISTRIBUTED_INFORMATION_ANSWER_MODES.includes(
        item.answerPayload
          ?.mode as (typeof DISTRIBUTED_INFORMATION_ANSWER_MODES)[number],
      )
    ) {
      issues.push(
        issue(
          'DISTRIBUTED_ANSWER_MODE_UNSUPPORTED',
          'The answer must be a number, a short text, or a multiple choice',
        ),
      );
    }

    // Ready content must carry the confirmation; a draft may still be in progress.
    if (
      item.status === ContentItemStatus.READY &&
      raw.authorSafetyConfirmation !== true
    ) {
      issues.push(
        issue(
          'DISTRIBUTED_SAFETY_CONFIRMATION_REQUIRED',
          'Confirm that no single player can solve the puzzle alone',
        ),
      );
    }

    return issues;
  }

  /**
   * The Top 5 content contract, enforced here and nowhere else.
   *
   * Exactly ten entries, exactly five of them ranked 1..5 with no repeats, and
   * therefore exactly five traps. Ids and normalised labels must be unique, so a
   * reveal can never show the same thing twice and an ownership record can never
   * be ambiguous about which entry it refers to.
   */
  private validateTop5Payload(item: ContentItemView): WorldContentIssue[] {
    if (item.answerPayload?.mode !== ChallengeAnswerMode.TOP_5) return [];
    const raw = item.mechanicPayload as
      | (Partial<Omit<Top5Payload, 'variant'>> & { variant?: string })
      | undefined;
    if (!raw || raw.variant !== TOP5_VARIANT) {
      return [
        issue(
          'TOP5_VARIANT_INVALID',
          `Top 5 content must declare the "${TOP5_VARIANT}" variant`,
        ),
      ];
    }
    const issues: WorldContentIssue[] = [];
    if (!raw.title?.trim())
      issues.push(issue('TOP5_TITLE_REQUIRED', 'Top 5 title is required'));
    if (!raw.instruction?.trim())
      issues.push(
        issue('TOP5_INSTRUCTION_REQUIRED', 'Player instructions are required'),
      );
    if (!raw.rankingBasis?.trim())
      issues.push(
        issue(
          'TOP5_RANKING_BASIS_REQUIRED',
          'An objective ranking basis is required',
        ),
      );
    if (!raw.sourceLabel?.trim())
      issues.push(
        issue('TOP5_SOURCE_REQUIRED', 'An authoritative source is required'),
      );
    if (!raw.sourceUrl?.trim())
      issues.push(
        issue(
          'TOP5_SOURCE_URL_REQUIRED',
          'An authoritative source URL is required',
        ),
      );
    if (!raw.asOfDate?.trim())
      issues.push(
        issue('TOP5_AS_OF_DATE_REQUIRED', 'The ranking data date is required'),
      );

    const entries = Array.isArray(raw.entries) ? raw.entries : [];
    if (entries.length !== TOP5_ENTRY_COUNT)
      issues.push(
        issue(
          'TOP5_ENTRY_COUNT_INVALID',
          `Top 5 requires exactly ${TOP5_ENTRY_COUNT} entries`,
          { received: entries.length },
        ),
      );
    const ids = entries.map((entry) => entry?.id?.trim());
    if (ids.some((id) => !id) || new Set(ids).size !== entries.length)
      issues.push(
        issue(
          'TOP5_DUPLICATE_ENTRY_ID',
          'Entry ids must be present and unique',
        ),
      );
    const labels = entries.map((entry) => normalizeAnswer(entry?.label ?? ''));
    if (
      labels.some((label) => !label) ||
      new Set(labels).size !== labels.length
    )
      issues.push(
        issue(
          'TOP5_DUPLICATE_ENTRY_LABEL',
          'Entry labels must be present and unique',
        ),
      );
    // `undefined` is not `null`: an author who forgot to classify an entry must
    // not silently become an author who declared it a trap.
    if (entries.some((entry) => entry?.rank === undefined))
      issues.push(
        issue(
          'TOP5_RANK_MISSING',
          'Every entry must declare a rank of 1..5 or null for a trap',
        ),
      );
    const ranked = entries.filter(
      (entry) => entry?.rank !== null && entry?.rank !== undefined,
    );
    const traps = entries.filter((entry) => entry?.rank === null);
    if (ranked.length !== TOP5_RANKED_COUNT)
      issues.push(
        issue(
          'TOP5_RANKED_COUNT_INVALID',
          `Exactly ${TOP5_RANKED_COUNT} entries must carry a rank`,
          { received: ranked.length },
        ),
      );
    if (traps.length !== TOP5_TRAP_COUNT)
      issues.push(
        issue(
          'TOP5_TRAP_COUNT_INVALID',
          `Exactly ${TOP5_TRAP_COUNT} entries must be traps`,
          { received: traps.length },
        ),
      );
    const ranks = ranked
      .map((entry) => Number(entry.rank))
      .sort((left, right) => left - right);
    if (ranks.join(',') !== TOP5_RANKS.join(','))
      issues.push(
        issue(
          'TOP5_RANKS_INVALID',
          `Ranks must be exactly ${TOP5_RANKS.join(', ')} with no repeats`,
          { ranks },
        ),
      );
    return issues;
  }

  /**
   * Roadmap 6.4: Relational prompts survive repeated sessions, everything else
   * is consumed on use. The future rotation engine asks this, not a component.
   */
  isSessionReuseExempt(families: ChallengeFamily[]): boolean {
    return (
      families.length > 0 &&
      families.every((family) => SESSION_REUSE_EXEMPT_FAMILIES.includes(family))
    );
  }

  defaultReuseAcrossSessions(families: ChallengeFamily[]): boolean {
    return this.isSessionReuseExempt(families);
  }

  /** Guards the boundary against legacy point/difficulty style fields. */
  findLegacyFields(raw: Record<string, unknown>): WorldContentIssue[] {
    return REJECTED_LEGACY_CONTENT_FIELDS.filter(
      (field) => raw[field] !== undefined,
    ).map((field) =>
      issue(
        'LEGACY_FIELD_NOT_SUPPORTED',
        `"${field}" belongs to the legacy question model and is not part of the World Content domain`,
        { field },
      ),
    );
  }

  private validateScope(
    input: ContentItemCompatibilityInput,
  ): WorldContentIssue[] {
    if (!input.scope) {
      return [
        issue('CONTENT_SCOPE_MISSING', 'The referenced Scope does not exist', {
          scopeId: input.item.scopeId,
        }),
      ];
    }
    const issues: WorldContentIssue[] = [];
    if (input.scope.worldId !== input.item.worldId) {
      issues.push(
        issue(
          'CONTENT_WORLD_SCOPE_MISMATCH',
          "A Content Item's denormalized World must match its Scope's World",
          {
            scopeId: input.scope.id,
            scopeWorldId: input.scope.worldId,
            itemWorldId: input.item.worldId,
          },
        ),
      );
    }
    if (input.scope.status === WorldContentStatus.ARCHIVED) {
      issues.push(
        issue(
          'CONTENT_SCOPE_ARCHIVED',
          'Content cannot be made ready inside an archived Scope',
          { scopeId: input.scope.id },
        ),
      );
    }
    if (input.worldStatus === WorldContentStatus.ARCHIVED) {
      issues.push(
        issue(
          'CONTENT_WORLD_ARCHIVED',
          'Content cannot be made ready inside an archived World',
          { worldId: input.item.worldId },
        ),
      );
    }
    return issues;
  }

  private validatePrompt(item: ContentItemView): WorldContentIssue[] {
    if (item.prompt?.ar?.trim()) return [];
    return [
      issue('CONTENT_PROMPT_REQUIRED', 'An Arabic prompt is required', {
        contentItemId: item.id,
      }),
    ];
  }

  private resolveChallengeTypes(
    input: ContentItemCompatibilityInput,
    blockers: WorldContentIssue[],
  ): ChallengeTypeView[] {
    const resolved: ChallengeTypeView[] = [];
    const seen = new Set<string>();
    for (const challengeTypeId of input.item.compatibleChallengeTypeIds) {
      if (seen.has(challengeTypeId)) {
        blockers.push(
          issue(
            'DUPLICATE_COMPATIBLE_CHALLENGE_TYPE',
            'A challenge type is listed twice as compatible',
            { challengeTypeId },
          ),
        );
        continue;
      }
      seen.add(challengeTypeId);
      const challengeType = input.challengeTypes.get(challengeTypeId);
      if (!challengeType) {
        blockers.push(
          issue(
            'COMPATIBLE_CHALLENGE_TYPE_MISSING',
            'A compatible challenge type does not exist',
            { challengeTypeId },
          ),
        );
        continue;
      }
      resolved.push(challengeType);
    }
    if (!resolved.length) {
      blockers.push(
        issue(
          'CONTENT_WITHOUT_COMPATIBLE_CHALLENGE_TYPE',
          'A Content Item must be compatible with at least one challenge type',
          { contentItemId: input.item.id },
        ),
      );
    }
    return resolved;
  }

  private validateChallengeCompatibility(
    input: ContentItemCompatibilityInput,
    referenced: ChallengeTypeView[],
  ): WorldContentIssue[] {
    const issues: WorldContentIssue[] = [];
    const itemMode = input.item.answerPayload?.mode;
    for (const challengeType of referenced) {
      if (
        input.scope &&
        !ScopeCompatibilityPolicy.isChallengeTypeAllowed(
          input.scope,
          challengeType.id,
        )
      ) {
        issues.push(
          issue(
            'CHALLENGE_TYPE_EXCLUDED_BY_SCOPE',
            `"${challengeType.name}" is excluded by the Scope "${input.scope.name}"`,
            { challengeTypeId: challengeType.id, scopeId: input.scope.id },
          ),
        );
      }
      if (challengeType.status === WorldContentStatus.ARCHIVED) {
        issues.push(
          issue(
            'COMPATIBLE_CHALLENGE_TYPE_ARCHIVED',
            `"${challengeType.name}" is archived and cannot consume new content`,
            { challengeTypeId: challengeType.id },
          ),
        );
      }
      const supported =
        ANSWER_MODE_COMPATIBLE_ITEM_MODES[challengeType.answerMode] ?? [];
      if (itemMode && !supported.includes(itemMode)) {
        issues.push(
          issue(
            'ANSWER_PAYLOAD_INCOMPATIBLE_WITH_CHALLENGE',
            `"${challengeType.name}" resolves ${challengeType.answerMode} answers and cannot consume a ${itemMode} payload`,
            {
              challengeTypeId: challengeType.id,
              challengeAnswerMode: challengeType.answerMode,
              itemAnswerMode: itemMode,
              supported,
            },
          ),
        );
      }
    }
    return issues;
  }

  private validateMedia(item: ContentItemView): WorldContentIssue[] {
    // No challenge-side media requirement exists: media belongs to the
    // ContentItem, so one mechanic plays text, image, audio, and video alike.
    return this.mediaBlockIssues(item.media, 'content media');
  }

  /**
   * The one canonical media check, reused for the item's own media and for any
   * per-view media a mechanic attaches (e.g. a ركّبها private segment). `where`
   * only labels the issue detail; the rules are identical everywhere.
   */
  private mediaBlockIssues(
    media: ContentItemMedia | undefined,
    where: string,
  ): WorldContentIssue[] {
    const issues: WorldContentIssue[] = [];
    if (!media) return issues;
    if (!Object.values(ContentMediaType).includes(media.type)) {
      issues.push(
        issue('INVALID_CONTENT_MEDIA_TYPE', 'Media type is not supported', {
          mediaType: media.type,
          where,
        }),
      );
    }
    if (media.type !== ContentMediaType.NONE && !media.assets?.length) {
      issues.push(
        issue(
          'CONTENT_MEDIA_ASSETS_REQUIRED',
          `Media type "${media.type}" requires at least one asset`,
          { mediaType: media.type, where },
        ),
      );
    }
    if (media.assets?.some((asset) => !asset.url?.trim())) {
      issues.push(
        issue(
          'CONTENT_MEDIA_ASSET_URL_REQUIRED',
          'Every media asset needs a URL',
          {
            where,
          },
        ),
      );
    }
    return issues;
  }

  private reuseWarnings(
    item: ContentItemView,
    referenced: ChallengeTypeView[],
  ): WorldContentIssue[] {
    if (!referenced.length) return [];
    const families = referenced.map((challengeType) => challengeType.family);
    const exempt = this.isSessionReuseExempt(families);
    if (exempt && !item.isReusableAcrossSessions) {
      return [
        issue(
          'RELATIONAL_CONTENT_SHOULD_BE_REUSABLE',
          'Relational-only content is normally reusable across sessions',
          { contentItemId: item.id },
        ),
      ];
    }
    if (!exempt && item.isReusableAcrossSessions) {
      return [
        issue(
          'NON_RELATIONAL_CONTENT_MARKED_REUSABLE',
          'Content that is not Relational-only is normally consumed after one session',
          {
            contentItemId: item.id,
            families: [...new Set(families)],
          },
        ),
      ];
    }
    return [];
  }

  private validateAnswerPayload(
    payload: ContentAnswerPayload | undefined,
  ): WorldContentIssue[] {
    if (!payload || typeof payload !== 'object') {
      return [
        issue(
          'ANSWER_PAYLOAD_REQUIRED',
          'A Content Item requires an answer payload',
        ),
      ];
    }
    switch (payload.mode) {
      case ChallengeAnswerMode.MULTIPLE_CHOICE:
        return [
          ...this.validateOptions(payload.options, 2),
          ...this.validateCorrectOption(
            payload.options,
            payload.correctOptionId,
          ),
        ];
      case ChallengeAnswerMode.CLOSEST:
        return this.validateNumeric(
          payload.correctValue,
          payload.acceptedTolerance,
        );
      case ChallengeAnswerMode.MATCH:
        return this.validateAcceptedAnswers(payload.acceptedAnswers);
      case ChallengeAnswerMode.VOTE:
        return [
          ...(payload.options ? this.validateOptions(payload.options, 2) : []),
          ...(Object.values(VoteConsensusRule).includes(payload.consensusRule)
            ? []
            : [
                issue(
                  'INVALID_VOTE_CONSENSUS_RULE',
                  `Consensus rule must be one of: ${Object.values(VoteConsensusRule).join(', ')}`,
                  { consensusRule: payload.consensusRule },
                ),
              ]),
        ];
      case ChallengeAnswerMode.SPLIT:
        return [
          ...this.validateSplitPayload(payload.splitPayload),
          ...this.validateAcceptedAnswers(payload.acceptedAnswers),
        ];
      case ChallengeAnswerMode.RYO:
        return this.validateRyoPayload(payload);
      case ChallengeAnswerMode.TOP_5:
        return [];
      default:
        return [
          issue(
            'UNKNOWN_ANSWER_PAYLOAD_MODE',
            'Answer payload discriminator is not a supported answer mode',
            { mode: (payload as { mode?: unknown }).mode },
          ),
        ];
    }
  }

  private validateRyoPayload(
    payload: Extract<ContentAnswerPayload, { mode: ChallengeAnswerMode.RYO }>,
  ): WorldContentIssue[] {
    // Roadmap 6.1: an RYO prompt is either multiple choice or numeric estimate,
    // and never open free text.
    if (payload.options && payload.options.length) {
      return [
        ...this.validateOptions(payload.options, 2),
        ...this.validateCorrectOption(payload.options, payload.correctOptionId),
      ];
    }
    if (payload.correctValue === undefined) {
      return [
        issue(
          'RYO_PAYLOAD_INCOMPLETE',
          'An RYO item needs either multiple-choice options or a numeric estimate target',
        ),
      ];
    }
    return this.validateNumeric(
      payload.correctValue,
      payload.acceptedTolerance,
    );
  }

  private validateOptions(
    options: ContentAnswerOption[] | undefined,
    minimum: number,
  ): WorldContentIssue[] {
    if (!Array.isArray(options) || options.length < minimum) {
      return [
        issue(
          'ANSWER_OPTIONS_REQUIRED',
          `At least ${minimum} answer options are required`,
          { provided: options?.length ?? 0 },
        ),
      ];
    }
    const issues: WorldContentIssue[] = [];
    const ids = new Set<string>();
    for (const option of options) {
      if (!option?.id?.trim()) {
        issues.push(
          issue('ANSWER_OPTION_ID_REQUIRED', 'Every answer option needs an id'),
        );
        continue;
      }
      if (ids.has(option.id)) {
        issues.push(
          issue(
            'DUPLICATE_ANSWER_OPTION_ID',
            'Answer option ids must be unique',
            { optionId: option.id },
          ),
        );
      }
      ids.add(option.id);
      if (!option.label?.ar?.trim()) {
        issues.push(
          issue(
            'ANSWER_OPTION_LABEL_REQUIRED',
            'Every answer option needs an Arabic label',
            { optionId: option.id },
          ),
        );
      }
    }
    return issues;
  }

  private validateCorrectOption(
    options: ContentAnswerOption[] | undefined,
    correctOptionId: string | undefined,
  ): WorldContentIssue[] {
    if (!correctOptionId?.trim()) {
      return [
        issue(
          'CORRECT_OPTION_REQUIRED',
          'A multiple-choice item must name its correct option',
        ),
      ];
    }
    if ((options ?? []).some((option) => option.id === correctOptionId)) {
      return [];
    }
    return [
      issue(
        'CORRECT_OPTION_NOT_IN_OPTIONS',
        'The correct option must exist in the option list',
        { correctOptionId },
      ),
    ];
  }

  private validateNumeric(
    correctValue: unknown,
    acceptedTolerance: unknown,
  ): WorldContentIssue[] {
    const issues: WorldContentIssue[] = [];
    if (typeof correctValue !== 'number' || !Number.isFinite(correctValue)) {
      issues.push(
        issue(
          'NUMERIC_ANSWER_REQUIRED',
          'A closest-answer item needs a finite numeric target',
          { correctValue },
        ),
      );
    }
    if (acceptedTolerance !== undefined) {
      if (
        typeof acceptedTolerance !== 'number' ||
        !Number.isFinite(acceptedTolerance) ||
        acceptedTolerance < 0
      ) {
        issues.push(
          issue(
            'INVALID_ANSWER_TOLERANCE',
            'Accepted tolerance must be a finite number of zero or more',
            { acceptedTolerance },
          ),
        );
      }
    }
    return issues;
  }

  /**
   * `match` answers are player-entered text resolved automatically against this
   * list using the one shared Arabic normalizer (roadmap 6.5, 13). Normalizing
   * here is what makes two visually different spellings a duplicate.
   */
  private validateAcceptedAnswers(
    acceptedAnswers: string[] | undefined,
  ): WorldContentIssue[] {
    if (!Array.isArray(acceptedAnswers) || !acceptedAnswers.length) {
      return [
        issue(
          'ACCEPTED_ANSWERS_REQUIRED',
          'At least one accepted answer is required for automatic text matching',
        ),
      ];
    }
    const issues: WorldContentIssue[] = [];
    const normalized = new Set<string>();
    for (const answer of acceptedAnswers) {
      const value = typeof answer === 'string' ? normalizeAnswer(answer) : '';
      if (!value) {
        issues.push(
          issue(
            'EMPTY_ACCEPTED_ANSWER',
            'Accepted answers cannot be blank after normalization',
            { answer },
          ),
        );
        continue;
      }
      if (normalized.has(value)) {
        issues.push(
          issue(
            'DUPLICATE_ACCEPTED_ANSWER',
            'Two accepted answers normalize to the same value',
            { answer, normalized: value },
          ),
        );
      }
      normalized.add(value);
    }
    return issues;
  }

  private validateSplitPayload(splitPayload: unknown): WorldContentIssue[] {
    const fragments = (splitPayload as { fragments?: unknown })?.fragments;
    if (!Array.isArray(fragments) || fragments.length < 2) {
      return [
        issue(
          'SPLIT_PAYLOAD_REQUIRES_FRAGMENTS',
          'Split content needs at least two fragments so no single player can answer alone',
          { fragmentCount: Array.isArray(fragments) ? fragments.length : 0 },
        ),
      ];
    }
    const issues: WorldContentIssue[] = [];
    const seats = new Set<number>();
    for (const fragment of fragments as Array<Record<string, unknown>>) {
      const seat = fragment?.seat;
      const clue = fragment?.clue as { ar?: string } | undefined;
      if (typeof seat !== 'number' || !Number.isInteger(seat) || seat < 1) {
        issues.push(
          issue(
            'INVALID_SPLIT_FRAGMENT_SEAT',
            'Every split fragment needs a whole seat number of one or more',
            { seat },
          ),
        );
      } else if (seats.has(seat)) {
        issues.push(
          issue(
            'DUPLICATE_SPLIT_FRAGMENT_SEAT',
            'Two split fragments target the same seat, so the information is not actually split',
            { seat },
          ),
        );
      } else {
        seats.add(seat);
      }
      if (!clue?.ar?.trim()) {
        issues.push(
          issue(
            'SPLIT_FRAGMENT_CLUE_REQUIRED',
            'Every split fragment needs an Arabic clue',
            { seat },
          ),
        );
      }
    }
    return issues;
  }
}
