/**
 * Canonical Family Domain Types for Content Engine V2.
 *
 * Content families represent the approved interaction shapes, cognitive tasks,
 * and mechanic-fit classifications defined within Scope profiles (e.g., Puzzles
 * Canonical Family Library V1).
 */

export const MECHANIC_FIT_RATINGS = [
  'EXCELLENT',
  'GOOD',
  'LIMITED',
  'DO_NOT_FORCE',
] as const;
export type MechanicFitRating = (typeof MECHANIC_FIT_RATINGS)[number];

export interface CanonicalFamily {
  /** Stable kebab-case identifier (e.g., 'anagram-rearrange'). */
  familyKey: string;
  /** Player-facing or authoring Arabic name. */
  name: string;
  /** Summary of the interaction shape or concept. */
  description: string;
  /** Primary cognitive solve expected of the player. */
  playerSolve?: string;
  /** The Scope that owns this family (e.g. 'wordplay-letters'). */
  scopeKey: string;
  /** The World that owns this family (e.g. 'puzzles'). */
  worldKey: string;
  /** Linguistic/cognitive modality (e.g. 'morphology-lexical', 'letter-permutation', 'orthography-dots'). */
  modality?: string;
  /** Generation scalability tier (e.g. 'HIGH', 'MEDIUM', 'SPECIALIZED'). */
  scalability?: string;
  /** Canonical ratings per mechanic key. */
  mechanicFit?: Record<string, MechanicFitRating>;
  /** Supported runtime answer modes (e.g. ['multiple_choice']). */
  answerModes?: string[];
  /** Canonical repo-relative path of the profile where this family was declared. */
  source: string;
}

export interface CanonicalFamilyCatalog {
  version: 1;
  worldKey: string;
  scopeKey: string;
  families: CanonicalFamily[];
  /** SHA-256 digest over the canonical normalized representation of families. */
  digest: string;
  /** Canonical repo-relative sources that contributed structured family blocks. */
  structuredSources: string[];
}

export interface ExtractedTableFamily {
  index: number;
  familyKey: string;
  name: string;
  media?: string;
  answerModes?: string[];
  mechanicFit?: Record<string, MechanicFitRating>;
  source: string;
}

export type ParityDriftType =
  | 'MISSING_IN_CATALOG'
  | 'EXTRA_IN_CATALOG'
  | 'RENAMED_IDENTIFIER'
  | 'MECHANIC_FIT_MISMATCH'
  | 'ANSWER_MODES_MISMATCH'
  | 'SOURCE_TABLE_MISMATCH';

export interface FamilyParityDrift {
  type: ParityDriftType;
  familyKey: string;
  detail: string;
  source?: string;
  expected?: unknown;
  actual?: unknown;
}

export interface FamilyParityReport {
  valid: boolean;
  driftCount: number;
  drifts: FamilyParityDrift[];
  tablesFound: number;
  authoritativeFamilyCount: number;
  catalogFamilyCount: number;
  verifiedFields: string[];
  limitations: string[];
}

export class FamilyResolutionError extends Error {
  constructor(
    readonly code: string,
    readonly source: string,
    detail: string,
  ) {
    super(`Family resolution error [${code}] in ${source}: ${detail}`);
  }
}
