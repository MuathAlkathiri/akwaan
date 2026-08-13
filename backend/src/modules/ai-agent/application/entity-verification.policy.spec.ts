import { EntityVerificationPolicy } from './entity-verification.policy';
import type {
  EntityVerificationRequest,
  VerifiedEntity,
} from './entity-verification.types';

const policy = new EntityVerificationPolicy();

const partialEntity = (): VerifiedEntity => ({
  verificationStatus: 'PARTIALLY_VERIFIED',
  canonicalEntity: 'Varys',
  canonicalAnswer: 'Varys',
  entityType: 'character',
  aliases: ['Varys'],
  originalLanguageAliases: [],
  transliterations: [],
  franchise: 'Game of Thrones',
  confidence: {
    overall: 0.6,
    identity: 0.68,
    answer: 0.68,
    association: 0.6,
  },
  evidence: Array.from({ length: 4 }, (_, index) => ({
    sourceTitle: `source ${index}`,
    sourceDomain: 'example.com',
    sourceTier: 'encyclopedic' as const,
    supportsIdentity: true,
    supportsAnswer: true,
    supportsAssociation: true,
  })),
  searchHints: {
    requiredTerms: ['Varys'],
    trustedAliases: ['Varys'],
    franchiseTerms: ['Game of Thrones'],
    providerHints: [],
    prohibitedGenericTerms: [],
  },
  issues: [
    'ENTITY_VERIFICATION_PARTIAL',
    'ENTITY_VERIFICATION_INSUFFICIENT_EVIDENCE',
  ],
});

const request = (
  intendedAsset: EntityVerificationRequest['intendedAsset'],
): EntityVerificationRequest => ({
  proposedEntity: 'Varys',
  proposedAnswer: 'Varys',
  entityType: 'character',
  franchise: 'Game of Thrones',
  language: 'ar',
  gameMode: intendedAsset === 'video' ? 'identifyCharacter' : 'identifyVoice',
  intendedAsset,
});

describe('EntityVerificationPolicy', () => {
  it('permits evidence-backed partial verification for video provider search', () => {
    expect(policy.maySearchProviders(partialEntity(), request('video'))).toBe(
      true,
    );
  });

  it('keeps partial voice provider search blocked', () => {
    expect(policy.maySearchProviders(partialEntity(), request('voice'))).toBe(
      false,
    );
  });
});
