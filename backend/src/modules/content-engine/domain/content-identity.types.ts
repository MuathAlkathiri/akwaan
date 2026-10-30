import { ChallengeAnswerMode } from '../../world-content/domain/world-content.constants';

/**
 * Three-state identity comparison result approved by product owner:
 * - DISTINCT: Sufficient evidence of materially different gameplay tasks.
 * - DUPLICATE: Sufficient evidence that the same gameplay task is repeated.
 * - POTENTIAL_OVERLAP: Meaningful similarity exists, but deterministic evidence cannot safely resolve it.
 */
export type ContentIdentityComparisonResult =
  'DISTINCT' | 'DUPLICATE' | 'POTENTIAL_OVERLAP';

export type SemanticTargetType =
  | 'discrete_option'
  | 'numeric_value'
  | 'accepted_answers'
  | 'ordered_sequence'
  | 'dish_recipe'
  | 'target_entity'
  | 'unspecified';

export interface SemanticFact {
  /** The core concept or entity being queried (e.g. "اليابان", "برج إيفل"). */
  subject: string;
  /** The property or relationship being tested (e.g. "عاصمة", "موقع"). */
  property: string;
  /** True when the factual relationship was deterministically extracted or provided. */
  isExtracted: boolean;
}

export interface SemanticTarget {
  /** The categorization of target. */
  targetType: SemanticTargetType;
  /** Primary normalized value (via canonical answer normalizer). */
  normalizedValue: string;
  /** Raw authored value before normalization. */
  rawValue?: unknown;
  /** Identified subject or concept entity (e.g. "برج إيفل", "أحمد زويل"). */
  subject?: string;
  /** Extracted or explicit factual relationship. */
  semanticFact?: SemanticFact;
  /** Numeric details when target is numeric (e.g. for closest). */
  numericDetails?: {
    value: number;
    tolerance?: number;
    unit?: string;
  };
  /** Normalized accepted answers when multiple variations are accepted. */
  acceptedAnswers?: string[];
  /** Secondary aliases or synonyms. */
  aliases?: string[];
}

export type CognitiveTaskType =
  | 'fact_recall'
  | 'numeric_estimate'
  | 'odd_one_out'
  | 'clue_deduction'
  | 'clue_progression'
  | 'sequence_ordering'
  | 'wordplay_transformation'
  | 'audio_recognition'
  | 'visual_anomaly_detection'
  | 'recipe_discrimination'
  | 'ranked_selection'
  | 'bluff_prediction'
  | 'subjective_consensus'
  | 'unknown';

export interface CognitiveTask {
  /** What the player is asked to recognize, calculate, deduce, or decide. */
  taskType: CognitiveTaskType;
  /** True when the prompt is a generic stem (e.g. "ما العنصر الدخيل؟"). */
  isGenericStem: boolean;
  /** Normalized prompt text stripped of generic stems. */
  normalizedStemPrompt: string;
  /** Specific cognitive qualification or family hint. */
  detail?: string;
}

export interface MechanicPayloadIdentity {
  /** The answer mode or mechanic key (e.g. 'multiple_choice', 'closest', 'one_clue'). */
  answerMode: ChallengeAnswerMode | string;
  /** Deterministic signature of the mechanic-specific payload structure. */
  structureKey: string;
  /** Order-independent normalized options (for multiple-choice). */
  options?: string[];
  /** Ordered clues where sequence directly dictates difficulty progression. */
  orderedClues?: Array<{
    order: number;
    value?: number;
    text: string;
    mediaKey?: string;
  }>;
  /** Unordered clues. */
  unorderedClues?: string[];
  /** Numeric estimation bounds / target. */
  numericSpec?: {
    value: number;
    tolerance?: number;
  };
  /** Media subject identifiers (independent of CDN host or URL query). */
  mediaSubjectKeys?: string[];
  /** Discrete pieces / assembly parts. */
  pieces?: string[];
  /** Authored ingredients (5 correct, 3 traps for La Tahriqha). */
  ingredients?: {
    correct: string[];
    traps: string[];
  };
  /** Raw payload digest if non-standard. */
  rawPayloadDigest?: string;
}

export interface ContentIdentity {
  /** Optional Scope key (e.g. 'wordplay-letters', 'general-knowledge'). */
  scopeKey?: string;
  /** Optional World key (e.g. 'puzzles', 'cinema'). */
  worldKey?: string;
  /** Dimension 1: Semantic target (answer / subject / solution). */
  semanticTarget: SemanticTarget;
  /** Dimension 2: Cognitive task required of the player. */
  cognitiveTask: CognitiveTask;
  /** Dimension 3: Mechanic payload (relationships, clues, structures). */
  mechanicPayload: MechanicPayloadIdentity;
  /** Canonical deterministic fingerprint. */
  fingerprint: string;
  /** Traceable metadata. */
  metadata?: {
    familyKey?: string;
    tags?: string[];
    source?: string;
    rawPrompt?: string;
    subject?: string;
    entityId?: string;
  };
}

export type ComparisonReasonCode =
  | 'IDENTICAL_GAMEPLAY_TASK'
  | 'SAME_TASK_REWORDED_PROMPT'
  | 'SAME_PUZZLE_REORDERED_OPTIONS'
  | 'SAME_FACT_DIFFERENT_DISTRACTORS'
  | 'SAME_CLUES_REORDERED_PROGRESSION'
  | 'SAME_MEDIA_DIFFERENT_URL'
  | 'SAME_PUZZLE_CONFLICTING_ANSWER'
  | 'DISTINCT_SEMANTIC_TARGET'
  | 'DISTINCT_COGNITIVE_TASK'
  | 'DISTINCT_FACTUAL_RELATIONSHIP'
  | 'DISTINCT_PUZZLE_PAYLOAD'
  | 'DIFFERENT_CLUE_PROGRESSION'
  | 'PARTIAL_CLUE_OVERLAP'
  | 'SAME_TARGET_DIFFERENT_CLUES'
  | 'UNCERTAIN_FACTUAL_RELATIONSHIP'
  | 'CROSS_SCOPE_ADVISORY'
  | 'AMBIGUOUS_EVIDENCE'
  | 'MISSING_SEMANTIC_TARGET'
  | 'MISSING_MECHANIC_PAYLOAD'
  | 'UNSUPPORTED_MECHANIC_COMPARISON';

export interface IdentityDimensionMatch {
  semanticTarget: 'MATCH' | 'MISMATCH' | 'OVERLAP' | 'UNKNOWN';
  cognitiveTask: 'MATCH' | 'MISMATCH' | 'OVERLAP' | 'UNKNOWN';
  mechanicPayload: 'MATCH' | 'MISMATCH' | 'OVERLAP' | 'UNKNOWN';
}

export interface ContentIdentityComparison {
  /** The final deterministic classification. */
  result: ContentIdentityComparisonResult;
  /** Machine-readable reason code. */
  reasonCode: ComparisonReasonCode;
  /** Human-readable explanation in English. */
  explanation: string;
  /** Breakdown across the three dimensions. */
  dimensions: IdentityDimensionMatch;
  /** True when the compared items originate from different Scopes. */
  isCrossScope: boolean;
  /** Optional deterministic similarity ratio (0.0 to 1.0). */
  similarityScore?: number;
  /** Additional debug details. */
  details?: Record<string, unknown>;
}

export interface RawContentItemInput {
  prompt?: { ar?: string; en?: string } | string;
  answerPayload?: {
    mode: ChallengeAnswerMode | string;
    options?: Array<{
      id?: string;
      label?: { ar?: string; en?: string } | string;
    }>;
    correctOptionId?: string;
    correctValue?: number;
    acceptedTolerance?: number;
    acceptedAnswers?: string[];
    splitPayload?: unknown;
    consensusRule?: string;
  };
  mechanicPayload?: Record<string, unknown>;
  media?: {
    type?: string;
    assets?: Array<{
      url?: string;
      title?: string;
      subject?: string;
      label?: string;
      role?: string;
    }>;
  };
  revealMedia?: {
    type?: string;
    assets?: Array<{
      url?: string;
      title?: string;
      subject?: string;
      label?: string;
    }>;
  };
  metadata?: {
    familyKey?: string;
    tags?: string[];
    source?: string;
    notes?: string;
    subject?: string;
    entityId?: string;
  };
  scopeKey?: string;
  worldKey?: string;
}
