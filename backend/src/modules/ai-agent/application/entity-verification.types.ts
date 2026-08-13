export type VerificationStatus =
  'VERIFIED' | 'PARTIALLY_VERIFIED' | 'REJECTED' | 'UNAVAILABLE';

export type VerificationIssueCode =
  | 'ENTITY_VERIFICATION_REQUIRED'
  | 'ENTITY_VERIFICATION_CACHE_HIT'
  | 'ENTITY_VERIFICATION_SUCCEEDED'
  | 'ENTITY_VERIFICATION_PARTIAL'
  | 'ENTITY_VERIFICATION_REJECTED'
  | 'ENTITY_VERIFICATION_UNAVAILABLE'
  | 'ENTITY_VERIFICATION_TIMEOUT'
  | 'ENTITY_VERIFICATION_INVALID_RESPONSE'
  | 'ENTITY_VERIFICATION_INSUFFICIENT_EVIDENCE'
  | 'ENTITY_VERIFICATION_IDENTITY_MISMATCH'
  | 'ENTITY_VERIFICATION_ANSWER_MISMATCH'
  | 'ENTITY_VERIFICATION_FRANCHISE_MISMATCH'
  | 'ENTITY_VERIFICATION_ARTIST_MISMATCH'
  | 'ENTITY_VERIFICATION_DUPLICATE'
  | 'WIGOLO_TRANSPORT_UNAVAILABLE'
  | 'WIGOLO_OPERATION_FAILED'
  | 'WIGOLO_RESPONSE_INVALID'
  | 'WIGOLO_RESEARCH_LIMIT_REACHED';

export type VerificationEntityType =
  | 'person'
  | 'character'
  | 'anime-character'
  | 'movie'
  | 'series'
  | 'song'
  | 'artist'
  | 'place'
  | 'organization'
  | 'event'
  | 'historical-figure'
  | 'sports-team'
  | 'object'
  | 'concept'
  | 'technique'
  | 'unknown';

export interface EntityVerificationRequest {
  proposedEntity: string;
  proposedAnswer: string;
  entityType: VerificationEntityType;
  categoryName?: string;
  catalogName?: string;
  franchise?: string;
  language: 'ar' | 'en';
  gameMode: string;
  artist?: string;
  country?: string;
  intendedAsset:
    'image' | 'audio' | 'video' | 'voice' | 'song' | 'cover-image' | 'none';
  context?: string;
  locallyGrounded?: boolean;
}

export type EvidenceSourceTier =
  | 'official'
  | 'structured-platform'
  | 'reputable-publication'
  | 'encyclopedic'
  | 'community'
  | 'unknown';

export interface VerifiedEntity {
  verificationStatus: VerificationStatus;
  canonicalEntity: string;
  canonicalAnswer: string;
  entityType: VerificationEntityType;
  aliases: string[];
  originalLanguageAliases: string[];
  transliterations: string[];
  franchise?: string;
  organization?: string;
  song?: {
    title: string;
    artist: string;
    titleAliases: string[];
    artistAliases: string[];
    country?: string;
    releaseYear?: number;
  };
  person?: {
    displayName: string;
    knownFor?: string;
    nationalityOrAssociation?: string;
  };
  confidence: {
    overall: number;
    identity: number;
    answer: number;
    association: number;
  };
  evidence: Array<{
    sourceTitle: string;
    sourceDomain: string;
    sourceTier: EvidenceSourceTier;
    supportsIdentity: boolean;
    supportsAnswer: boolean;
    supportsAssociation: boolean;
  }>;
  searchHints: {
    requiredTerms: string[];
    trustedAliases: string[];
    franchiseTerms: string[];
    providerHints: string[];
    prohibitedGenericTerms: string[];
  };
  issues: VerificationIssueCode[];
  cacheHit?: boolean;
  durationMs?: number;
}

export interface VerificationDiagnostics {
  verificationRequired: boolean;
  verificationProvider: 'wigolo' | 'local-knowledge';
  verificationStatus: VerificationStatus;
  verificationCacheHit: boolean;
  canonicalEntity: string;
  canonicalAnswer: string;
  verifiedAliasesCount: number;
  evidenceSourceCount: number;
  evidenceTierCounts: Partial<Record<EvidenceSourceTier, number>>;
  overallConfidence: number;
  identityConfidence: number;
  answerConfidence: number;
  associationConfidence: number;
  verificationDurationMs: number;
  verificationIssueCodes: VerificationIssueCode[];
  canonicalSongTitle?: string;
  canonicalArtist?: string;
  titleAliasCount?: number;
  artistAliasCount?: number;
  gulfAssociationVerified?: boolean;
  verifiedFranchise?: string;
}
