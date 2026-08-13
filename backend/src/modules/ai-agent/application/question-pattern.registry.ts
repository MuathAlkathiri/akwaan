import type {
  AnswerKind,
  CanonicalEntityField,
  EntityType,
  QuestionPatternId,
  QualityIssue,
} from './generation-quality.types';
import type {
  GameMode,
  QuestionAssetType,
} from '../contracts/asset-provider.interface';

export type QuestionPatternDefinition = {
  id: QuestionPatternId;
  compatibleEntityTypes: EntityType[];
  supportedGameModes: GameMode[];
  answerKind: AnswerKind;
  requiredEntityFields: CanonicalEntityField[];
  requiredAssetTypes: QuestionAssetType[];
  optionalAssetTypes: QuestionAssetType[];
  verificationRequired: boolean;
  promptTemplateFragment: string;
  validatorRuleIds: string[];
};

const definitions: QuestionPatternDefinition[] = [
  {
    id: 'textTrivia',
    compatibleEntityTypes: ['none', 'unknown', 'object', 'event'],
    supportedGameModes: ['trivia'],
    answerKind: 'text-fact',
    requiredEntityFields: [],
    requiredAssetTypes: [],
    optionalAssetTypes: ['image'],
    verificationRequired: false,
    promptTemplateFragment:
      'Ask one concrete objective trivia question with enough context for one answer.',
    validatorRuleIds: ['global-objective-answer'],
  },
  {
    id: 'identifySong',
    compatibleEntityTypes: ['song'],
    supportedGameModes: ['identifySong'],
    answerKind: 'song-title',
    requiredEntityFields: ['songTitle', 'artistName', 'verificationQuery'],
    requiredAssetTypes: ['audio'],
    optionalAssetTypes: ['image'],
    verificationRequired: true,
    promptTemplateFragment:
      'The primary clue is an audio snippet; the player identifies the song title.',
    validatorRuleIds: ['entity-required', 'music-specific-song-required'],
  },
  {
    id: 'identifyArtist',
    compatibleEntityTypes: ['artist', 'song'],
    supportedGameModes: ['identifySinger'],
    answerKind: 'artist-name',
    requiredEntityFields: ['songTitle', 'artistName', 'verificationQuery'],
    requiredAssetTypes: ['audio'],
    optionalAssetTypes: ['image'],
    verificationRequired: true,
    promptTemplateFragment:
      'The primary clue is a song/audio clue; the player identifies the artist.',
    validatorRuleIds: ['entity-required', 'music-specific-song-required'],
  },
  {
    id: 'identifyVoice',
    compatibleEntityTypes: ['character', 'anime-character', 'person'],
    supportedGameModes: ['identifyVoice'],
    answerKind: 'proper-noun',
    requiredEntityFields: ['canonicalName', 'relatedWork', 'verificationQuery'],
    requiredAssetTypes: ['audio'],
    optionalAssetTypes: [],
    verificationRequired: true,
    promptTemplateFragment:
      'The primary clue is a reliable voice/speech clip; the player identifies the speaker.',
    validatorRuleIds: ['entity-required', 'related-work-required'],
  },
  {
    id: 'identifyCharacter',
    compatibleEntityTypes: ['character', 'anime-character'],
    supportedGameModes: ['identifyCharacter', 'identifyImage'],
    answerKind: 'proper-noun',
    requiredEntityFields: ['canonicalName', 'relatedWork', 'verificationQuery'],
    requiredAssetTypes: [],
    optionalAssetTypes: ['image', 'video'],
    verificationRequired: true,
    promptTemplateFragment:
      'Ask for a concrete character using a specific clue, image, or video.',
    validatorRuleIds: ['entity-required', 'related-work-required'],
  },
  {
    id: 'identifyGame',
    compatibleEntityTypes: ['game'],
    supportedGameModes: ['trivia', 'identifyImage'],
    answerKind: 'proper-noun',
    requiredEntityFields: ['canonicalName', 'verificationQuery'],
    requiredAssetTypes: [],
    optionalAssetTypes: ['image', 'video'],
    verificationRequired: true,
    promptTemplateFragment:
      'Ask for the specific game using a mechanic, location, item, or scene clue.',
    validatorRuleIds: ['entity-required'],
  },
  {
    id: 'identifyWeapon',
    compatibleEntityTypes: ['weapon'],
    supportedGameModes: ['trivia', 'identifyImage'],
    answerKind: 'item-name',
    requiredEntityFields: ['canonicalName', 'gameTitle', 'verificationQuery'],
    requiredAssetTypes: [],
    optionalAssetTypes: ['image', 'video'],
    verificationRequired: true,
    promptTemplateFragment:
      'Ask for a concrete weapon tied to a named game or franchise.',
    validatorRuleIds: ['entity-required', 'game-title-required'],
  },
  {
    id: 'identifyItem',
    compatibleEntityTypes: ['item', 'object'],
    supportedGameModes: ['trivia', 'identifyImage'],
    answerKind: 'item-name',
    requiredEntityFields: ['canonicalName', 'gameTitle', 'verificationQuery'],
    requiredAssetTypes: [],
    optionalAssetTypes: ['image', 'video'],
    verificationRequired: true,
    promptTemplateFragment:
      'Ask for a concrete item/object tied to a named game or franchise.',
    validatorRuleIds: ['entity-required', 'game-title-required'],
  },
  {
    id: 'identifyBoss',
    compatibleEntityTypes: ['boss', 'creature'],
    supportedGameModes: ['trivia', 'identifyCharacter', 'identifyImage'],
    answerKind: 'proper-noun',
    requiredEntityFields: ['canonicalName', 'gameTitle', 'verificationQuery'],
    requiredAssetTypes: [],
    optionalAssetTypes: ['image', 'video'],
    verificationRequired: true,
    promptTemplateFragment: 'Ask for a concrete boss/enemy in a named game.',
    validatorRuleIds: ['entity-required', 'game-title-required'],
  },
  {
    id: 'identifyLocation',
    compatibleEntityTypes: ['location'],
    supportedGameModes: ['trivia', 'identifyImage'],
    answerKind: 'location-name',
    requiredEntityFields: ['canonicalName', 'relatedWork', 'verificationQuery'],
    requiredAssetTypes: [],
    optionalAssetTypes: ['image', 'video'],
    verificationRequired: true,
    promptTemplateFragment:
      'Ask for a concrete place/location tied to a named work.',
    validatorRuleIds: ['entity-required', 'related-work-required'],
  },
  {
    id: 'identifyObject',
    compatibleEntityTypes: ['object', 'item', 'weapon', 'vehicle'],
    supportedGameModes: ['trivia', 'identifyImage'],
    answerKind: 'specific-entity',
    requiredEntityFields: ['canonicalName', 'relatedWork', 'verificationQuery'],
    requiredAssetTypes: [],
    optionalAssetTypes: ['image', 'video'],
    verificationRequired: true,
    promptTemplateFragment:
      'Ask for a concrete object tied to a named work or category context.',
    validatorRuleIds: ['entity-required'],
  },
  {
    id: 'ability',
    compatibleEntityTypes: ['ability'],
    supportedGameModes: ['trivia'],
    answerKind: 'specific-entity',
    requiredEntityFields: ['canonicalName', 'relatedWork', 'verificationQuery'],
    requiredAssetTypes: [],
    optionalAssetTypes: ['image'],
    verificationRequired: true,
    promptTemplateFragment:
      'Ask for a concrete named ability tied to a named work or character.',
    validatorRuleIds: ['entity-required'],
  },
  {
    id: 'timelineEvent',
    compatibleEntityTypes: ['event', 'game', 'franchise'],
    supportedGameModes: ['timeline'],
    answerKind: 'text-fact',
    requiredEntityFields: ['canonicalName'],
    requiredAssetTypes: ['timeline'],
    optionalAssetTypes: [],
    verificationRequired: false,
    promptTemplateFragment: 'Ask one ordering/timeline question.',
    validatorRuleIds: ['global-objective-answer'],
  },
  {
    id: 'emojiPuzzle',
    compatibleEntityTypes: ['game', 'character', 'object'],
    supportedGameModes: ['emojiPuzzle'],
    answerKind: 'proper-noun',
    requiredEntityFields: ['canonicalName'],
    requiredAssetTypes: ['emoji'],
    optionalAssetTypes: [],
    verificationRequired: false,
    promptTemplateFragment: 'Use emoji clues for a concrete answer.',
    validatorRuleIds: ['global-objective-answer'],
  },
];

export class QuestionPatternRegistry {
  private readonly byId = new Map<QuestionPatternId, QuestionPatternDefinition>(
    definitions.map((definition) => [definition.id, definition]),
  );

  all(): QuestionPatternDefinition[] {
    return definitions;
  }

  get(id: QuestionPatternId): QuestionPatternDefinition | undefined {
    return this.byId.get(id);
  }

  validateReferences(ids: readonly QuestionPatternId[]): QualityIssue[] {
    return ids
      .filter((id) => !this.byId.has(id))
      .map((id) => ({
        code: 'UNSUPPORTED_PATTERN',
        message: `Unknown pattern: ${id}`,
        field: 'allowedPatternIds',
      }));
  }
}

export const questionPatternRegistry = new QuestionPatternRegistry();
