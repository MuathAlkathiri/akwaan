import type { CategoryGenerationProfile } from './category-generation-profile.registry';
import type {
  EntityType,
  PreVerificationValidationResult,
  QualityIssue,
  QuestionPatternId,
  StructuredEntityCandidate,
} from './generation-quality.types';
import { questionPatternRegistry } from './question-pattern.registry';
import type {
  AssetRequest,
  GameMode,
  QuestionAssetType,
} from '../contracts/asset-provider.interface';

export type PreVerificationDraftInput = {
  question: string;
  correctAnswer: string;
  gameMode: GameMode;
  type: QuestionAssetType;
  assetRequest: AssetRequest | null;
  selectedPatternId?: QuestionPatternId;
};

const genericAnswerPatterns = [
  /^political alliances$/i,
  /^science fiction$/i,
  /^battle$/i,
  /^power$/i,
  /^technology$/i,
  /^strategy$/i,
  /^friendship$/i,
  /^war$/i,
  /^adventure$/i,
  /^قوة$/i,
  /^حرب$/i,
  /^مغامرة$/i,
  /^صداقة$/i,
  /^استراتيجية$/i,
  /^تحالفات سياسية$/i,
];

export class PreVerificationQualityValidator {
  validate(
    profile: CategoryGenerationProfile,
    draft: PreVerificationDraftInput,
  ): PreVerificationValidationResult {
    const issues: QualityIssue[] = [];
    const patternId = this.inferPatternId(draft);
    const pattern = questionPatternRegistry.get(patternId);
    const entity = this.toEntityCandidate(draft);

    if (!profile.allowedPatternIds.includes(patternId)) {
      issues.push({
        code: 'UNSUPPORTED_PATTERN',
        message: `Pattern ${patternId} is not allowed by profile ${profile.id}`,
        field: 'selectedPatternId',
      });
    }

    if (!profile.allowedGameModes.includes(draft.gameMode)) {
      issues.push({
        code: 'UNSUPPORTED_PATTERN',
        message: `Game mode ${draft.gameMode} is not allowed by profile ${profile.id}`,
        field: 'gameMode',
      });
    }

    if (!profile.supportedAssetTypes.includes(draft.type)) {
      issues.push({
        code: 'PATTERN_CONSTRAINT_FAILED',
        message: `Asset type ${draft.type} is not supported by profile ${profile.id}`,
        field: 'type',
      });
    }

    if (!pattern) {
      issues.push({
        code: 'UNSUPPORTED_PATTERN',
        message: `Unknown pattern ${patternId}`,
        field: 'selectedPatternId',
      });
    } else {
      if (!pattern.supportedGameModes.includes(draft.gameMode)) {
        issues.push({
          code: 'PATTERN_CONSTRAINT_FAILED',
          message: `Game mode ${draft.gameMode} is incompatible with pattern ${pattern.id}`,
          field: 'gameMode',
        });
      }
      if (
        pattern.verificationRequired &&
        (!entity || entity.type === 'unknown' || entity.type === 'none')
      ) {
        issues.push({
          code: 'MISSING_REQUIRED_ENTITY_FIELD',
          message: 'Entity-backed pattern requires a concrete entity.',
          field: 'assetRequest.entity',
        });
      }
    }

    if (entity) {
      this.validateEntity(profile, entity, issues);
    }

    this.validateGlobalQuestion(profile, draft, issues);

    const hardCodes = new Set([
      'UNSUPPORTED_PATTERN',
      'INVALID_ENTITY_TYPE',
      'MISSING_REQUIRED_ENTITY_FIELD',
      'ANSWER_TOO_GENERIC',
      'ENTITY_NOT_SEARCHABLE',
    ]);
    const status = issues.length
      ? issues.some((issue) => hardCodes.has(issue.code))
        ? 'REJECTED'
        : 'REPAIRABLE'
      : 'PASS';

    return {
      status,
      issues,
      repairInstructions: issues.map((issue) => issue.message),
    };
  }

  inferPatternId(draft: PreVerificationDraftInput): QuestionPatternId {
    const entityType = this.entityType(draft.assetRequest);
    if (draft.gameMode === 'identifySong') return 'identifySong';
    if (draft.gameMode === 'identifySinger') return 'identifyArtist';
    if (draft.gameMode === 'identifyVoice') return 'identifyVoice';
    if (draft.gameMode === 'timeline') return 'timelineEvent';
    if (draft.gameMode === 'emojiPuzzle') return 'emojiPuzzle';
    if (['weapon'].includes(entityType)) return 'identifyWeapon';
    if (['item'].includes(entityType)) return 'identifyItem';
    if (['boss', 'creature'].includes(entityType)) return 'identifyBoss';
    if (['location', 'place', 'city', 'landmark'].includes(entityType))
      return 'identifyLocation';
    if (['game', 'franchise'].includes(entityType)) return 'identifyGame';
    if (
      draft.gameMode === 'identifyCharacter' ||
      ['character', 'anime-character'].includes(entityType)
    )
      return 'identifyCharacter';
    if (draft.gameMode === 'identifyImage') return 'identifyObject';
    return 'textTrivia';
  }

  private validateEntity(
    profile: CategoryGenerationProfile,
    entity: StructuredEntityCandidate,
    issues: QualityIssue[],
  ) {
    if (
      !profile.allowedEntityTypes.includes(entity.type) &&
      entity.type !== 'unknown'
    ) {
      issues.push({
        code: 'INVALID_ENTITY_TYPE',
        message: `Entity type ${entity.type} is not allowed by profile ${profile.id}`,
        field: 'entity.type',
      });
    }

    const required = profile.requiredFieldsByEntityType[entity.type] ?? [];
    for (const field of required) {
      if (!entity.fields[field]) {
        issues.push({
          code: 'MISSING_REQUIRED_ENTITY_FIELD',
          message: `Missing required entity field: ${field}`,
          field,
        });
      }
    }

    if (required.includes('verificationQuery') && !entity.verificationQuery) {
      issues.push({
        code: 'ENTITY_NOT_SEARCHABLE',
        message: 'Entity requires a usable verification query.',
        field: 'verificationQuery',
      });
    }
  }

  private validateGlobalQuestion(
    profile: CategoryGenerationProfile,
    draft: PreVerificationDraftInput,
    issues: QualityIssue[],
  ) {
    const answer = draft.correctAnswer.trim();
    const question = draft.question.trim();
    if (!answer) {
      issues.push({
        code: 'ANSWER_NOT_UNIQUE',
        message: 'Missing correct answer.',
        field: 'correctAnswer',
      });
    }

    if (
      genericAnswerPatterns.some((pattern) => pattern.test(answer)) ||
      profile.forbiddenAnswerPhrases?.some((phrase) =>
        this.includesNormalized(answer, phrase),
      )
    ) {
      issues.push({
        code: 'ANSWER_TOO_GENERIC',
        message: 'Answer is generic or abstract instead of a concrete entity.',
        field: 'correctAnswer',
      });
    }

    if (
      profile.forbiddenQuestionPhrases?.some((phrase) =>
        this.includesNormalized(question, phrase),
      )
    ) {
      issues.push({
        code: 'MISSING_CONTEXT',
        message: 'Question uses vague framing without enough context.',
        field: 'question',
      });
    }

    if (answer && this.includesNormalized(question, answer)) {
      issues.push({
        code: 'QUESTION_REVEALS_ANSWER',
        message: 'Question appears to reveal the answer.',
        field: 'question',
      });
    }

    if (question.split(/\s+/).filter(Boolean).length < 4) {
      issues.push({
        code: 'MISSING_CONTEXT',
        message: 'Question is too short to be unambiguous.',
        field: 'question',
      });
    }
  }

  private toEntityCandidate(
    draft: PreVerificationDraftInput,
  ): StructuredEntityCandidate | null {
    const request = draft.assetRequest;
    if (!request) return null;
    const type = this.entityType(request) as EntityType;
    const canonicalName =
      this.text(request.canonicalEntity) ||
      this.text(request.entity) ||
      this.text(request.title) ||
      draft.correctAnswer;
    const relatedWork =
      this.text(request.franchise) ||
      this.text(request.gameTitle) ||
      this.text(request.animeTitle) ||
      this.text(request.englishTitle);
    const verificationQuery =
      this.text(request.verificationQuery) ||
      [canonicalName, relatedWork, this.text(request.artist)]
        .filter(Boolean)
        .join(' ');

    return {
      type,
      canonicalName,
      relatedWork,
      verificationQuery,
      fields: {
        canonicalName,
        songTitle: this.text(request.title) || canonicalName,
        artistName: this.text(request.artist),
        animeTitle: this.text(request.animeTitle) || relatedWork,
        gameTitle: this.text(request.gameTitle) || relatedWork,
        franchiseName: this.text(request.franchise),
        relatedWork,
        verificationQuery,
      },
    };
  }

  private entityType(request: AssetRequest | null | undefined): string {
    return this.text(request?.entityType) || 'unknown';
  }

  private text(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private includesNormalized(haystack: string, needle: string): boolean {
    const a = this.normalize(haystack);
    const b = this.normalize(needle);
    return Boolean(a && b && a.includes(b));
  }

  private normalize(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/[ـ\u064b-\u065f\u0670]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ');
  }
}

export const preVerificationQualityValidator =
  new PreVerificationQualityValidator();
