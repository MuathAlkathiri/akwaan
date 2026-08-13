import type {
  GameMode,
  QuestionAssetType,
} from '../contracts/asset-provider.interface';

export const qualityIssueCodes = [
  'QUESTION_AMBIGUOUS',
  'ANSWER_NOT_UNIQUE',
  'ANSWER_TOO_GENERIC',
  'ENTITY_NOT_SEARCHABLE',
  'MISSING_CONTEXT',
  'QUESTION_REVEALS_ANSWER',
  'UNSUPPORTED_PATTERN',
  'INVALID_ENTITY_TYPE',
  'MISSING_REQUIRED_ENTITY_FIELD',
  'CATEGORY_PROFILE_NOT_FOUND',
  'PROFILE_SCHEMA_INVALID',
  'PATTERN_CONSTRAINT_FAILED',
  'DIFFICULTY_MISMATCH',
  'UNNATURAL_WORDING',
  'KNOWLEDGE_GROUNDING_MISSING',
] as const;

export type QualityIssueCode = (typeof qualityIssueCodes)[number];

export type EntityType =
  | 'song'
  | 'artist'
  | 'anime-character'
  | 'character'
  | 'game'
  | 'franchise'
  | 'weapon'
  | 'item'
  | 'boss'
  | 'creature'
  | 'location'
  | 'organization'
  | 'vehicle'
  | 'ability'
  | 'console'
  | 'person'
  | 'event'
  | 'object'
  | 'none'
  | 'unknown';

export type AnswerKind =
  | 'specific-entity'
  | 'proper-noun'
  | 'song-title'
  | 'artist-name'
  | 'location-name'
  | 'item-name'
  | 'year'
  | 'text-fact';

export type CanonicalEntityField =
  | 'canonicalName'
  | 'songTitle'
  | 'artistName'
  | 'animeTitle'
  | 'gameTitle'
  | 'franchiseName'
  | 'relatedWork'
  | 'verificationQuery';

export type QuestionPatternId =
  | 'identifyCharacter'
  | 'identifyPerson'
  | 'identifyVoice'
  | 'identifySong'
  | 'identifyArtist'
  | 'identifyGame'
  | 'identifyWeapon'
  | 'identifyItem'
  | 'identifyBoss'
  | 'identifyLocation'
  | 'identifyObject'
  | 'quoteAttribution'
  | 'timelineEvent'
  | 'relationship'
  | 'ability'
  | 'releaseYear'
  | 'textTrivia'
  | 'emojiPuzzle';

export type ValidationStatus = 'PASS' | 'REPAIRABLE' | 'REJECTED';

export type QualityIssue = {
  code: QualityIssueCode;
  message: string;
  field?: string;
};

export type PreVerificationValidationResult = {
  status: ValidationStatus;
  issues: QualityIssue[];
  repairInstructions: string[];
};

export type StructuredEntityCandidate = {
  type: EntityType;
  canonicalName: string;
  relatedWork?: string;
  fields: Partial<Record<CanonicalEntityField, string>>;
  verificationQuery?: string;
};

export type StructuredGeneratedQuestionDraft = {
  schemaVersion: 1;
  categoryProfileId: string;
  selectedPatternId: QuestionPatternId;
  gameMode: GameMode;
  difficulty: 'easy' | 'medium' | 'hard';
  language: 'ar';
  question: string;
  correctAnswer: string;
  explanation?: string;
  entity: StructuredEntityCandidate | null;
  assetIntent: {
    primary: QuestionAssetType | null;
    cover: QuestionAssetType | null;
  };
  grounding?: {
    knowledgeSourceIds?: string[];
    factualBasis?: string[];
  };
};
